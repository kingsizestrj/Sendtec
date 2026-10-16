import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { normalizeBrPhone } from '../common/phone';

@Controller('optouts')
export class OptOutsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Importa uma lista (planilha) de números que não devem receber campanhas de marketing. */
  @Post('import')
  async import(@Body() body: { rows: { phone: string; name?: string; reason?: string }[] }, @CurrentUser() user: AuthUser) {
    const rows = (body.rows ?? []).slice(0, 50000);
    let added = 0;
    let invalid = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const phone = normalizeBrPhone(r.phone);
      if (!phone) {
        invalid++;
        continue;
      }
      if (seen.has(phone)) continue;
      seen.add(phone);
      const exists = await this.prisma.optOut.findUnique({ where: { phone } });
      if (exists) continue;
      await this.prisma.optOut.create({ data: { phone, name: r.name || null, reason: r.reason || 'Importado de planilha', source: 'importacao' } });
      added++;
    }
    await this.audit.log(user, 'Importou descadastros', 'descadastro', null, { adicionados: added, invalidos: invalid, linhas: rows.length });
    return { added, invalid, alreadyListed: seen.size - added };
  }

  @Get()
  list(@Query('search') search?: string) {
    return this.prisma.optOut.findMany({
      where: search ? { OR: [{ phone: { contains: search.replace(/\D/g, '') || search } }, { name: { contains: search, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @Post()
  async add(@Body() body: { phone: string; name?: string; reason?: string }, @CurrentUser() user: AuthUser) {
    const phone = normalizeBrPhone(body.phone);
    if (!phone) throw new BadRequestException('Telefone inválido');
    await this.audit.log(user, 'Bloqueou número (descadastro manual)', 'descadastro', phone);
    return this.prisma.optOut.upsert({
      where: { phone },
      create: { phone, name: body.name, reason: body.reason, source: 'manual' },
      update: { name: body.name, reason: body.reason },
    });
  }

  @Delete(':phone')
  async remove(@Param('phone') phone: string, @CurrentUser() user: AuthUser) {
    await this.audit.log(user, 'Removeu descadastro', 'descadastro', phone);
    await this.prisma.optOut.deleteMany({ where: { phone } });
    return { ok: true };
  }
}
