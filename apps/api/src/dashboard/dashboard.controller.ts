import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async stats() {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byStatus, campaigns, templates, optOuts, recent] = await Promise.all([
      this.prisma.campaignRecipient.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.campaign.groupBy({ by: ['status'], _count: true }),
      this.prisma.template.groupBy({ by: ['status'], _count: true }),
      this.prisma.optOut.count(),
      this.prisma.$queryRaw<{ day: Date; sent: bigint; read: bigint }[]>`
        SELECT date_trunc('day', "sentAt") AS day,
               count(*) AS sent,
               count(*) FILTER (WHERE status = 'READ') AS read
        FROM "CampaignRecipient"
        WHERE "sentAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const toMap = (rows: { status: string; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count]));
    return {
      messages: toMap(byStatus),
      campaigns: toMap(campaigns),
      templates: toMap(templates),
      optOuts,
      daily: recent.map((r) => ({ day: r.day.toISOString().slice(0, 10), sent: Number(r.sent), read: Number(r.read) })),
    };
  }
}
