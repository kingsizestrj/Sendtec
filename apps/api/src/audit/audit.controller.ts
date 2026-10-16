import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuditService } from './audit.service';

@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Query() q: { page?: number; search?: string; userId?: string }) {
    return this.audit.list(q);
  }
}
