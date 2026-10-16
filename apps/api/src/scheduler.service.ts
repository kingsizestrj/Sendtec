import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CampaignRunner } from './campaigns/campaign-runner.service';
import { TemplatesService } from './templates/templates.service';
import { SettingsService } from './settings/settings.service';
import { RecipientStatusService } from './campaigns/recipient-status.service';

/**
 * Tarefas periódicas:
 *  - inicia campanhas agendadas
 *  - acompanha entregas/leituras das mensagens no Chatwoot
 *  - acompanha a aprovação dos modelos na Meta (a cada 2 min se houver pendentes, senão a cada 30 min)
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timers: NodeJS.Timeout[] = [];
  private lastTemplateSync = 0;

  constructor(
    private prisma: PrismaService,
    private runner: CampaignRunner,
    private templates: TemplatesService,
    private settings: SettingsService,
    private statuses: RecipientStatusService,
  ) {}

  async onApplicationBootstrap() {
    await this.runner.recover();
    this.timers.push(setInterval(() => this.tickCampaigns().catch((e) => this.logger.error(e.message)), 20_000));
    this.timers.push(setInterval(() => this.tickTemplates().catch((e) => this.logger.warn(e.message)), 60_000));
    // entregas e leituras: confere no Chatwoot a cada minuto (independe do webhook)
    this.timers.push(setInterval(() => this.statuses.poll().catch((e) => this.logger.warn(e.message)), 60_000));
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  private async tickCampaigns() {
    const due = await this.prisma.campaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } } });
    for (const c of due) {
      this.logger.log(`Iniciando campanha agendada: ${c.name}`);
      await this.prisma.campaign.update({ where: { id: c.id }, data: { status: 'RUNNING' } });
      this.runner.launch(c.id);
    }
  }

  private async tickTemplates() {
    const meta = await this.settings.get('meta');
    if (!meta.wabaId || !meta.accessToken) return;
    const every = (await this.templates.hasPending()) ? 2 * 60_000 : 30 * 60_000;
    if (Date.now() - this.lastTemplateSync < every) return;
    this.lastTemplateSync = Date.now();
    await this.templates.sync();
  }
}
