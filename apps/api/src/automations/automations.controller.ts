import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { AutomationInput, AutomationsService } from './automations.service';

@Controller('automations')
export class AutomationsController {
  constructor(private automations: AutomationsService, private audit: AuditService) {}

  @Get()
  list() {
    return this.automations.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.automations.get(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.automations.history(id);
  }

  @Post()
  async create(@Body() body: AutomationInput, @CurrentUser() user: AuthUser) {
    const a = await this.automations.save(null, body, user.id);
    await this.audit.log(user, 'Criou régua automática', 'regua', a.id, { regua: a.name, etapas: a.steps.length, ativa: a.active });
    return a;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: AutomationInput, @CurrentUser() user: AuthUser) {
    const a = await this.automations.save(id, body, user.id);
    await this.audit.log(user, 'Editou régua automática', 'regua', id, { regua: a.name, etapas: a.steps.length, ativa: a.active });
    return a;
  }

  @Post(':id/active')
  async active(@Param('id') id: string, @Body() body: { active: boolean }, @CurrentUser() user: AuthUser) {
    const a = await this.automations.setActive(id, !!body.active);
    await this.audit.log(user, body.active ? 'Ativou régua automática' : 'Pausou régua automática', 'regua', id, { regua: a.name });
    return a;
  }

  @Post('steps/:stepId/run')
  async run(@Param('stepId') stepId: string, @CurrentUser() user: AuthUser) {
    const r = await this.automations.runStep(stepId);
    await this.audit.log(user, 'Rodou etapa de régua manualmente', 'regua', stepId, { resultado: r.result });
    return r;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const a = await this.automations.get(id);
    await this.automations.remove(id);
    await this.audit.log(user, 'Excluiu régua automática', 'regua', id, { regua: a.name });
    return { ok: true };
  }
}
