import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CampaignRunner } from '../campaigns/campaign-runner.service';
import { SettingsService } from './settings.service';
import { AllSettings } from './settings.types';
import { IxcClient } from '../ixc/ixc.client';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { MetaClient } from '../meta/meta.client';

@Controller('settings')
export class SettingsController {
  constructor(
    private settings: SettingsService,
    private ixc: IxcClient,
    private chatwoot: ChatwootClient,
    private meta: MetaClient,
    private audit: AuditService,
    private mail: MailService,
    private runner: CampaignRunner,
  ) {}

  /** Configurações públicas para qualquer usuário logado (nome da empresa, mapa). */
  @Get('general')
  async general() {
    const g = await this.settings.get('general');
    return { companyName: g.companyName, mapCenter: g.mapCenter };
  }

  @Roles(Role.ADMIN)
  @Get()
  get() {
    return this.settings.masked();
  }

  @Roles(Role.ADMIN)
  @Put()
  async update(@Body() body: Partial<AllSettings>, @CurrentUser() user: AuthUser) {
    const before = await this.settings.masked();
    const changed: string[] = [];
    for (const section of ['ixc', 'chatwoot', 'meta', 'general', 'smtp', 'lgpd'] as const) {
      if (!body[section]) continue;
      await this.settings.update(section, body[section]!);
      if (JSON.stringify((await this.settings.masked())[section]) !== JSON.stringify(before[section])) changed.push(section);
    }
    // registra só quais seções mudaram (nunca os valores, que podem ser tokens)
    if (changed.length) await this.audit.log(user, 'Alterou configurações', 'configuracoes', null, { secoes: changed });
    return this.settings.masked();
  }

  /** Testa as conexões com os valores salvos. */
  @Roles(Role.ADMIN)
  @Post('test')
  async test(@Body() body: { target: 'ixc' | 'chatwoot' | 'meta' | 'smtp' | 'notify'; email?: string }, @CurrentUser() user: AuthUser) {
    const all = await this.settings.all();
    try {
      if (body.target === 'smtp') {
        await this.mail.test(all.smtp);
        if (body.email) await this.mail.send(body.email, 'Teste do Sendtec', '<p>O envio de e-mails do Sendtec está funcionando. ✅</p>', 'O envio de e-mails do Sendtec está funcionando.');
        return { ok: true };
      }
      if (body.target === 'notify') {
        const r = await this.runner.notify(`teste de aviso enviado por ${user.name}`);
        return r.sent ? { ok: true, sent: r.sent, errors: r.errors } : { ok: false, error: r.errors.join('; ') };
      }
      if (body.target === 'ixc') return await this.ixc.test(all.ixc);
      if (body.target === 'chatwoot') return await this.chatwoot.test(all.chatwoot);
      return await this.meta.test(all.meta);
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
