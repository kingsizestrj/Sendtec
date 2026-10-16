import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { SettingsService } from '../settings/settings.service';
import { ChatwootSettings } from '../settings/settings.types';

export interface TemplateParams {
  name: string;
  category: string;
  language: string;
  processed_params: Record<string, unknown>;
}

@Injectable()
export class ChatwootClient {
  constructor(private settings: SettingsService) {}

  private http(cfg: ChatwootSettings): AxiosInstance {
    if (!cfg.baseUrl || !cfg.apiToken) throw new BadRequestException('Configure o Chatwoot em Configurações');
    return axios.create({
      baseURL: `${cfg.baseUrl.replace(/\/+$/, '')}/api/v1/accounts/${cfg.accountId}/`,
      timeout: 30000,
      headers: { api_access_token: cfg.apiToken, 'Content-Type': 'application/json' },
    });
  }

  private fail(e: unknown, what: string): never {
    const err = e as AxiosError<any>;
    const body = err.response?.data;
    const msg = body?.message || body?.error || (Array.isArray(body?.errors) ? body.errors.join(', ') : null) || err.message;
    throw new BadGatewayException(`Chatwoot (${what}): ${msg}`);
  }

  async test(cfg: ChatwootSettings) {
    const http = this.http(cfg);
    try {
      const { data } = await http.get('inboxes');
      const inboxes = (data.payload ?? []) as any[];
      const inbox = inboxes.find((i) => i.id === Number(cfg.inboxId));
      let templates: number | null = null;
      if (inbox) {
        const detail = await http.get(`inboxes/${inbox.id}`).catch(() => null);
        const list = detail?.data?.message_templates;
        templates = Array.isArray(list) ? list.length : null;
      }
      return {
        templates,
        ok: true,
        inboxes: inboxes.map((i) => ({ id: i.id, name: i.name, channelType: i.channel_type })),
        inboxFound: !!inbox,
        inboxIsWhatsapp: inbox?.channel_type === 'Channel::Whatsapp',
      };
    } catch (e) {
      this.fail(e, 'teste');
    }
  }

  /** Pede ao Chatwoot para buscar na Meta a lista atualizada de modelos (botão "Sincronizar modelos"). */
  async syncTemplates(): Promise<boolean> {
    const cfg = await this.settings.get('chatwoot');
    try {
      await this.http(cfg).post(`inboxes/${cfg.inboxId}/sync_templates`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Modelos que o Chatwoot já tem sincronizados na caixa do WhatsApp.
   * Devolve null se a resposta não trouxer a lista (formato desconhecido): nesse caso não dá para verificar.
   */
  async inboxTemplates(): Promise<{ name: string; language: string; status?: string }[] | null> {
    const cfg = await this.settings.get('chatwoot');
    try {
      const { data } = await this.http(cfg).get(`inboxes/${cfg.inboxId}`);
      const list = data?.message_templates ?? data?.payload?.message_templates;
      return Array.isArray(list) ? list : null;
    } catch (e) {
      this.fail(e, 'caixa de entrada');
    }
  }

  /** Encontra o contato pelo telefone ou cria um novo, garantindo vínculo com a caixa do WhatsApp. */
  async ensureContact(phone: string, name: string, ixcId: string): Promise<{ contactId: number; sourceId: string }> {
    const cfg = await this.settings.get('chatwoot');
    const http = this.http(cfg);
    const sourceId = phone.replace(/\D/g, '');
    try {
      const { data } = await http.get('contacts/search', { params: { q: sourceId, include_contacts: true } });
      const existing = ((data.payload ?? []) as any[]).find((c) => (c.phone_number || '').replace(/\D/g, '') === sourceId);
      if (existing) {
        const linked = (existing.contact_inboxes ?? []).find((ci: any) => ci.inbox?.id === Number(cfg.inboxId));
        if (linked?.source_id) return { contactId: existing.id, sourceId: linked.source_id };
        try {
          const ci = await http.post(`contacts/${existing.id}/contact_inboxes`, { inbox_id: Number(cfg.inboxId), source_id: sourceId });
          return { contactId: existing.id, sourceId: ci.data?.source_id ?? sourceId };
        } catch {
          return { contactId: existing.id, sourceId };
        }
      }
      const created = await http.post('contacts', {
        inbox_id: Number(cfg.inboxId),
        name,
        phone_number: phone,
        custom_attributes: { ixc_id: ixcId },
      });
      const payload = created.data.payload ?? created.data;
      const contact = payload.contact ?? payload;
      return { contactId: contact.id, sourceId: payload.contact_inbox?.source_id ?? sourceId };
    } catch (e) {
      this.fail(e, 'contato');
    }
  }

  async createConversation(contactId: number, sourceId: string, attrs: Record<string, unknown>): Promise<number> {
    const cfg = await this.settings.get('chatwoot');
    try {
      const { data } = await this.http(cfg).post('conversations', {
        source_id: sourceId,
        inbox_id: Number(cfg.inboxId),
        contact_id: contactId,
        status: 'open',
        additional_attributes: attrs,
      });
      return data.id;
    } catch (e) {
      this.fail(e, 'conversa');
    }
  }

  async sendTemplate(conversationId: number, content: string, template: TemplateParams): Promise<{ id: number; status?: string }> {
    const cfg = await this.settings.get('chatwoot');
    try {
      const { data } = await this.http(cfg).post(`conversations/${conversationId}/messages`, {
        content,
        message_type: 'outgoing',
        template_params: template,
      });
      return { id: data.id, status: data.status };
    } catch (e) {
      this.fail(e, 'envio');
    }
  }

  async sendText(conversationId: number, content: string) {
    const cfg = await this.settings.get('chatwoot');
    try {
      await this.http(cfg).post(`conversations/${conversationId}/messages`, { content, message_type: 'outgoing' });
    } catch (e) {
      this.fail(e, 'resposta');
    }
  }

  async addLabels(conversationId: number, labels: string[]) {
    const cfg = await this.settings.get('chatwoot');
    try {
      await this.http(cfg).post(`conversations/${conversationId}/labels`, { labels });
    } catch {
      // etiqueta é opcional; não interrompe o envio
    }
  }
}
