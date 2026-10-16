import { Body, Controller, ForbiddenException, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { RecipientStatusService } from '../campaigns/recipient-status.service';
import { normalizeBrPhone } from '../common/phone';
import { normalizeKeyword } from '../common/text';

/**
 * Webhook do Chatwoot (Configurações > Integrações > Webhooks no Chatwoot).
 * Eventos usados: message_created (opt-out) e message_updated (status de entrega/leitura).
 */
function safeEqual(a: string, b: string) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private chatwoot: ChatwootClient,
    private status: RecipientStatusService,
  ) {}

  @Public()
  @Post('chatwoot')
  @HttpCode(200)
  async chatwootHook(@Query('token') token: string, @Body() body: any) {
    const cfg = await this.settings.get('chatwoot');
    if (!token || !safeEqual(token, cfg.webhookToken)) {
      this.logger.warn('Webhook do Chatwoot recusado: token inválido (confira a URL cadastrada no Chatwoot)');
      throw new ForbiddenException();
    }
    try {
      if (body?.event === 'message_updated' || (body?.event === 'message_created' && body?.message_type === 'outgoing')) {
        await this.status.fromWebhook(body);
      } else if (body?.event === 'message_created' && body?.message_type === 'incoming') {
        await this.incoming(body, cfg.inboxId);
      }
    } catch (e: any) {
      this.logger.error(`Webhook: ${e.message}`);
    }
    return { ok: true };
  }

  /**
   * Guarda a primeira resposta do cliente à campanha (texto livre ou botão de resposta rápida).
   * Procura pela conversa criada no disparo; se não achar, pelo telefone, em envios dos últimos 7 dias.
   */
  private async recordReply(body: any) {
    const content = String(body.content ?? '').trim();
    if (!content) return;
    const conversationId = Number(body.conversation?.id) || null;
    const sender = body.sender ?? body.conversation?.meta?.sender ?? {};
    const phone = normalizeBrPhone(sender.phone_number);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const recipient =
      (conversationId &&
        (await this.prisma.campaignRecipient.findFirst({ where: { chatwootConversationId: conversationId }, orderBy: { sentAt: 'desc' } }))) ||
      (phone && (await this.prisma.campaignRecipient.findFirst({ where: { phone, sentAt: { gte: since } }, orderBy: { sentAt: 'desc' } })));
    if (!recipient || recipient.reply) return;
    await this.prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        reply: content.slice(0, 300),
        repliedAt: new Date(),
        // quem responde, leu
        ...(recipient.status === 'SENT' || recipient.status === 'DELIVERED'
          ? { status: 'READ', readAt: recipient.readAt ?? new Date(), deliveredAt: recipient.deliveredAt ?? new Date() }
          : {}),
      },
    });
  }

  private async incoming(body: any, inboxId: number) {
    if (body.inbox?.id && Number(body.inbox.id) !== Number(inboxId)) return;
    await this.recordReply(body).catch((e) => this.logger.warn(`Resposta não registrada: ${e.message}`));
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
