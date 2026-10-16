import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

const CELL = 0.005; // ~550 m

interface Row {
  total: bigint;
  delivered: bigint;
  read: bigint;
  failed: bigint;
}

const num = (r: Row) => ({ total: Number(r.total), delivered: Number(r.delivered), read: Number(r.read), failed: Number(r.failed) });

/** Resultados das campanhas por região (mapa) e por bairro. */
@Controller('results')
export class ResultsController {
  constructor(private prisma: PrismaService) {}

  @Get('map')
  async map(@Query('days') days?: string, @Query('campaignId') campaignId?: string) {
    const d = Math.min(365, Math.max(1, Number(days) || 30));
    const since = new Date(Date.now() - d * 24 * 3600 * 1000);
    const where = Prisma.sql`"sentAt" >= ${since} AND status IN ('SENT','DELIVERED','READ','FAILED')
      ${campaignId ? Prisma.sql`AND "campaignId" = ${campaignId}` : Prisma.empty}`;
    const counts = Prisma.sql`count(*) AS total,
      count(*) FILTER (WHERE status IN ('DELIVERED','READ')) AS delivered,
      count(*) FILTER (WHERE status = 'READ') AS read,
      count(*) FILTER (WHERE status = 'FAILED') AS failed`;

    const [cells, bairros, [totals]] = await Promise.all([
      this.prisma.$queryRaw<(Row & { lat: number; lng: number })[]>`
        SELECT round(latitude / ${CELL}) * ${CELL} AS lat, round(longitude / ${CELL}) * ${CELL} AS lng, ${counts}
        FROM "CampaignRecipient" WHERE ${where} AND latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<(Row & { bairro: string })[]>`
        SELECT coalesce(nullif(trim("clientData"->>'bairro'), ''), '(sem bairro)') AS bairro, ${counts}
        FROM "CampaignRecipient" WHERE ${where}
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 60`,
      this.prisma.$queryRaw<Row[]>`SELECT ${counts} FROM "CampaignRecipient" WHERE ${where}`,
    ]);

    return {
      days: d,
      totals: num(totals),
      cells: cells.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), ...num(c) })),
      bairros: bairros.map((b) => ({ bairro: b.bairro, ...num(b) })),
    };
  }
}
