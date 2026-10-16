import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { SettingsService } from './settings.service';
import { AllSettings } from './settings.types';
import { IxcClient } from '../ixc/ixc.client';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { MetaClient } from '../meta/meta.client';

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService, private ixc: IxcClient, private chatwoot: ChatwootClient, private meta: MetaClient) {}

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
  async update(@Body() body: Partial<AllSettings>) {
    for (const section of ['ixc', 'chatwoot', 'meta', 'general'] as const) {
      if (body[section]) await this.settings.update(section, body[section]!);
    }
    return this.settings.masked();
  }

  /** Testa as conexões com os valores salvos. */
  @Roles(Role.ADMIN)
  @Post('test')
  async test(@Body() body: { target: 'ixc' | 'chatwoot' | 'meta' }) {
    const all = await this.settings.all();
    try {
      if (body.target === 'ixc') return await this.ixc.test(all.ixc);
      if (body.target === 'chatwoot') return await this.chatwoot.test(all.chatwoot);
      return await this.meta.test(all.meta);
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
