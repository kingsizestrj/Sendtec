import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { CreateTemplateInput, TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post()
  create(@Body() body: CreateTemplateInput) {
    return this.templates.create(body);
  }

  @Post('sync')
  sync() {
    return this.templates.sync();
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }
}
