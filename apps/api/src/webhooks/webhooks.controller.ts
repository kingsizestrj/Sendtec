import { Body, Controller, ForbiddenException, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { RecipientStatus } from '@prisma/client';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { normalizeBrPhone } from '../common/phone';
import { normalizeKeyword } from '../common/text';

const RANK: Record<RecipientStatus, number> = { PENDING: 0, SENDING: 1, SKIPPED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };

/**
 * Webhook do Chatwoot (Configurações > Integrações > Webhooks no Chatwoot).
 * Eventos usados: message_created (opt-out) e message_updated (status de entrega/leitura).
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private prisma: PrismaService, private settings: SettingsService, private chatwoot: ChatwootClient) {}

  @Public()
  @Post('chatwoot')
  @HttpCode(200)
  async chatwootHook(@Query('token') token: string, @Body() body: any) {
    const cfg = await this.settings.get('chatwoot');
    if (!token || token !== cfg.webhookToken) throw new ForbiddenException();
    try {
      if (body?.event === 'message_updated' || (body?.event === 'message_created' && body?.message_type === 'outgoing')) {
        await this.statusUpdate(body);
      } else if (body?.event === 'message_created' && body?.message_type === 'incoming') {
        await this.incoming(body, cfg.inboxId);
      }
    } catch (e: any) {
      this.logger.error(`Webhook: ${e.message}`);
    }
    return { ok: true };
  }

  private async statusUpdate(body: any) {
    const messageId = Number(body.id);
    if (!messageId) return;
    const recipient = await this.prisma.campaignRecipient.findFirst({ where: { chatwootMessageId: messageId } });
    if (!recipient) return;

    const map: Record<string, RecipientStatus> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
    const next = map[String(body.status)];
    if (!next) return;
    // status só avança (lido não volta para entregue); falha vale sempre que ainda não foi entregue
    if (next !== 'FAILED' && RANK[next] <= RANK[recipient.status]) return;
    if (next === 'FAILED' && RANK[recipient.status] >= RANK.DELIVERED && recipient.status !== 'FAILED') return;

    const now = new Date();
    await this.prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: next,
        ...(next === 'DELIVERED' ? { deliveredAt: now } : {}),
        ...(next === 'READ' ? { readAt: now, deliveredAt: recipient.deliveredAt ?? now } : {}),
        ...(next === 'FAILED' ? { error: String(body.content_attributes?.external_error ?? 'Falha informada pela Meta').slice(0, 500) } : {}),
      },
    });
  }

  private async incoming(body: any, inboxId: number) {
    if (body.inbox?.id && Number(body.inbox.id) !== Number(inboxId)) return;
    const general = await this.settings.get('general');
    const keyword = normalizeKeyword(String(body.content ?? ''));
    const keywords = (general.optOutKeywords ?? []).map(normalizeKeyword);
    if (!keyword || !keywords.includes(keyword)) return;

    const sender = body.sender ?? body.conversation?.meta?.sender ?? {};
    const phone = normalizeBrPhone(sender.phone_number);
    if (!phone) return;
    await this.prisma.optOut.upsert({
      where: { phone },
      create: { phone, name: sender.name ?? null, reason: `Respondeu "${body.content}"`, source: 'whatsapp' },
      update: {},
    });
    this.logger.log(`Opt-out registrado: ${phone}`);
    const conversationId = body.conversation?.id;
    if (general.optOutReply && conversationId) await this.chatwoot.sendText(conversationId, general.optOutReply).catch(() => undefined);
  }
}
