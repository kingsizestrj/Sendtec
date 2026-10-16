import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AudienceFilter, Catalog } from '../lib/types';
import { Button } from './ui';

// título em aberto, como na documentação do IXC: liberado e não recebido nem cancelado (inclui parciais)
const OPEN_INVOICE: AudienceFilter[] = [
  { table: 'fn_areceber', field: 'liberado', op: '=', value: 'S' },
  { table: 'fn_areceber', field: 'status', op: '!=', value: 'R' },
  { table: 'fn_areceber', field: 'status', op: '!=', value: 'C' },
];

const PRESETS: { label: string; filters: AudienceFilter[] }[] = [
  { label: 'Clientes ativos', filters: [{ table: 'cliente', field: 'ativo', op: '=', value: 'S' }] },
  { label: 'Contrato ativo', filters: [{ table: 'cliente_contrato', field: 'status', op: '=', value: 'A' }] },
  { label: 'Internet bloqueada', filters: [{ table: 'cliente_contrato', field: 'status_internet', op: 'IN', value: 'CM,CA,FA' }] },
  {
    label: 'Fatura vencida há +5 dias',
    filters: [...OPEN_INVOICE, { table: 'fn_areceber', field: 'data_vencimento', op: '<', value: '@hoje-5' }],
  },
  {
    label: 'Fatura vence em 3 dias',
    filters: [...OPEN_INVOICE, { table: 'fn_areceber', field: 'data_vencimento', op: '=', value: '@hoje+3' }],
  },
  { label: '2+ parcelas em atraso', filters: [{ table: 'cliente_contrato', field: 'num_parcelas_atraso', op: '>=', value: '2' }] },
  { label: 'OS aberta', filters: [{ table: 'su_oss_chamado', field: 'status', op: 'IN', value: 'A,AN,EN,AS,AG,DS,EX,RAG' }] },
  {
    label: 'OS finalizada nos últimos 7 dias',
    filters: [
      { table: 'su_oss_chamado', field: 'status', op: '=', value: 'F' },
      { table: 'su_oss_chamado', field: 'data_fechamento', op: '>=', value: '@hoje-7' },
    ],
  },
  { label: 'Aniversariantes do dia', filters: [{ table: 'sendtec', field: 'aniversario', op: '=', value: 'hoje' }] },
  { label: 'Bons pagadores (6 meses)', filters: [{ table: 'sendtec', field: 'pagamento', op: '=', value: 'em_dia_6' }] },
  { label: 'Clientes há +2 anos', filters: [{ table: 'sendtec', field: 'tempo_casa', op: '>=', value: '24' }] },
  {
    label: 'Contrato expira em 30 dias',
    filters: [
      { table: 'cliente_contrato', field: 'status', op: '=', value: 'A' },
      { table: 'cliente_contrato', field: 'data_expiracao', op: 'BE', value: '@hoje', value2: '@hoje+30' },
    ],
  },
  { label: 'Cadastrados nos últimos 30 dias', filters: [{ table: 'cliente', field: 'data_cadastro', op: '>=', value: '@hoje-30' }] },
];

const lookupCache: Record<string, Promise<{ value: string; label: string }[]>> = {};
const loadLookup = (kind: string) => (lookupCache[kind] ??= api(`/ixc/lookup/${kind}`).catch(() => {
  delete lookupCache[kind];
  return [];
}));

// todos os campos que cada tabela tem no IXC deste provedor (lidos de um registro real)
const fieldsCache: Record<string, Promise<string[]>> = {};
const loadFields = (table: string) => (fieldsCache[table] ??= api<string[]>(`/ixc/fields/${table}`).catch(() => {
  delete fieldsCache[table];
  return [];
}));

type TableInfo = Catalog['tables'][number];

function FieldSelect({ table, value, onChange }: { table?: TableInfo; value: string; onChange: (field: string) => void }) {
  const [all, setAll] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    setAll([]);
    if (table && !table.virtual) loadFields(table.table).then(setAll);
  }, [table]);

  const curated = new Set(table?.fields.map((x) => x.field));
  const extra = all.filter((x) => !curated.has(x));
  const known = value === '' || curated.has(value) || extra.includes(value);

  if (custom || !known) {
    return (
      <div className="flex gap-1">
        <input className="input font-mono" value={value} placeholder="nome_do_campo" autoFocus={custom} onChange={(e) => onChange(e.target.value.replace(/[^a-z0-9_]/gi, ''))} />
        <button type="button" title="Voltar para a lista" onClick={() => { setCustom(false); onChange(''); }} className="rounded-lg px-2 text-xs text-ink-300 hover:bg-white/5 hover:text-white">
          lista
        </button>
      </div>
    );
  }
  return (
    <select className="input" value={value} onChange={(e) => (e.target.value === '__custom' ? (setCustom(true), onChange('')) : onChange(e.target.value))}>
      <option value="">Campo…</option>
      <optgroup label="Principais">
        {table?.fields.map((x) => (
          <option key={x.field} value={x.field}>
            {x.label}
          </option>
        ))}
      </optgroup>
      {extra.length > 0 && (
        <optgroup label={`Todos os campos do IXC (${extra.length})`}>
          {extra.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </optgroup>
      )}
      {!table?.virtual && <option value="__custom">Digitar nome do campo…</option>}
    </select>
  );
}

function DateValue({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const relative = value.startsWith('@');
  const days = relative ? Number(value.replace('@hoje', '') || 0) : 0;
  return (
    <div className="flex flex-1 gap-2">
      <select className="input w-32 shrink-0" value={relative ? 'rel' : 'abs'} onChange={(e) => onChange(e.target.value === 'rel' ? '@hoje' : '')}>
        <option value="rel">Relativa</option>
        <option value="abs">Data fixa</option>
      </select>
      {relative ? (
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm text-ink-300">hoje</span>
          <input
            type="number"
            className="input min-w-0"
            value={days}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange(n === 0 ? '@hoje' : `@hoje${n > 0 ? '+' : ''}${n}`);
            }}
          />
          <span className="text-sm text-ink-300">dias</span>
        </div>
      ) : (
        <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ValueInput({ catalog, f, onChange }: { catalog: Catalog; f: AudienceFilter; onChange: (patch: Partial<AudienceFilter>) => void }) {
  const def = catalog.tables.find((t) => t.table === f.table)?.fields.find((x) => x.field === f.field);
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(def?.options ?? null);

  useEffect(() => {
    if (def?.lookup) loadLookup(def.lookup).then(setOptions);
    else setOptions(def?.options ?? null);
  }, [def]);

  const range = f.op === 'BE' || f.op === 'NBE';
  const list = f.op === 'IN' || f.op === 'NI';
  const text = f.op === 'L' || f.op === 'NL';

  if (range) {
    const one = (v: string, key: 'value' | 'value2', placeholder: string) =>
      def?.type === 'date' || def?.type === 'datetime' ? (
        <DateValue value={v} onChange={(x) => onChange({ [key]: x })} />
      ) : (
        <input className="input" placeholder={placeholder} value={v} onChange={(e) => onChange({ [key]: e.target.value })} />
      );
    return (
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        {one(f.value, 'value', 'de')}
        <span className="text-xs text-ink-400">até</span>
        {one(f.value2 ?? '', 'value2', 'até')}
      </div>
    );
  }

  if (options && list) {
    const selected = new Set(f.value.split(',').filter(Boolean));
    return (
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              selected.has(o.value) ? selected.delete(o.value) : selected.add(o.value);
              onChange({ value: [...selected].join(',') });
            }}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              selected.has(o.value) ? 'border-fuchsia-500/60 bg-brand-soft text-white' : 'border-white/10 text-ink-300 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (options && !text) {
    return (
      <select className="input" value={f.value} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if ((def?.type === 'date' || def?.type === 'datetime') && !text && !list) return <DateValue value={f.value} onChange={(value) => onChange({ value })} />;
  return (
    <input
      className="input"
      value={f.value}
      placeholder={list ? 'valores separados por vírgula' : 'valor'}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}

export function FilterBuilder({ catalog, filters, onChange }: { catalog: Catalog; filters: AudienceFilter[]; onChange: (f: AudienceFilter[]) => void }) {
  const set = (i: number, patch: Partial<AudienceFilter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange([...filters, ...p.filters])}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-fuchsia-500/40 hover:text-white"
          >
            <Sparkles className="h-3 w-3 text-fuchsia-300" /> {p.label}
          </button>
        ))}
      </div>

      {filters.map((f, i) => {
        const table = catalog.tables.find((t) => t.table === f.table);
        const allowedOps = table?.fields.find((x) => x.field === f.field)?.ops;
        return (
          <div key={i} className="grid gap-2 rounded-xl bg-white/[0.03] p-3 md:grid-cols-[180px_200px_170px_1fr_auto] md:items-center">
            <select className="input" value={f.table} onChange={(e) => set(i, { table: e.target.value, field: '', value: '', value2: undefined, op: '=' })}>
              {catalog.tables.map((t) => (
                <option key={t.table} value={t.table}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldSelect
              table={table}
              value={f.field}
              onChange={(field) => {
                const ops = table?.fields.find((x) => x.field === field)?.ops;
                set(i, { field, value: '', value2: undefined, op: ops && !ops.includes(f.op) ? ops[0] : f.op });
              }}
            />
            <select className="input" value={f.op} onChange={(e) => set(i, { op: e.target.value, ...(['IN', 'NI'].includes(e.target.value) !== ['IN', 'NI'].includes(f.op) ? { value: '' } : {}) })}>
              {catalog.operators.filter((o) => !allowedOps || allowedOps.includes(o.value)).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ValueInput catalog={catalog} f={f} onChange={(patch) => set(i, patch)} />
            <button onClick={() => onChange(filters.filter((_, j) => j !== i))} className="justify-self-end rounded-lg p-2 text-ink-300 hover:bg-rose-500/10 hover:text-rose-300">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...filters, { table: 'cliente', field: '', op: '=', value: '' }])}>
        Adicionar filtro
      </Button>
      {filters.length > 1 && <p className="text-xs text-ink-400">Os filtros são combinados com "E": o cliente precisa atender a todos.</p>}
    </div>
  );
}
