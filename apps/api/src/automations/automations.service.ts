import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AudienceService, AudienceSpec } from '../ixc/audience.service';
import { CampaignRunner } from '../campaigns/campaign-runner.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { VariablesConfig } from '../campaigns/variables.service';
import { zonedNow } from '../common/time';

export interface StepInput {
  id?: string;
  name: string;
  time: string;
  templateId: string;
  savedAudienceId?: string | null;
  audience?: AudienceSpec;
  variables: VariablesConfig;
  headerMediaUrl?: string | null;
  cooldownDays?: number;
}

export interface AutomationInput {
  name: string;
  active?: boolean;
  weekdays: number[];
  steps: StepInput[];
}

const include = {
  steps: { orderBy: { position: 'asc' as const }, include: { template: { select: { name: true, status: true, category: true } }, savedAudience: { select: { name: true } } } },
  createdBy: { select: { name: true } },
};

/**
 * Réguas automáticas: cada etapa roda uma vez por dia, no horário dela (fuso de Configurações),
 * nos dias da semana escolhidos. Cada execução vira uma campanha com o público recalculado no IXC.
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);
  private ticking = false;

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private audience: AudienceService,
    private runner: CampaignRunner,
    private campaigns: CampaignsService,
  ) {}

  private async now() {
    const { timezone } = await this.settings.get('general');
    return zonedNow(timezone || 'America/Sao_Paulo');
  }

  list() {
    return this.prisma.automation.findMany({ orderBy: { createdAt: 'desc' }, include });
  }

  async get(id: string) {
    const a = await this.prisma.automation.findUnique({ where: { id }, include });
    if (!a) throw new NotFoundException('Régua não encontrada');
    return a;
  }

  /** Últimas execuções (campanhas criadas pela régua). */
  async history(id: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { automationId: id },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, name: true, status: true, createdAt: true, automationStepId: true },
    });
    const grouped = await this.prisma.campaignRecipient.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: true });
    return campaigns.map((c) => ({ ...c, counts: Object.fromEntries(grouped.filter((g) => g.campaignId === c.id).map((g) => [g.status, g._count])) }));
  }

  private async validate(input: AutomationInput) {
    if (!input.name?.trim()) throw new BadRequestException('Dê um nome para a régua');
    if (!input.weekdays?.length) throw new BadRequestException('Escolha ao menos um dia da semana');
    if (!input.steps?.length) throw new BadRequestException('Adicione ao menos uma etapa');
    for (const [i, s] of input.steps.entries()) {
      const label = `Etapa ${i + 1}${s.name ? ` (${s.name})` : ''}`;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time ?? '')) throw new BadRequestException(`${label}: horário inválido`);
      if (!s.savedAudienceId && !(s.audience?.filters?.length || s.audience?.areas?.length)) {
        throw new BadRequestException(`${label}: defina filtros ou escolha um público salvo (sem filtros a etapa iria para todos os clientes todo dia)`);
      }
      if (s.audience?.source === 'csv') throw new BadRequestException(`${label}: réguas usam filtros do IXC ou público salvo, não planilha`);
      try {
        await this.campaigns.validate({ name: s.name || label, templateId: s.templateId, audience: s.audience ?? ({ filters: [], areas: [], excludedClientIds: [] } as AudienceSpec), variables: s.variables });
      } catch (e: any) {
        throw new BadRequestException(`${label}: ${e.message}`);
      }
    }
  }

  /** Etapas cujo horário já passou hoje não disparam no momento em que a régua é salva/ativada. */
  private async initialRunDate(time: string, current?: string | null) {
    const now = await this.now();
    return time <= now.time ? now.date : (current === now.date ? null : current ?? null);
  }

  async save(id: string | null, input: AutomationInput, userId: string) {
    await this.validate(input);
    const data = { name: input.name.trim(), weekdays: [...new Set(input.weekdays)].sort(), active: !!input.active };
    const automation = id
      ? await this.prisma.automation.update({ where: { id }, data })
      : await this.prisma.automation.create({ data: { ...data, createdById: userId } });

    const existing = await this.prisma.automationStep.findMany({ where: { automationId: automation.id } });
    const keep = new Set(input.steps.map((s) => s.id).filter(Boolean));
    await this.prisma.automationStep.deleteMany({ where: { automationId: automation.id, id: { notIn: [...keep] as string[] } } });
    for (const [position, s] of input.steps.entries()) {
      const prev = existing.find((e) => e.id === s.id);
      const stepData = {
        position,
        name: s.name?.trim() || `Etapa ${position + 1}`,
        time: s.time,
        templateId: s.templateId,
        savedAudienceId: s.savedAudienceId || null,
        audience: (s.audience ?? { filters: [], areas: [], excludedClientIds: [] }) as unknown as Prisma.InputJsonValue,
        variables: s.variables as unknown as Prisma.InputJsonValue,
        headerMediaUrl: s.headerMediaUrl || null,
        cooldownDays: Math.max(0, Math.min(365, Number(s.cooldownDays ?? 7))),
        lastRunDate: await this.initialRunDate(s.time, prev?.lastRunDate),
      };
      if (prev) await this.prisma.automationStep.update({ where: { id: prev.id }, data: stepData });
      else await this.prisma.automationStep.create({ data: { ...stepData, automationId: automation.id } });
    }
    return this.get(automation.id);
  }

  async setActive(id: string, active: boolean) {
    const a = await this.get(id);
    if (active) {
      for (const s of a.steps) await this.prisma.automationStep.update({ where: { id: s.id }, data: { lastRunDate: await this.initialRunDate(s.time, s.lastRunDate) } });
    }
    await this.prisma.automation.update({ where: { id }, data: { active } });
    return this.get(id);
  }

  async remove(id: string) {
    await this.prisma.automation.delete({ where: { id } });
    return { ok: true };
  }

  /** Chamado a cada minuto pelo agendador. */
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = await this.now();
      const due = await this.prisma.automationStep.findMany({
        where: {
          automation: { active: true, weekdays: { has: now.weekday } },
          time: { lte: now.time },
          OR: [{ lastRunDate: null }, { lastRunDate: { not: now.date } }],
        },
        include: { automation: true, template: true, savedAudience: true },
        orderBy: [{ time: 'asc' }, { position: 'asc' }],
      });
      for (const step of due) await this.runStep(step.id, now);
    } finally {
      this.ticking = false;
    }
  }

  /** Executa uma etapa agora (também usado pelo botão "Rodar agora"). */
  async runStep(stepId: string, now?: { date: string; label: string }) {
    now = now ?? (await this.now());
    const step = await this.prisma.automationStep.findUniqueOrThrow({ where: { id: stepId }, include: { automation: true, template: true, savedAudience: true } });
    // marca antes de rodar: se algo falhar, não tenta de novo a cada minuto
    await this.prisma.automationStep.update({ where: { id: step.id }, data: { lastRunDate: now.date } });
    const finish = async (lastResult: string) => {
      await this.prisma.automationStep.update({ where: { id: step.id }, data: { lastResult: `${now!.label} · ${lastResult}` } });
      this.logger.log(`Régua "${step.automation.name}" / ${step.name}: ${lastResult}`);
      return { result: lastResult };
    };
    try {
      if (step.template.status !== 'APPROVED') return finish(`não rodou: modelo ${step.template.name} não está aprovado`);
      const spec = (step.savedAudience?.audience ?? step.audience) as unknown as AudienceSpec;
      const preview = await this.audience.resolve(spec, { refresh: true });
      if (!preview.selected.length) return finish('nenhum cliente encontrado');
      const campaign = await this.prisma.campaign.create({
        data: {
          name: `${step.automation.name} · ${step.name} · ${now.label}`,
          status: 'RUNNING',
          templateId: step.templateId,
          audience: spec as unknown as Prisma.InputJsonValue,
          variables: step.variables as Prisma.InputJsonValue,
          headerMediaUrl: step.headerMediaUrl,
          respectOptOut: true,
          startedAt: new Date(),
          createdById: step.automation.createdById,
          automationId: step.automationId,
          automationStepId: step.id,
        },
      });
      this.runner.launch(campaign.id);
      return finish(`campanha criada para ${preview.selected.length.toLocaleString('pt-BR')} cliente(s)`);
    } catch (e: any) {
      return finish(`erro: ${String(e.message).slice(0, 200)}`);
    }
  }
}
