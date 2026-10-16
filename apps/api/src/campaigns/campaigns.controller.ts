import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { CampaignInput, CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private campaigns: CampaignsService, private audit: AuditService) {}

  private async logged<T extends { id?: string; name?: string }>(user: AuthUser, action: string, id: string, p: Promise<T>) {
    const r = await p;
    const c = await this.campaigns.get(r?.id ?? id).catch(() => null);
    await this.audit.log(user, action, 'campanha', r?.id ?? id, { campanha: c?.name ?? r?.name });
    return r;
  }

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post('test')
  test(@Body() body: CampaignInput & { clientId: string; phone: string }) {
    return this.campaigns.sendTest(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Post()
  create(@Body() body: CampaignInput, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Criou campanha', '', this.campaigns.create(body, user.id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CampaignInput, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Editou campanha', id, this.campaigns.update(id, body));
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const c = await this.campaigns.get(id);
    const r = await this.campaigns.remove(id);
    await this.audit.log(user, 'Excluiu campanha', 'campanha', id, { campanha: c.name });
    return r;
  }

  @Post(':id/start')
  start(@Param('id') id: string, @Body() body: { scheduledAt?: string | null }, @CurrentUser() user: AuthUser) {
    return this.logged(user, body?.scheduledAt ? 'Agendou campanha' : 'Disparou campanha', id, this.campaigns.start(id, body?.scheduledAt));
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Duplicou campanha', '', this.campaigns.duplicate(id, user.id));
  }

  @Post(':id/unschedule')
  unschedule(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Desagendou campanha (voltou para rascunho)', id, this.campaigns.unschedule(id));
  }

  @Get(':id/replies')
  replies(@Param('id') id: string) {
    return this.campaigns.replies(id);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Pausou campanha', id, this.campaigns.pause(id));
  }

  @Post(':id/resume')
  resume(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Retomou campanha', id, this.campaigns.resume(id));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Cancelou campanha', id, this.campaigns.cancel(id));
  }

  @Post(':id/retry-failed')
  retry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.logged(user, 'Reenviou falhas da campanha', id, this.campaigns.retryFailed(id) as Promise<{ id?: string }>);
  }

  @Get(':id/recipients')
  recipients(@Param('id') id: string, @Query() q: { status?: string; search?: string; page?: number; pageSize?: number }) {
    return this.campaigns.recipients(id, q);
  }

  @Get(':id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  csv(@Param('id') id: string) {
    return this.campaigns.csv(id);
  }
}
