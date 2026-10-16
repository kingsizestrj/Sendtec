import { Injectable } from '@nestjs/common';
import { IxcClient, IxcRecord } from '../ixc/ixc.client';
import { AudienceService } from '../ixc/audience.service';
import { firstName, formatDate, formatMoney, titleCase } from '../common/text';

export interface VariableMapping {
  source: 'cliente' | 'contrato' | 'fatura' | 'fixo';
  field?: string;
  value?: string; // texto fixo
  fallback?: string;
  format?: 'none' | 'date' | 'money' | 'upper' | 'title';
}

export interface VariablesConfig {
  body: Record<string, VariableMapping>;
  buttons?: Record<string, VariableMapping>; // índice do botão de URL dinâmica
}

export interface ResolvedParams {
  body: Record<string, string>;
  buttons: Record<string, string>;
}

/** Resolve os valores das variáveis do modelo para um cliente do IXC. */
@Injectable()
export class VariablesService {
  constructor(private ixc: IxcClient, private audience: AudienceService) {}

  private needs(cfg: VariablesConfig, source: VariableMapping['source']) {
    return [...Object.values(cfg.body ?? {}), ...Object.values(cfg.buttons ?? {})].some((m) => m.source === source);
  }

  async resolve(cfg: VariablesConfig, client: IxcRecord): Promise<ResolvedParams> {
    const ctx: Record<string, IxcRecord | null> = { cliente: { ...client }, contrato: null, fatura: null };

    if (this.needs(cfg, 'cliente')) {
      ctx.cliente!.primeiro_nome = firstName(client.razao || client.fantasia || '');
      const cities = await this.audience.cityNames().catch(() => new Map<string, string>());
      ctx.cliente!.cidade_nome = cities.get(String(client.cidade)) ?? '';
    }
    if (this.needs(cfg, 'contrato')) {
      const rows = await this.ixc.all('cliente_contrato', [{ TB: 'cliente_contrato.id_cliente', OP: '=', P: String(client.id) }]);
      ctx.contrato = rows.find((r) => r.status === 'A') ?? rows[0] ?? null;
    }
    if (this.needs(cfg, 'fatura')) {
      const rows = await this.ixc.all('fn_areceber', [
        { TB: 'fn_areceber.id_cliente', OP: '=', P: String(client.id) },
        { TB: 'fn_areceber.status', OP: '=', P: 'A' },
      ]);
      ctx.fatura = rows.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''))[0] ?? null;
    }

    const value = (m: VariableMapping): string => {
      let v = m.source === 'fixo' ? (m.value ?? '') : String(ctx[m.source]?.[m.field ?? ''] ?? '').trim();
      if (!v || v === '0000-00-00') v = m.fallback ?? '';
      switch (m.format) {
        case 'date':
          return formatDate(v);
        case 'money':
          return v ? formatMoney(v) : v;
        case 'upper':
          return v.toUpperCase();
        case 'title':
          return titleCase(v);
        default:
          return v;
      }
    };

    const out: ResolvedParams = { body: {}, buttons: {} };
    for (const [k, m] of Object.entries(cfg.body ?? {})) out.body[k] = value(m);
    for (const [k, m] of Object.entries(cfg.buttons ?? {})) out.buttons[k] = value(m);
    return out;
  }
}
