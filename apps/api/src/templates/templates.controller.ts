import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { CreateTemplateInput, TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private templates: TemplatesService, private audit: AuditService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post()
  async create(@Body() body: CreateTemplateInput, @CurrentUser() user: AuthUser) {
    const t = await this.templates.create(body);
    await this.audit.log(user, 'Criou modelo e enviou para a Meta', 'modelo', t.id, { modelo: t.name, categoria: t.category });
    return t;
  }

  /** Cria o modelo de utilidade usado nos avisos de campanha concluída. */
  @Roles(Role.ADMIN)
  @Post('notify-template')
  async notifyTemplate(@CurrentUser() user: AuthUser) {
    const t = await this.templates.create({
      name: 'sendtec_aviso',
      language: 'pt_BR',
      category: 'UTILITY',
      header: { type: 'NONE' },
      body: {
        text: 'Aviso do Sendtec: {{1}}. Acesse o painel para ver os detalhes.',
        examples: ['a campanha "Upgrade 1 Giga" terminou com 3.210 enviadas, 12 falhas e 4 ignoradas'],
      },
    });
    await this.audit.log(user, 'Criou o modelo de avisos do Sendtec', 'modelo', t.id, { modelo: t.name });
    return t;
  }

  @Post('sync')
  sync() {
    return this.templates.sync();
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const t = await this.templates.get(id);
    const r = await this.templates.remove(id);
    await this.audit.log(user, 'Excluiu modelo', 'modelo', id, { modelo: t.name });
    return r;
  }
}
