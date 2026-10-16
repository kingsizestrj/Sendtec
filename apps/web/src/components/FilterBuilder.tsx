import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AudienceFilter, Catalog } from '../lib/types';
import { Button } from './ui';

const PRESETS: { label: string; filters: AudienceFilter[] }[] = [
  { label: 'Clientes ativos', filters: [{ table: 'cliente', field: 'ativo', op: '=', value: 'S' }] },
  { label: 'Contrato ativo', filters: [{ table: 'cliente_contrato', field: 'status', op: '=', value: 'A' }] },
  { label: 'Internet bloqueada', filters: [{ table: 'cliente_contrato', field: 'status_internet', op: '=', value: 'CA' }] },
  {
    label: 'Fatura vencida há +5 dias',
    filters: [
      { table: 'fn_areceber', field: 'status', op: '=', value: 'A' },
      { table: 'fn_areceber', field: 'data_vencimento', op: '<', value: '@hoje-5' },
    ],
  },
  {
    label: 'Fatura vence em 3 dias',
    filters: [
      { table: 'fn_areceber', field: 'status', op: '=', value: 'A' },
      { table: 'fn_areceber', field: 'data_vencimento', op: '=', value: '@hoje+3' },
    ],
  },
  { label: 'Cadastrados nos últimos 30 dias', filters: [{ table: 'cliente', field: 'data_cadastro', op: '>=', value: '@hoje-30' }] },
];

const lookupCache: Record<string, Promise<{ value: string; label: string }[]>> = {};
const loadLookup = (kind: string) => (lookupCache[kind] ??= api(`/ixc/lookup/${kind}`).catch(() => {
  delete lookupCache[kind];
  return [];
}));

function ValueInput({ catalog, f, onChange }: { catalog: Catalog; f: AudienceFilter; onChange: (v: string) => void }) {
  const def = catalog.tables.find((t) => t.table === f.table)?.fields.find((x) => x.field === f.field);
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(def?.options ?? null);

  useEffect(() => {
    if (def?.lookup) loadLookup(def.lookup).then(setOptions);
    else setOptions(def?.options ?? null);
  }, [def]);

  if (options && f.op !== 'L') {
    return (
      <select className="input" value={f.value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (def?.type === 'date') {
    const relative = f.value.startsWith('@');
    const days = relative ? Number(f.value.replace('@hoje', '') || 0) : 0;
    return (
      <div className="flex gap-2">
        <select
          className="input w-36 shrink-0"
          value={relative ? 'rel' : 'abs'}
          onChange={(e) => onChange(e.target.value === 'rel' ? '@hoje' : '')}
        >
          <option value="rel">Relativa</option>
          <option value="abs">Data fixa</option>
        </select>
        {relative ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm text-ink-300">hoje</span>
            <input
              type="number"
              className="input"
              value={days}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange(n === 0 ? '@hoje' : `@hoje${n > 0 ? '+' : ''}${n}`);
              }}
            />
            <span className="text-sm text-ink-300">dias</span>
          </div>
        ) : (
          <input type="date" className="input" value={f.value} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    );
  }
  return <input className="input" value={f.value} placeholder="valor" onChange={(e) => onChange(e.target.value)} />;
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
        const known = table?.fields.some((x) => x.field === f.field);
        return (
          <div key={i} className="grid gap-2 rounded-xl bg-white/[0.03] p-3 md:grid-cols-[150px_200px_150px_1fr_auto] md:items-center">
            <select className="input" value={f.table} onChange={(e) => set(i, { table: e.target.value, field: '', value: '' })}>
              {catalog.tables.map((t) => (
                <option key={t.table} value={t.table}>
                  {t.label}
                </option>
              ))}
            </select>
            {known || f.field === '' ? (
              <select
                className="input"
                value={f.field}
                onChange={(e) => (e.target.value === '__custom' ? set(i, { field: 'campo', value: '' }) : set(i, { field: e.target.value, value: '' }))}
              >
                <option value="">Campo…</option>
                {table?.fields.map((x) => (
                  <option key={x.field} value={x.field}>
                    {x.label}
                  </option>
                ))}
                <option value="__custom">Outro campo do IXC…</option>
              </select>
            ) : (
              <input className="input font-mono" value={f.field} placeholder="nome_do_campo" onChange={(e) => set(i, { field: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
            )}
            <select className="input" value={f.op} onChange={(e) => set(i, { op: e.target.value })}>
              {catalog.operators.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ValueInput catalog={catalog} f={f} onChange={(value) => set(i, { value })} />
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
