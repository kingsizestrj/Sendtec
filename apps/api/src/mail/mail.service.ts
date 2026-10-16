import { BadRequestException, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';
import { SmtpSettings } from '../settings/settings.types';

@Injectable()
export class MailService {
  constructor(private settings: SettingsService) {}

  private transport(cfg: SmtpSettings) {
    if (!cfg.host || !cfg.from) throw new BadRequestException('Configure o servidor de e-mail (SMTP) em Configurações');
    return nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port) || 587,
      secure: !!cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async configured() {
    const cfg = await this.settings.get('smtp');
    return !!(cfg.host && cfg.from);
  }

  async send(to: string, subject: string, html: string, text: string) {
    const cfg = await this.settings.get('smtp');
    await this.transport(cfg).sendMail({ from: cfg.from, to, subject, html, text });
  }

  async test(cfg: SmtpSettings) {
    await this.transport(cfg).verify();
    return { ok: true };
  }
}
