import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { PrismaService } from './prisma.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users/users.controller';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { IxcClient } from './ixc/ixc.client';
import { AudienceService } from './ixc/audience.service';
import { IxcController } from './ixc/ixc.controller';
import { MetaClient } from './meta/meta.client';
import { MediaService } from './media/media.service';
import { MediaController } from './media/media.controller';
import { TemplatesService } from './templates/templates.service';
import { TemplatesController } from './templates/templates.controller';
import { ChatwootClient } from './chatwoot/chatwoot.client';
import { VariablesService } from './campaigns/variables.service';
import { CampaignRunner } from './campaigns/campaign-runner.service';
import { RecipientStatusService } from './campaigns/recipient-status.service';
import { CampaignsService } from './campaigns/campaigns.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { OptOutsController } from './optouts/optouts.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { ResultsController } from './results/results.controller';
import { SchedulerService } from './scheduler.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { MailService } from './mail/mail.service';
import { HealthService } from './health/health.service';
import { HealthController } from './health/health.controller';

const webDist = process.env.WEB_DIST || path.resolve(__dirname, '../../web/dist');

@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.APP_SECRET, signOptions: { expiresIn: '12h' } }),
    ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}'] }),
  ],
  controllers: [
    AuthController,
    UsersController,
    SettingsController,
    IxcController,
    MediaController,
    TemplatesController,
    CampaignsController,
    WebhooksController,
    OptOutsController,
    DashboardController,
    ResultsController,
    AuditController,
    HealthController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    PrismaService,
    SettingsService,
    IxcClient,
    AudienceService,
    MetaClient,
    MediaService,
    TemplatesService,
    ChatwootClient,
    VariablesService,
    CampaignRunner,
    RecipientStatusService,
    CampaignsService,
    SchedulerService,
    AuditService,
    MailService,
    HealthService,
  ],
})
export class AppModule {}
