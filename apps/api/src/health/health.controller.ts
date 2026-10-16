import { Controller, Get, Post } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private health: HealthService) {}

  @Get('integrations')
  integrations() {
    return this.health.current();
  }

  @Post('integrations/check')
  check() {
    return this.health.check();
  }
}
