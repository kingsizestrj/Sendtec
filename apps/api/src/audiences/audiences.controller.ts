import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { AudienceSpec } from '../ixc/audience.service';

/** Públicos salvos: filtros do IXC + áreas do mapa reutilizáveis em campanhas e réguas. */
@Controller('audiences')
export class AudiencesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private clean(spec: AudienceSpec) {
    if (spec?.source === 'csv') throw new BadRequestException('Públicos de planilha não podem ser salvos; salve filtros do IXC e áreas do mapa');
    return {
      source: 'ixc',
      filters: spec?.filters ?? [],
      areas: spec?.areas ?? [],
      excludedClientIds: spec?.excludedClientIds ?? [],
    } as unknown as Prisma.InputJsonValue;
  }

  @Get()
  list() {
    return this.prisma.savedAudience.findMany({
      orderBy: { name: 'asc' },
      include: { createdBy: { select: { name: true } }, _count: { select: { steps: true } } },
    });
  }

  @Post()
  async create(@Body() body: { name: string; audience: AudienceSpec }, @CurrentUser() user: AuthUser) {
    if (!body.name?.trim()) throw new BadRequestException('Dê um nome para o público');
    const a = await this.prisma.savedAudience.create({ data: { name: body.name.trim(), audience: this.clean(body.audience), createdById: user.id } });
    await this.audit.log(user, 'Salvou público', 'publico', a.id, { publico: a.name });
    return a;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; audience?: AudienceSpec }, @CurrentUser() user: AuthUser) {
    const a = await this.prisma.savedAudience.update({
      where: { id },
      data: { ...(body.name ? { name: body.name.trim() } : {}), ...(body.audience ? { audience: this.clean(body.audience) } : {}) },
    });
    await this.audit.log(user, 'Atualizou público salvo', 'publico', id, { publico: a.name });
    return a;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const a = await this.prisma.savedAudience.findUnique({ where: { id }, include: { _count: { select: { steps: true } } } });
    if (!a) throw new NotFoundException();
    if (a._count.steps) throw new BadRequestException(`Este público é usado por ${a._count.steps} etapa(s) de régua`);
    await this.prisma.savedAudience.delete({ where: { id } });
    await this.audit.log(user, 'Excluiu público salvo', 'publico', id, { publico: a.name });
    return { ok: true };
  }
}
