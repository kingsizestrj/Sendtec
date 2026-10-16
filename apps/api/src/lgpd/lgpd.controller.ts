import { BadRequestException, Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { normalizeBrPhone } from '../common/phone';

const anonPhone = (phone: string, id: string) => `anon-${createHash('sha256').update(phone + id).digest('hex').slice(0, 16)}`;

/**
 * LGPD: consulta e exportação dos dados de um titular, anonimização (direito de eliminação),
 * histórico de descadastros e retenção automática.
 */
@Roles(Role.ADMIN)
@Controller('lgpd')
export class LgpdController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async subject(phone: string) {
    const [recipients, optOut] = await Promise.all([
      this.prisma.campaignRecipient.findMany({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { name: true, template: { select: { name: true } } } } },
      }),
      this.prisma.optOut.findUnique({ where: { phone } }),
    ]);
    return { phone, names: [...new Set(recipients.map((r) => r.name))], optOut, recipients };
  }

  /** Busca por telefone ou nome: lista os titulares encontrados. */
  @Get('search')
  async search(@Query('q') q = '') {
    const term = q.trim();
    if (term.length < 3) throw new BadRequestException('Digite ao menos 3 caracteres');
    const phone = normalizeBrPhone(term);
    const rows = await this.prisma.campaignRecipient.groupBy({
      by: ['phone'],
      where: phone ? { phone } : { name: { contains: term, mode: 'insensitive' }, NOT: { phone: { startsWith: 'anon-' } } },
      _count: true,
      _max: { sentAt: true },
      orderBy: { phone: 'asc' },
      take: 50,
    });
    const names = await this.prisma.campaignRecipient.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: { phone: true, name: true }, distinct: ['phone'] });
    const optouts = await this.prisma.optOut.findMany({ where: { phone: { in: [...rows.map((r) => r.phone), ...(phone ? [phone] : [])] } } });
    const out = rows.map((r) => ({
      phone: r.phone,
      name: names.find((n) => n.phone === r.phone)?.name ?? '',
      messages: r._count,
      lastSentAt: r._max.sentAt,
      optOut: optouts.find((o) => o.phone === r.phone) ?? null,
    }));
    // só descadastrado, sem mensagens
    if (phone && !out.length && optouts.length) out.push({ phone, name: optouts[0].name ?? '', messages: 0, lastSentAt: null, optOut: optouts[0] });
    return out;
  }

  @Get('subject')
  async get(@Query('phone') phone: string, @CurrentUser() user: AuthUser) {
    const s = await this.subject(phone);
    await this.audit.log(user, 'Consultou dados de titular (LGPD)', 'lgpd', phone);
    return s;
  }

  /** Relatório completo do titular (para atender pedido de acesso). */
  @Get('subject/export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async export(@Query('phone') phone: string, @CurrentUser() user: AuthUser) {
    const s = await this.subject(phone);
    await this.audit.log(user, 'Exportou dados de titular (LGPD)', 'lgpd', phone);
    return {
      geradoEm: new Date().toISOString(),
      telefone: s.phone,
      nomes: s.names,
      descadastro: s.optOut && { desde: s.optOut.createdAt, origem: s.optOut.source, motivo: s.optOut.reason },
      mensagens: s.recipients.map((r) => ({
        campanha: r.campaign.name,
        modelo: r.campaign.template.name,
        status: r.status,
        enviadaEm: r.sentAt,
        entregueEm: r.deliveredAt,
        lidaEm: r.readAt,
        resposta: r.reply,
        respondidaEm: r.repliedAt,
        variaveis: r.params,
      })),
      observacao: 'Conversas completas ficam registradas no Chatwoot; dados cadastrais ficam no IXC.',
    };
  }

  /** Direito de eliminação: apaga os dados pessoais e mantém só os números agregados das campanhas. */
  @Post('subject/anonymize')
  async anonymize(@Body() body: { phone: string; keepOptOut?: boolean }, @CurrentUser() user: AuthUser) {
    const rows = await this.prisma.campaignRecipient.findMany({ where: { phone: body.phone }, select: { id: true } });
    for (const r of rows) {
      await this.prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { name: 'Anonimizado', phone: anonPhone(body.phone, r.id), clientData: Prisma.DbNull, params: Prisma.DbNull, reply: null, latitude: null, longitude: null },
      });
    }
    // o descadastro é mantido por padrão: sem o número, não dá para garantir que ele não receba mais marketing
    if (body.keepOptOut === false) await this.prisma.optOut.deleteMany({ where: { phone: body.phone } });
    else await this.prisma.optOut.updateMany({ where: { phone: body.phone }, data: { name: null } });
    await this.audit.log(user, 'Anonimizou dados de titular (LGPD)', 'lgpd', null, { mensagens: rows.length, manteveDescadastro: body.keepOptOut !== false });
    return { anonymized: rows.length };
  }

  @Get('optouts.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async optouts(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.optOut.findMany({ orderBy: { createdAt: 'asc' } });
    await this.audit.log(user, 'Exportou histórico de descadastros (LGPD)', 'lgpd');
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const origem: Record<string, string> = { whatsapp: 'WhatsApp (resposta do cliente)', manual: 'Manual', importacao: 'Planilha' };
    return '﻿' + ['telefone;nome;descadastrado_em;origem;motivo', ...rows.map((o) => [o.phone, o.name, o.createdAt.toISOString(), origem[o.source] ?? o.source, o.reason].map(esc).join(';'))].join('\n');
  }
}

/** Retenção: anonimiza mensagens mais antigas que N meses (rodado uma vez por dia pelo agendador). */
export async function applyRetention(prisma: PrismaService, months: number) {
  if (!months || months < 1) return 0;
  const cut = new Date();
  cut.setMonth(cut.getMonth() - months);
  const old = await prisma.campaignRecipient.findMany({
    where: { createdAt: { lt: cut }, NOT: { phone: { startsWith: 'anon-' } } },
    select: { id: true, phone: true },
    take: 5000,
  });
  for (const r of old) {
    await prisma.campaignRecipient.update({
      where: { id: r.id },
      data: { name: 'Anonimizado', phone: anonPhone(r.phone, r.id), clientData: Prisma.DbNull, params: Prisma.DbNull, reply: null, latitude: null, longitude: null },
    });
  }
  return old.length;
}
