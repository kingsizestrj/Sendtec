import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { normalizeBrPhone } from '../common/phone';

@Controller('optouts')
export class OptOutsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.prisma.optOut.findMany({
      where: search ? { OR: [{ phone: { contains: search.replace(/\D/g, '') || search } }, { name: { contains: search, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @Post()
  async add(@Body() body: { phone: string; name?: string; reason?: string }) {
    const phone = normalizeBrPhone(body.phone);
    if (!phone) throw new BadRequestException('Telefone inválido');
    return this.prisma.optOut.upsert({
      where: { phone },
      create: { phone, name: body.name, reason: body.reason, source: 'manual' },
      update: { name: body.name, reason: body.reason },
    });
  }

  @Delete(':phone')
  async remove(@Param('phone') phone: string) {
    await this.prisma.optOut.deleteMany({ where: { phone } });
    return { ok: true };
  }
}
