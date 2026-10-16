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

  async test(cfg: MetaSettings) {
    try {
      const { data } = await axios.get(this.url(cfg, cfg.wabaId), {
        params: { fields: 'id,name,message_template_namespace' },
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      return { ok: true, name: data.name };
    } catch (e) {
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
