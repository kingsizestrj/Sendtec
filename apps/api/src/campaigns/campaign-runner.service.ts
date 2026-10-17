import { Injectable, Logger } from '@nestjs/common';
import { Campaign, Prisma, Template } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { SettingsService } from '../settings/settings.service';
import { AudienceService, AudienceSpec } from '../ixc/audience.service';
import { MediaService } from '../media/media.service';
import { RoteirosService } from '../roteiros/roteiros.service';
import { VariablesConfig, VariablesService } from './variables.service';
import { componentsInfo, renderText } from '../templates/template-utils';
import { sleep } from '../common/text';
import { normalizeBrPhone } from '../common/phone';
import { IxcRecord } from '../ixc/ixc.client';

const BATCH = 50;

function slug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Executa campanhas em segundo plano, no mesmo processo da API.
 * Cada campanha roda em um laço próprio, respeitando a taxa de envio configurada,
 * e para sozinha quando é pausada/cancelada.
 */
@Injectable()
export class CampaignRunner {
  private readonly logger = new Logger(CampaignRunner.name);
  private running = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private chatwoot: ChatwootClient,
    private settings: SettingsService,
    private audience: AudienceService,
    private variables: VariablesService,
    private media: MediaService,
    private roteiros: RoteirosService,
  ) {}

  isRunning(id: string) {
    return this.running.has(id);
  }

  /** Congela o público da campanha (lista de destinatários) a partir do IXC. */
  async materialize(campaign: Campaign & { template: Template }) {
    if ((await this.prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })) > 0) return;
    const result = await this.audience.resolve(campaign.audience as unknown as AudienceSpec, { refresh: true });
    const checkOptOut = campaign.respectOptOut || campaign.template.category === 'MARKETING';
    const optedOut = checkOptOut
      ? new Set((await this.prisma.optOut.findMany({ select: { phone: true } })).map((o) => o.phone))
      : new Set<string>();

    // régua: não reenviar a mesma etapa para quem recebeu há menos de N dias
    const recent = new Set<string>();
    let cooldown = 0;
    if (campaign.automationStepId) {
      const step = await this.prisma.automationStep.findUnique({ where: { id: campaign.automationStepId } });
      cooldown = step?.cooldownDays ?? 0;
      if (cooldown > 0) {
        const since = new Date(Date.now() - cooldown * 24 * 3600 * 1000);
        const rows = await this.prisma.campaignRecipient.findMany({
          where: {
            sentAt: { gte: since },
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            campaign: { automationStepId: campaign.automationStepId, id: { not: campaign.id } },
          },
          select: { phone: true },
        });
        rows.forEach((r) => recent.add(r.phone));
      }
    }

    const rows: Prisma.CampaignRecipientCreateManyInput[] = result.selected.map((c) => {
      const out = optedOut.has(c.phone!);
      const repeated = !out && recent.has(c.phone!);
      return {
        campaignId: campaign.id,
        ixcClientId: c.id,
        name: c.name,
        phone: c.phone!,
        latitude: c.lat,
        longitude: c.lng,
        clientData: result.raw.get(c.id) as unknown as Prisma.InputJsonValue,
        status: out || repeated ? 'SKIPPED' : 'PENDING',
        error: out
          ? 'Cliente pediu para não receber mensagens (opt-out)'
          : repeated
            ? `Já recebeu esta etapa da régua nos últimos ${cooldown} dia(s)`
            : null,
      };
    });
    for (let i = 0; i < rows.length; i += 1000) {
      await this.prisma.campaignRecipient.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
    }
    this.logger.log(`Campanha ${campaign.name}: ${rows.length} destinatários`);
  }

  /** Inicia (ou retoma) a execução. Não bloqueia: roda em segundo plano. */
  launch(campaignId: string) {
    if (this.running.has(campaignId)) return;
    this.running.add(campaignId);
    this.run(campaignId)
      .catch(async (e) => {
        this.logger.error(`Campanha ${campaignId} falhou: ${e.message}`);
        // updateMany não falha se a campanha foi excluída no meio do envio
        await this.prisma.campaign
          .updateMany({ where: { id: campaignId }, data: { status: 'FAILED', error: String(e.message).slice(0, 500), finishedAt: new Date() } })
          .catch((err) => this.logger.error(`Não foi possível marcar a campanha ${campaignId} como falha: ${err.message}`));
      })
      .finally(() => this.running.delete(campaignId));
  }

  private async run(campaignId: string) {
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { template: true } });
    if (campaign.template.status !== 'APPROVED') throw new Error(`O modelo ${campaign.template.name} não está aprovado (${campaign.template.status})`);
    // sem roteiro gravado o cliente que responder cai no atendimento normal: não dispara
    if (campaign.script) await this.roteiros.syncCampaign(campaignId, true);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'RUNNING', startedAt: campaign.startedAt ?? new Date(), error: null },
    });
    await this.ensureTemplateInChatwoot(campaign.template);
    await this.materialize(campaign);

    const general = await this.settings.get('general');
    const cw = await this.settings.get('chatwoot');
    const rate = Math.max(0.2, Number(general.sendRatePerSecond) || 5);
    const interval = 1000 / rate;
    const label = `${cw.labelPrefix || 'campanha'}-${campaign.code ?? slug(campaign.name)}`;
    const headerUrl = await this.headerUrlFor(campaign.template, campaign.headerMediaUrl);

    for (;;) {
      const current = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (current?.status !== 'RUNNING') {
        this.logger.log(`Campanha ${campaign.name} interrompida (${current?.status})`);
        return;
      }
      const batch = await this.prisma.campaignRecipient.findMany({
        where: { campaignId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
      });
      if (!batch.length) break;

      for (const r of batch) {
        const started = Date.now();
        await this.sendOne(campaign, r.id, headerUrl, label);
        const wait = interval - (Date.now() - started);
        if (wait > 0) await sleep(wait);
      }
    }

    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', finishedAt: new Date() } });
    this.logger.log(`Campanha ${campaign.name} concluída`);
    await this.notifyFinished(campaignId, campaign.name).catch((e) => this.logger.warn(`Aviso de conclusão não enviado: ${e.message}`));
  }

  /**
   * O Chatwoot só monta a mensagem se o modelo estiver na lista sincronizada da caixa.
   * Pede a sincronização e aguarda até ~1 min; se o modelo não aparecer, a campanha não começa.
   */
  async ensureTemplateInChatwoot(template: Template) {
    const has = (list: { name: string; language: string }[]) => list.some((t) => t.name === template.name && t.language === template.language);

    let list = await this.chatwoot.inboxTemplates();
    if (list === null) {
      this.logger.warn('Não foi possível ler os modelos da caixa do Chatwoot; seguindo sem verificar');
      return;
    }
    if (has(list)) return;

    this.logger.log(`Modelo ${template.name} ainda não está no Chatwoot; pedindo sincronização`);
    const synced = await this.chatwoot.syncTemplates();
    for (let i = 0; synced && i < 12; i++) {
      await sleep(5000);
      list = (await this.chatwoot.inboxTemplates()) ?? [];
      if (has(list)) return;
    }
    throw new Error(
      `O modelo "${template.name}" ainda não está disponível no Chatwoot. ` +
        'Clique em "Sincronizar modelos" na caixa do WhatsApp no Chatwoot, aguarde ele aparecer e clique em Retomar.',
    );
  }

  /** URL da imagem do cabeçalho: a da campanha ou, se não houver, a cadastrada no modelo. */
  async headerUrlFor(template: Template, override?: string | null): Promise<string | null> {
    const info = componentsInfo(template.components as any[]);
    if (info.headerFormat !== 'IMAGE') return null;
    const url = override || (template.headerMediaId ? await this.media.publicUrl(template.headerMediaId) : null);
    if (!url) throw new Error('O modelo tem imagem no cabeçalho: informe a imagem da campanha');
    if (!/^https?:\/\//.test(url)) {
      throw new Error('Configure a "URL pública do Sendtec" em Configurações: a Meta precisa baixar a imagem do cabeçalho por ela');
    }
    return url;
  }

  /**
   * Monta e envia a mensagem de um modelo para um telefone, pelo Chatwoot.
   * Usado tanto no disparo da campanha quanto no envio de teste — assim o teste sai idêntico.
   */
  async deliver(opts: {
    template: Template;
    variables: VariablesConfig;
    clientData: IxcRecord;
    phone: string;
    name: string;
    ixcId: string;
    headerUrl: string | null;
    labels: string[];
    attributes: Record<string, unknown>;
  }) {
    const info = componentsInfo(opts.template.components as any[]);
    const cw = await this.settings.get('chatwoot');
    const params = await this.variables.resolve(opts.variables, opts.clientData);
    for (let i = 1; i <= info.bodyVars; i++) {
      if (!params.body[String(i)]) throw new Error(`Variável {{${i}}} ficou vazia para este cliente`);
    }
    const processed: Record<string, unknown> = cw.legacyParams
      ? { ...params.body }
      : {
          body: params.body,
          ...(info.headerFormat === 'IMAGE' && opts.headerUrl ? { header: { media_url: opts.headerUrl, media_type: 'image' } } : {}),
          ...(info.dynamicUrlButtons.length
            ? { buttons: info.dynamicUrlButtons.map((idx) => ({ type: 'url', parameter: params.buttons[String(idx)] ?? '' })) }
            : {}),
        };

    const { contactId, sourceId } = await this.chatwoot.ensureContact(opts.phone, opts.name, opts.ixcId);
    const conversationId = await this.chatwoot.createConversation(contactId, sourceId, opts.attributes);
    if (opts.labels.length) await this.chatwoot.addLabels(conversationId, opts.labels);
    const text = renderText(info.bodyText, params.body);
    const message = await this.chatwoot.sendTemplate(conversationId, text, {
      name: opts.template.name,
      category: opts.template.category,
      language: opts.template.language,
      processed_params: processed,
    });
    return { params, contactId, conversationId, message, text };
  }

  private async sendOne(campaign: Campaign & { template: Template }, recipientId: string, headerUrl: string | null, label: string) {
    const r = await this.prisma.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'SENDING' } });
    try {
      const { params, contactId, conversationId, message } = await this.deliver({
        template: campaign.template,
        variables: campaign.variables as unknown as VariablesConfig,
        clientData: (r.clientData ?? { id: r.ixcClientId, razao: r.name }) as IxcRecord,
        phone: r.phone,
        name: r.name,
        ixcId: r.ixcClientId,
        headerUrl,
        labels: [label],
        attributes: { sendtec_campaign: campaign.name, ixc_id: r.ixcClientId },
      });
      await this.prisma.campaignRecipient.update({
        where: { id: r.id },
        data: {
          status: message.status === 'failed' ? 'FAILED' : 'SENT',
          params: params as unknown as Prisma.InputJsonValue,
          chatwootContactId: contactId,
          chatwootConversationId: conversationId,
          chatwootMessageId: message.id,
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (e: any) {
      await this.prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'FAILED', error: String(e.message).slice(0, 500) } });
    }
  }

  private async notifyFinished(campaignId: string, name: string) {
    // execuções de régua não geram aviso (rodam todo dia; o histórico fica na página da régua)
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { automationId: true } });
    if (c?.automationId) return;
    const grouped = await this.prisma.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: true });
    const n = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
    const sent = n('SENT') + n('DELIVERED') + n('READ');
    const fmt = (v: number) => v.toLocaleString('pt-BR');
    await this.notify(
      `a campanha "${name}" terminou com ${fmt(sent)} enviadas, ${fmt(n('FAILED'))} falhas e ${fmt(n('SKIPPED'))} ignoradas`,
    );
  }

  /** Avisos para os administradores, por WhatsApp, usando o modelo de aviso escolhido em Configurações. */
  async notify(text: string): Promise<{ sent: number; errors: string[] }> {
    const general = await this.settings.get('general');
    const phones = (general.notifyPhones ?? []).map((p) => normalizeBrPhone(p)).filter(Boolean) as string[];
    if (!phones.length || !general.notifyTemplateId) return { sent: 0, errors: ['Configure os telefones e o modelo de aviso'] };
    const template = await this.prisma.template.findUnique({ where: { id: general.notifyTemplateId } });
    if (!template || template.status !== 'APPROVED') return { sent: 0, errors: ['O modelo de aviso não está aprovado pela Meta'] };
    const value = text.replace(/\s+/g, ' ').slice(0, 900); // a Meta não aceita quebras de linha nos parâmetros
    const headerUrl = await this.headerUrlFor(template).catch(() => null);
    const errors: string[] = [];
    let sent = 0;
    for (const phone of phones) {
      try {
        await this.deliver({
          template,
          variables: { body: { '1': { source: 'fixo', value } } },
          clientData: { id: 'aviso', razao: 'Sendtec' } as IxcRecord,
          phone,
          name: 'Avisos do Sendtec',
          ixcId: 'aviso',
          headerUrl,
          labels: ['sendtec-aviso'],
          attributes: { sendtec_campaign: 'Aviso do Sendtec' },
        });
        sent++;
      } catch (e: any) {
        errors.push(`${phone}: ${e.message}`);
      }
    }
    return { sent, errors };
  }

  /** Após reinício do servidor: destrava envios interrompidos e retoma campanhas em andamento. */
  async recover() {
    await this.prisma.campaignRecipient.updateMany({
      where: { status: 'SENDING' },
      data: { status: 'FAILED', error: 'Envio interrompido por reinício do servidor — confira a conversa no Chatwoot' },
    });
    const running = await this.prisma.campaign.findMany({ where: { status: 'RUNNING' }, select: { id: true } });
    running.forEach((c) => this.launch(c.id));
  }
}
