import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { SettingsService } from '../settings/settings.service';
import { MetaSettings } from '../settings/settings.types';

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
  rejected_reason?: string;
  quality_score?: { score: string };
}

@Injectable()
export class MetaClient {
  constructor(private settings: SettingsService) {}

  private async cfg(): Promise<MetaSettings> {
    const cfg = await this.settings.get('meta');
    if (!cfg.wabaId || !cfg.accessToken) throw new BadRequestException('Configure o WABA ID e o token da Meta em Configurações');
    return cfg;
  }

  private url(cfg: MetaSettings, path: string) {
    return `${process.env.META_GRAPH_URL || 'https://graph.facebook.com'}/${cfg.graphVersion || 'v21.0'}/${path}`;
  }

  private fail(e: unknown): never {
    const err = e as AxiosError<any>;
    const meta = err.response?.data?.error;
    const msg = meta?.error_user_msg || meta?.error_user_title || meta?.message || err.message;
    throw new BadGatewayException(`Meta: ${msg}`);
  }

  /** App e contas do WhatsApp (WABA) às quais o token dá acesso, segundo o debug_token da Meta. */
  private async tokenInfo(cfg: MetaSettings): Promise<{ appId?: string; wabaIds: string[] }> {
    try {
      const { data } = await axios.get(this.url(cfg, 'debug_token'), {
        params: { input_token: cfg.accessToken, access_token: cfg.accessToken },
      });
      const scopes: { scope: string; target_ids?: string[] }[] = data.data?.granular_scopes ?? [];
      return {
        appId: data.data?.app_id,
        wabaIds: scopes.find((s) => s.scope === 'whatsapp_business_management')?.target_ids ?? [],
      };
    } catch {
      return { wabaIds: [] };
    }
  }

  async test(cfg: MetaSettings) {
    const info = await this.tokenInfo(cfg);
    const hints = [
      info.wabaIds.length ? `WABA ID(s) liberados para este token: ${info.wabaIds.join(', ')}` : '',
      info.appId && info.appId !== cfg.appId ? `App ID deste token: ${info.appId}` : '',
    ].filter(Boolean);
    try {
      const { data } = await axios.get(this.url(cfg, cfg.wabaId), {
        params: { fields: 'id,name' },
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      // garante que o ID é mesmo de uma conta do WhatsApp Business (e não do número de telefone)
      await axios.get(this.url(cfg, `${cfg.wabaId}/message_templates`), {
        params: { limit: 1, fields: 'name' },
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      if (info.appId && cfg.appId && info.appId !== cfg.appId) {
        return { ok: false, error: `Conectado à conta "${data.name}", mas o App ID não confere com o do token. ${hints.join('. ')}` };
      }
      return { ok: true, name: data.name, appIdHint: !cfg.appId && info.appId ? info.appId : undefined };
    } catch (e) {
      const err = e as AxiosError<any>;
      if (err.response?.data?.error?.code === 100) {
        return {
          ok: false,
          error: `O ID informado não é de uma conta do WhatsApp Business (WABA) — talvez seja o ID do número de telefone. ${hints.join('. ')}`.trim(),
        };
      }
      this.fail(e);
    }
  }

  async listTemplates(): Promise<MetaTemplate[]> {
    const cfg = await this.cfg();
    const out: MetaTemplate[] = [];
    let next: string | null = this.url(cfg, `${cfg.wabaId}/message_templates`);
    let params: Record<string, string> | undefined = {
      fields: 'id,name,language,status,category,components,rejected_reason,quality_score',
      limit: '100',
    };
    try {
      while (next) {
        const res: { data: { data: MetaTemplate[]; paging?: { next?: string } } } = await axios.get(next, {
          params,
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
        });
        out.push(...res.data.data);
        next = res.data.paging?.next ?? null;
        params = undefined; // a URL "next" já traz os parâmetros
      }
    } catch (e) {
      this.fail(e);
    }
    return out;
  }

  async createTemplate(body: { name: string; language: string; category: string; components: any[] }) {
    const cfg = await this.cfg();
    try {
      const { data } = await axios.post(this.url(cfg, `${cfg.wabaId}/message_templates`), body, {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      return data as { id: string; status: string; category: string };
    } catch (e) {
      this.fail(e);
    }
  }

  async deleteTemplate(name: string, metaId?: string | null) {
    const cfg = await this.cfg();
    try {
      await axios.delete(this.url(cfg, `${cfg.wabaId}/message_templates`), {
        params: { name, ...(metaId ? { hsm_id: metaId } : {}) },
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
    } catch (e) {
      this.fail(e);
    }
  }

  /** Upload resumível: devolve o "header_handle" exigido no exemplo de cabeçalho com mídia. */
  async uploadForTemplate(file: Buffer, fileName: string, mimeType: string): Promise<string> {
    const cfg = await this.cfg();
    if (!cfg.appId) throw new BadRequestException('Informe o App ID da Meta em Configurações para enviar imagens de modelo');
    try {
      const session = await axios.post(this.url(cfg, `${cfg.appId}/uploads`), null, {
        params: { file_name: fileName, file_length: file.length, file_type: mimeType },
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      const { data } = await axios.post(this.url(cfg, session.data.id), file, {
        headers: { Authorization: `OAuth ${cfg.accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
      });
      return data.h as string;
    } catch (e) {
      this.fail(e);
    }
  }
}
