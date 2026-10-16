import { Injectable, Logger } from '@nestjs/common';
import { CampaignRecipient, RecipientStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ChatwootClient } from '../chatwoot/chatwoot.client';

const RANK: Record<RecipientStatus, number> = { PENDING: 0, SENDING: 1, SKIPPED: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };
const MAP: Record<string, RecipientStatus> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const POLL_BATCH = 300;
const POLL_WINDOW_MS = 3 * 24 * 3600 * 1000; // a Meta só atualiza status por alguns dias

/**
 * Status de entrega/leitura das mensagens.
 * O status é lido da API do Chatwoot (mesma fonte dos "tiques" da conversa), tanto quando chega
 * um webhook da mensagem quanto numa verificação periódica — assim não depende do formato do webhook.
 */
@Injectable()
export class RecipientStatusService {
  private readonly logger = new Logger(RecipientStatusService.name);
  private polling = false;

  constructor(private prisma: PrismaService, private chatwoot: ChatwootClient) {}

  /** Aplica um status vindo do Chatwoot. Status só avança (lida não volta para entregue). */
  async apply(recipient: CampaignRecipient, rawStatus: string | undefined, error?: string | null): Promise<boolean> {
    const next = MAP[String(rawStatus ?? '').toLowerCase()];
    if (!next) return false;
    if (next !== 'FAILED' && RANK[next] <= RANK[recipient.status]) return false;
    if (next === 'FAILED' && (recipient.status === 'FAILED' || RANK[recipient.status] >= RANK.DELIVERED)) return false;

    const now = new Date();
    await this.prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: next,
        ...(next === 'DELIVERED' ? { deliveredAt: now } : {}),
        ...(next === 'READ' ? { readAt: now, deliveredAt: recipient.deliveredAt ?? now } : {}),
        ...(next === 'FAILED' ? { error: String(error || 'Falha informada pela Meta').slice(0, 500) } : {}),
      },
    });
    return true;
  }

  /** Webhook de uma mensagem: usa o status do payload se vier; senão consulta o Chatwoot. */
  async fromWebhook(body: any) {
    const messageId = Number(body?.id);
    if (!messageId) return;
    const recipient = await this.prisma.campaignRecipient.findFirst({ where: { chatwootMessageId: messageId } });
    if (!recipient) return; // mensagem que não é de campanha
    if (body.status) {
      await this.apply(recipient, body.status, body.content_attributes?.external_error);
    } else {
      const changed = await this.refresh([recipient]);
      if (changed) this.logger.log(`Status atualizado: ${recipient.name} (${recipient.phone})`);
    }
  }

  /** Consulta o status atual no Chatwoot (agrupado por conversa). */
  async refresh(recipients: CampaignRecipient[]) {
    const byConversation = new Map<number, CampaignRecipient[]>();
    for (const r of recipients) {
      if (!r.chatwootConversationId || !r.chatwootMessageId) continue;
      byConversation.set(r.chatwootConversationId, [...(byConversation.get(r.chatwootConversationId) ?? []), r]);
    }
    let changed = 0;
    for (const [conversationId, list] of byConversation) {
      const minId = Math.min(...list.map((r) => r.chatwootMessageId!));
      const messages = await this.chatwoot.conversationMessages(conversationId, minId).catch(() => null);
      if (!messages) continue;
      for (const r of list) {
        const m = messages.find((x) => x.id === r.chatwootMessageId);
        if (m && (await this.apply(r, m.status, m.content_attributes?.external_error))) changed++;
      }
      // marca como verificado para a fila girar
      await this.prisma.campaignRecipient.updateMany({
        where: { id: { in: list.map((r) => r.id) }, status: { in: ['SENT', 'DELIVERED'] } },
        data: { updatedAt: new Date() },
      });
    }
    return changed;
  }

  /** Verificação periódica das mensagens recentes ainda não lidas. */
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const recipients = await this.prisma.campaignRecipient.findMany({
        where: {
          status: { in: ['SENT', 'DELIVERED'] },
          chatwootMessageId: { not: null },
          sentAt: { gte: new Date(Date.now() - POLL_WINDOW_MS) },
        },
        orderBy: { updatedAt: 'asc' },
        take: POLL_BATCH,
      });
      if (!recipients.length) return;
      const changed = await this.refresh(recipients);
      if (changed) this.logger.log(`Status atualizado em ${changed} mensagem(ns)`);
    } finally {
      this.polling = false;
    }
  }
}
