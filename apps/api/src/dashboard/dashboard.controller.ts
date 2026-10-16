import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetaClient } from '../meta/meta.client';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService, private meta: MetaClient) {}

  private healthCache: { at: number; data: unknown } | null = null;

  /**
   * Saúde dos números do WhatsApp: qualidade (GREEN/YELLOW/RED) e limite diário da Meta,
   * mais quantos clientes diferentes receberam mensagem do Sendtec nas últimas 24h.
   */
  @Get('number-health')
  async numberHealth() {
    const limits: Record<string, number | null> = {
      TIER_50: 50,
      TIER_250: 250,
      TIER_1K: 1000,
      TIER_10K: 10000,
      TIER_100K: 100000,
      TIER_UNLIMITED: null,
    };
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(DISTINCT phone) AS count FROM "CampaignRecipient" WHERE "sentAt" >= ${since}`;
    // a consulta à Meta fica em cache por 5 min; a contagem de 24h é sempre atual
    let numbers: unknown[] = [];
    let error: string | null = null;
    if (this.healthCache && Date.now() - this.healthCache.at < 5 * 60 * 1000) numbers = this.healthCache.data as unknown[];
    else try {
      numbers = (await this.meta.phoneNumbers()).map((n) => ({
        id: n.id,
        phone: n.display_phone_number,
        name: n.verified_name,
        quality: n.quality_rating ?? 'UNKNOWN',
        tier: n.messaging_limit_tier ?? null,
        limit: n.messaging_limit_tier ? (limits[n.messaging_limit_tier] ?? null) : null,
        status: n.status ?? null,
      }));
    } catch (e: any) {
      error = e.message;
    }
    if (!error && !(this.healthCache && Date.now() - this.healthCache.at < 5 * 60 * 1000)) this.healthCache = { at: Date.now(), data: numbers };
    return { numbers, sentLast24h: Number(count), error };
  }

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
