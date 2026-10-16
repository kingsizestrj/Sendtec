import { Injectable, Logger } from '@nestjs/common';
import { Campaign, Prisma, Template } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { SettingsService } from '../settings/settings.service';
import { AudienceService, AudienceSpec } from '../ixc/audience.service';
import { MediaService } from '../media/media.service';
import { VariablesConfig, VariablesService } from './variables.service';
import { componentsInfo, renderText } from '../templates/template-utils';
import { sleep } from '../common/text';
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

    const rows: Prisma.CampaignRecipientCreateManyInput[] = result.selected.map((c) => {
      const out = optedOut.has(c.phone!);
      return {
        campaignId: campaign.id,
        ixcClientId: c.id,
        name: c.name,
        phone: c.phone!,
        latitude: c.lat,
        longitude: c.lng,
        clientData: result.raw.get(c.id) as unknown as Prisma.InputJsonValue,
        status: out ? 'SKIPPED' : 'PENDING',
        error: out ? 'Cliente pediu para não receber mensagens (opt-out)' : null,
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
        await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'FAILED', error: e.message, finishedAt: new Date() } });
      })
      .finally(() => this.running.delete(campaignId));
  }

  private async run(campaignId: string) {
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { template: true } });
    if (campaign.template.status !== 'APPROVED') throw new Error(`O modelo ${campaign.template.name} não está aprovado (${campaign.template.status})`);

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
    const info = componentsInfo(campaign.template.components as any[]);
    const label = `${cw.labelPrefix || 'campanha'}-${slug(campaign.name)}`;
    let headerUrl = campaign.headerMediaUrl;
    if (!headerUrl && info.headerFormat === 'IMAGE' && campaign.template.headerMediaId) {
      headerUrl = await this.media.publicUrl(campaign.template.headerMediaId);
    }
    if (info.headerFormat === 'IMAGE' && !headerUrl) throw new Error('O modelo tem imagem no cabeçalho: informe a imagem da campanha');
    if (info.headerFormat === 'IMAGE' && !/^https?:\/\//.test(headerUrl!)) {
      throw new Error('Configure a "URL pública do Sendtec" em Configurações: a Meta precisa baixar a imagem do cabeçalho por ela');
    }

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
        await this.sendOne(campaign, r.id, info, headerUrl, label);
        const wait = interval - (Date.now() - started);
        if (wait > 0) await sleep(wait);
      }
    }

    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED', finishedAt: new Date() } });
    this.logger.log(`Campanha ${campaign.name} concluída`);
  }

  /**
   * O Chatwoot só monta a mensagem se o modelo estiver na lista sincronizada da caixa.
   * Pede a sincronização e aguarda até ~1 min; se o modelo não aparecer, a campanha não começa.
   */
  private async ensureTemplateInChatwoot(template: Template) {
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

  private async sendOne(
    campaign: Campaign & { template: Template },
    recipientId: string,
    info: ReturnType<typeof componentsInfo>,
    headerUrl: string | null,
    label: string,
  ) {
    const r = await this.prisma.campaignRecipient.update({ where: { id: recipientId }, data: { status: 'SENDING' } });
    try {
      const cw = await this.settings.get('chatwoot');
      const params = await this.variables.resolve(campaign.variables as unknown as VariablesConfig, (r.clientData ?? { id: r.ixcClientId, razao: r.name }) as IxcRecord);
      for (let i = 1; i <= info.bodyVars; i++) {
        if (!params.body[String(i)]) throw new Error(`Variável {{${i}}} ficou vazia para este cliente`);
      }

      const processed: Record<string, unknown> = cw.legacyParams
        ? { ...params.body }
        : {
            body: params.body,
            ...(info.headerFormat === 'IMAGE' && headerUrl ? { header: { media_url: headerUrl, media_type: 'image' } } : {}),
            ...(info.dynamicUrlButtons.length
              ? { buttons: info.dynamicUrlButtons.map((idx) => ({ type: 'url', parameter: params.buttons[String(idx)] ?? '' })) }
              : {}),
          };

      const { contactId, sourceId } = await this.chatwoot.ensureContact(r.phone, r.name, r.ixcClientId);
      const conversationId = await this.chatwoot.createConversation(contactId, sourceId, {
        sendtec_campaign: campaign.name,
        ixc_id: r.ixcClientId,
      });
      await this.chatwoot.addLabels(conversationId, [label]);
      const message = await this.chatwoot.sendTemplate(conversationId, renderText(info.bodyText, params.body), {
        name: campaign.template.name,
        category: campaign.template.category,
        language: campaign.template.language,
        processed_params: processed,
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
