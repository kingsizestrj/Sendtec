import { BadRequestException, Injectable } from '@nestjs/common';
import { IxcClient, IxcGridParam, IxcRecord } from './ixc.client';
import { IXC_TABLES } from './ixc.catalog';
import { SettingsService } from '../settings/settings.service';
import { Area, insideAnyArea, parseCoord } from '../common/geo';
import { normalizeBrPhone } from '../common/phone';
import { resolveDynamicValue, toIxcValue } from '../common/text';

export interface AudienceFilter {
  table: string;
  field: string;
  op: string;
  value: string;
  value2?: string; // fim do intervalo (BE / NBE)
}

export interface AudienceSpec {
  filters: AudienceFilter[];
  areas: Area[];
  excludedClientIds: string[];
  phoneFields?: string[];
}

export interface AudienceClient {
  id: string;
  name: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  bairro: string;
  cidade: string;
  inArea: boolean;
}

export interface AudienceResult {
  clients: AudienceClient[]; // todos os que passaram nos filtros do IXC (com flag de área)
  selected: AudienceClient[]; // que realmente vão receber
  stats: { matched: number; withCoords: number; inArea: number; withoutPhone: number; duplicates: number; excluded: number; selected: number };
}

const VALID_OPS = new Set(['=', '!=', '>', '<', '>=', '<=', 'L', 'NL', 'IN', 'NI', 'BE', 'NBE']);
const CACHE_MS = 5 * 60 * 1000;

@Injectable()
export class AudienceService {
  private cache = new Map<string, { at: number; data: unknown }>();

  constructor(private ixc: IxcClient, private settings: SettingsService) {}

  private async cached<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
    const data = await fn();
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  private gridFor(filters: AudienceFilter[], table: string): IxcGridParam[] {
    return filters.map((f) => {
      if (!VALID_OPS.has(f.op)) throw new BadRequestException(`Operador inválido: ${f.op}`);
      if (!/^[a-z0-9_]+$/i.test(f.field)) throw new BadRequestException(`Campo inválido: ${f.field}`);
      const type = IXC_TABLES.find((t) => t.table === table)?.fields.find((x) => x.field === f.field)?.type;
      if (type === 'datetime') return this.datetimeGrid(`${table}.${f.field}`, f);
      const grid: IxcGridParam = { TB: `${table}.${f.field}`, OP: f.op, P: toIxcValue(String(f.value ?? '')) };
      if (f.op === 'BE' || f.op === 'NBE') grid.P2 = toIxcValue(String(f.value2 ?? ''));
      if (f.op === 'IN' || f.op === 'NI') grid.P = grid.P.split(',').map((x) => x.trim()).filter(Boolean).join(',');
      return grid;
    });
  }

  /**
   * Campos de data e hora (ex.: abertura da OS) usam "aaaa-mm-dd hh:mm:ss" no IXC.
   * Um dia escolhido vale o dia inteiro: "= 10/10" vira "entre 10/10 00:00 e 10/10 23:59".
   */
  private datetimeGrid(TB: string, f: AudienceFilter): IxcGridParam {
    const day = (v?: string) => resolveDynamicValue(String(v ?? '')).trim();
    const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    const start = (v: string) => (isDay(v) ? `${v} 00:00:00` : v);
    const end = (v: string) => (isDay(v) ? `${v} 23:59:59` : v);
    const v = day(f.value);
    switch (f.op) {
      case '=':
        return { TB, OP: 'BE', P: start(v), P2: end(v) };
      case '!=':
        return { TB, OP: 'NBE', P: start(v), P2: end(v) };
      case '>':
      case '<=':
        return { TB, OP: f.op, P: end(v) };
      case '<':
      case '>=':
        return { TB, OP: f.op, P: start(v) };
      case 'BE':
      case 'NBE':
        return { TB, OP: f.op, P: start(v), P2: end(day(f.value2)) };
      default:
        return { TB, OP: f.op, P: v };
    }
  }

  /** Mapa id -> nome das cidades do IXC. */
  async cityNames(): Promise<Map<string, string>> {
    const rows = await this.cached('cidades', () => this.ixc.all('cidade'));
    return new Map(rows.map((r) => [r.id, r.uf ? `${r.nome} - ${r.uf}` : r.nome]));
  }

  async resolve(spec: AudienceSpec, opts: { refresh?: boolean } = {}): Promise<AudienceResult & { raw: Map<string, IxcRecord> }> {
    const filters = spec.filters ?? [];
    const byTable = new Map<string, AudienceFilter[]>();
    for (const f of filters) {
      if (!IXC_TABLES.some((t) => t.table === f.table)) throw new BadRequestException(`Tabela não suportada: ${f.table}`);
      byTable.set(f.table, [...(byTable.get(f.table) ?? []), f]);
    }

    // 1) clientes que passam nos filtros da tabela cliente
    const clientGrid = this.gridFor(byTable.get('cliente') ?? [], 'cliente');
    const clients = await this.cached(`cliente:${JSON.stringify(clientGrid)}`, () => this.ixc.all('cliente', clientGrid), opts.refresh);

    // 2) cada tabela relacionada vira um conjunto de ids de cliente (interseção)
    let allowed = null as Set<string> | null;
    for (const [table, tf] of byTable) {
      if (table === 'cliente' || table === 'sendtec') continue;
      const def = IXC_TABLES.find((t) => t.table === table)!;
      const grid = this.gridFor(tf, table);
      const rows = await this.cached(`${table}:${JSON.stringify(grid)}`, () => this.ixc.all(table, grid), opts.refresh);
      const ids = new Set(rows.map((r) => String(r[def.clientKey])));
      allowed = allowed ? new Set([...allowed].filter((id: string) => ids.has(id))) : ids;
    }
    for (const f of byTable.get('sendtec') ?? []) {
      const ids = await this.virtualFilter(f, clients, opts.refresh);
      allowed = allowed ? new Set([...allowed].filter((id: string) => ids.has(id))) : ids;
    }

    const ixcCfg = await this.settings.get('ixc');
    const phoneFields = spec.phoneFields?.length ? spec.phoneFields : ixcCfg.phoneFields;
    const cities = await this.cityNames().catch(() => new Map<string, string>());
    const areas = spec.areas ?? [];
    const excluded = new Set((spec.excludedClientIds ?? []).map(String));

    const contractCoords = ixcCfg.coordSource === 'contrato' ? await this.contractCoords(opts.refresh) : null;

    const raw = new Map<string, IxcRecord>();
    const list: AudienceClient[] = [];
    for (const c of clients) {
      if (allowed && !allowed.has(String(c.id))) continue;
      raw.set(String(c.id), c);
      const fromContract = contractCoords?.get(String(c.id));
      const lat = fromContract ? fromContract[0] : parseCoord(c.latitude);
      const lng = fromContract ? fromContract[1] : parseCoord(c.longitude);
      let phone: string | null = null;
      for (const f of phoneFields) {
        phone = normalizeBrPhone(c[f], ixcCfg.defaultDdd || undefined);
        if (phone) break;
      }
      list.push({
        id: String(c.id),
        name: c.razao || c.fantasia || `Cliente ${c.id}`,
        phone,
        lat,
        lng,
        bairro: c.bairro || '',
        cidade: cities.get(String(c.cidade)) ?? '',
        inArea: areas.length === 0 ? true : lat !== null && lng !== null && insideAnyArea(lat, lng, areas),
      });
    }

    const seen = new Set<string>();
    const selected: AudienceClient[] = [];
    let withoutPhone = 0;
    let duplicates = 0;
    let excludedCount = 0;
    for (const c of list) {
      if (!c.inArea) continue;
      if (excluded.has(c.id)) {
        excludedCount++;
        continue;
      }
      if (!c.phone) {
        withoutPhone++;
        continue;
      }
      if (seen.has(c.phone)) {
        duplicates++;
        continue;
      }
      seen.add(c.phone);
      selected.push(c);
    }

    return {
      raw,
      clients: list,
      selected,
      stats: {
        matched: list.length,
        withCoords: list.filter((c) => c.lat !== null).length,
        inArea: list.filter((c) => c.inArea).length,
        withoutPhone,
        duplicates,
        excluded: excludedCount,
        selected: selected.length,
      },
    };
  }

  /** Filtros calculados pelo Sendtec a partir dos dados do IXC. */
  private async virtualFilter(f: AudienceFilter, clients: IxcRecord[], refresh?: boolean): Promise<Set<string>> {
    const now = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (f.field === 'aniversario') {
      const days = f.value === 'semana' ? 7 : 0;
      const wanted = new Set<string>();
      for (let i = 0; i <= days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        wanted.add(iso(d).slice(5));
      }
      const month = iso(now).slice(5, 7);
      return new Set(
        clients
          .filter((c) => /^\d{4}-\d{2}-\d{2}/.test(c.data_nascimento || '') && c.data_nascimento !== '0000-00-00')
          .filter((c) => (f.value === 'mes' ? c.data_nascimento.slice(5, 7) === month : wanted.has(c.data_nascimento.slice(5, 10))))
          .map((c) => String(c.id)),
      );
    }

    if (f.field === 'pagamento') {
      const m = /^(em_dia|atrasou)_(\d+)$/.exec(String(f.value));
      if (!m) throw new BadRequestException('Histórico de pagamento inválido');
      const [, kind, span] = [m[0], m[1], Number(m[2])];
      const from = new Date(now);
      from.setMonth(from.getMonth() - span);
      const today = iso(now);
      // títulos com vencimento no período (já vencidos)
      const rows = await this.cached(`pagamento:${span}:${today}`, () =>
        this.ixc.all('fn_areceber', [
          { TB: 'fn_areceber.data_vencimento', OP: 'BE', P: toIxcValue(iso(from)), P2: toIxcValue(today) },
          { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
        ]), refresh);
      const late = new Set<string>();
      const seen = new Set<string>();
      for (const r of rows) {
        const id = String(r.id_cliente);
        seen.add(id);
        const paidAt = (r.pagamento_data || r.baixa_data || '').slice(0, 10);
        const venc = (r.data_vencimento || '').slice(0, 10);
        const paidLate = r.status !== 'A' && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) && paidAt > venc;
        const openOverdue = (r.status === 'A' || r.status === 'P') && r.liberado !== 'N' && venc < today;
        if (paidLate || openOverdue) late.add(id);
      }
      return kind === 'atrasou' ? late : new Set([...seen].filter((id) => !late.has(id)));
    }

    if (f.field === 'tempo_casa') {
      const months = Number(f.value);
      if (!Number.isFinite(months)) throw new BadRequestException('Informe o tempo de casa em meses');
      const contracts = await this.cached('contratos:ativacao', () => this.ixc.all('cliente_contrato'), refresh);
      const first = new Map<string, string>();
      for (const c of contracts) {
        const d = (c.data_ativacao || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === '0000-00-00') continue;
        const id = String(c.id_cliente);
        if (!first.has(id) || d < first.get(id)!) first.set(id, d);
      }
      const limit = new Date(now);
      limit.setMonth(limit.getMonth() - months);
      const cut = iso(limit);
      // ">= N meses": primeira ativação até a data de corte; "<= N meses": depois dela
      return new Set([...first].filter(([, d]) => (f.op === '<=' ? d >= cut : d <= cut)).map(([id]) => id));
    }

    throw new BadRequestException(`Filtro desconhecido: ${f.field}`);
  }

  /** Todos os campos que uma tabela tem no IXC deste provedor (lidos de um registro real). */
  async fieldsOf(table: string): Promise<string[]> {
    const def = IXC_TABLES.find((t) => t.table === table);
    if (!def || def.virtual) throw new BadRequestException('Tabela não suportada');
    const res = await this.cached(`campos:${table}`, () => this.ixc.page(table, [], 1, 1));
    return Object.keys(res.registros?.[0] ?? {}).sort();
  }

  /** Coordenadas do endereço de instalação (primeiro contrato ativo com coordenadas, senão qualquer um). */
  private async contractCoords(refresh?: boolean): Promise<Map<string, [number, number]>> {
    const rows = await this.cached('contratos:coords', () => this.ixc.all('cliente_contrato'), refresh);
    const out = new Map<string, [number, number]>();
    const ranked = [...rows].sort((a, b) => Number(b.status === 'A') - Number(a.status === 'A'));
    for (const r of ranked) {
      const lat = parseCoord(r.latitude);
      const lng = parseCoord(r.longitude);
      if (lat !== null && lng !== null && !out.has(String(r.id_cliente))) out.set(String(r.id_cliente), [lat, lng]);
    }
    return out;
  }

  /** Opções para campos com lookup (cidade, filial, plano, tipo de cliente). */
  async lookup(kind: string): Promise<{ value: string; label: string }[]> {
    const sources: Record<string, { table: string; label: (r: IxcRecord) => string }> = {
      cidade: { table: 'cidade', label: (r) => (r.uf ? `${r.nome} - ${r.uf}` : r.nome) },
      filial: { table: 'filial', label: (r) => r.fantasia || r.razao || `Filial ${r.id}` },
      plano: { table: 'vd_contratos', label: (r) => r.nome || r.descricao || `Plano ${r.id}` },
      tipo_cliente: { table: 'tipo_cliente', label: (r) => r.tipo_cliente || r.descricao || r.nome || `Tipo ${r.id}` },
      colaborador: { table: 'funcionarios', label: (r) => (r.funcionario || `Colaborador ${r.id}`) + (r.ativo === 'N' ? ' (inativo)' : '') },
      assunto: { table: 'su_oss_assunto', label: (r) => r.assunto || r.descricao || `Assunto ${r.id}` },
      vendedor: { table: 'vendedor', label: (r) => (r.nome || `Vendedor ${r.id}`) + (r.status === 'I' ? ' (inativo)' : '') },
    };
    const src = sources[kind];
    if (!src) throw new BadRequestException('Lookup desconhecido');
    const rows = await this.cached(`lookup:${kind}`, () => this.ixc.all(src.table));
    return rows.map((r) => ({ value: String(r.id), label: src.label(r) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  /** Para cidades, só as que realmente têm clientes — evita listas de 5 mil municípios. */
  async citiesInUse(): Promise<{ value: string; label: string }[]> {
    const clients = await this.cached('cliente:[]', () => this.ixc.all('cliente', []));
    const used = new Set(clients.map((c) => String(c.cidade)));
    const names = await this.cityNames();
    return [...used]
      .filter((id) => names.has(id))
      .map((id) => ({ value: id, label: names.get(id)! }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }
}
