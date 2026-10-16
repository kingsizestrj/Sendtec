import type { Catalog, CsvAudience, VariableMapping } from '../lib/types';

const FORMATS = [
  { v: 'none', l: 'Como está' },
  { v: 'title', l: 'Nome Próprio' },
  { v: 'upper', l: 'MAIÚSCULAS' },
  { v: 'date', l: 'Data (dd/mm/aaaa)' },
  { v: 'money', l: 'Moeda (R$)' },
];

export function MappingEditor({
  catalog,
  value,
  onChange,
  csv,
}: {
  catalog: Catalog;
  value?: VariableMapping;
  onChange: (m: VariableMapping) => void;
  csv?: CsvAudience | null;
}) {
  // planilha sem código do IXC: só dados da própria planilha (e nome)
  const sources = csv ? catalog.variableSources.filter((s) => s.source === 'cliente' || csv.ixcIdColumn) : catalog.variableSources;
  const key = value ? (value.source === 'fixo' ? 'fixo' : `${value.source}.${value.field}`) : '';
  return (
    <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
      <select
        className="input"
        value={key}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'fixo') return onChange({ source: 'fixo', value: value?.value ?? '' });
          const dot = v.indexOf('.');
          const [source, field] = [v.slice(0, dot), v.slice(dot + 1)];
          const format = csv ? 'none' : field === 'valor' || field === 'valor_aberto' ? 'money' : field.startsWith('data_') ? 'date' : field === 'primeiro_nome' || field === 'razao' ? 'title' : 'none';
          onChange({ source: source as VariableMapping['source'], field, format, fallback: value?.fallback });
        }}
      >
        <option value="">Escolha o dado…</option>
        {csv && (
          <optgroup label="Planilha (CSV)">
            {csv.columns.map((c) => (
              <option key={c} value={`csv.${c}`}>
                {c}
              </option>
            ))}
          </optgroup>
        )}
        {sources.map((s) => (
          <optgroup key={s.source} label={s.label}>
            {s.fields.filter((f) => !csv || s.source !== 'cliente' || ['primeiro_nome', 'razao'].includes(f.field) || csv.ixcIdColumn).map((f) => (
              <option key={f.field} value={`${s.source}.${f.field}`}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="fixo">✏️ Texto fixo</option>
      </select>
      {value?.source === 'fixo' ? (
        <input className="input" placeholder="Texto para todos" value={value.value ?? ''} onChange={(e) => onChange({ ...value, value: e.target.value })} />
      ) : (
        <select className="input" value={value?.format ?? 'none'} disabled={!value} onChange={(e) => onChange({ ...value!, format: e.target.value })}>
          {FORMATS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.l}
            </option>
          ))}
        </select>
      )}
      {value && value.source !== 'fixo' && (
        <input
          className="input sm:col-span-2"
          placeholder="Se o campo estiver vazio, usar… (ex.: cliente)"
          value={value.fallback ?? ''}
          onChange={(e) => onChange({ ...value, fallback: e.target.value })}
        />
      )}
    </div>
  );
}

