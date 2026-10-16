import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { CampaignInput, CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private campaigns: CampaignsService) {}

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
    return this.campaigns.create(body, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CampaignInput) {
    return this.campaigns.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @Body() body: { scheduledAt?: string | null }) {
    return this.campaigns.start(id, body?.scheduledAt);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.campaigns.resume(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id);
  }

  @Post(':id/retry-failed')
  retry(@Param('id') id: string) {
    return this.campaigns.retryFailed(id);
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
