import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { guessColumns, parseCsv } from '../lib/csv';
import type { CsvAudience } from '../lib/types';
import { Button, Field } from './ui';

const MAX_ROWS = 20000;
const MODEL = '﻿nome;telefone;id_ixc;valor;vencimento\nMaria da Silva;(61) 99999-0001;123;R$ 99,90;10/11\nJoão Pereira;61988880002;;R$ 129,90;15/11\n';

export function CsvUploader({ value, onChange }: { value: CsvAudience | null; onChange: (csv: CsvAudience | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const load = async (file?: File) => {
    if (!file) return;
    setError('');
    const buf = await file.arrayBuffer();
    // planilhas antigas do Excel vêm em Latin-1; tenta UTF-8 primeiro
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const { columns, rows } = parseCsv(text);
    if (!columns.length || !rows.length) return setError('Não encontrei linhas nessa planilha. A primeira linha precisa ser o cabeçalho.');
    if (rows.length > MAX_ROWS) return setError(`A planilha tem ${rows.length} linhas; o máximo é ${MAX_ROWS}.`);
    const guess = guessColumns(columns);
    setFileName(file.name);
    onChange({ columns, rows, phoneColumn: guess.phoneColumn, nameColumn: guess.nameColumn, ixcIdColumn: guess.ixcIdColumn });
  };

  const downloadModel = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([MODEL], { type: 'text/csv;charset=utf-8' }));
    a.download = 'modelo-sendtec.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const col = (key: 'phoneColumn' | 'nameColumn' | 'ixcIdColumn', label: string, hint: string, required = false) => (
    <Field label={label} hint={hint}>
      <select className="input" value={value?.[key] ?? ''} onChange={(e) => onChange({ ...value!, [key]: e.target.value })}>
        <option value="">{required ? 'Escolha a coluna…' : '— nenhuma —'}</option>
        {value?.columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="space-y-5">
      <input ref={ref} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
      {!value ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            load(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 px-6 py-12 text-center text-ink-300 transition hover:border-fuchsia-500/50 hover:text-white"
        >
          <Upload className="h-8 w-8 text-fuchsia-300" />
          <span className="font-semibold">Clique ou arraste a planilha (.csv)</span>
          <span className="text-xs text-ink-400">No Excel: Arquivo → Salvar como → "CSV (separado por vírgulas ou ponto e vírgula)". Primeira linha = nomes das colunas.</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-emerald-300" />
            <div>
              <div className="text-sm font-semibold">{fileName || 'Planilha carregada'}</div>
              <div className="text-xs text-ink-400">
                {value.rows.length.toLocaleString('pt-BR')} linhas · {value.columns.length} colunas
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
              Trocar planilha
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { onChange(null); setFileName(''); }} icon={<X className="h-3.5 w-3.5" />} />
          </div>
        </div>
      )}
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      <button type="button" onClick={downloadModel} className="inline-flex items-center gap-1.5 text-xs text-fuchsia-300 hover:underline">
        <Download className="h-3.5 w-3.5" /> Baixar planilha de exemplo
      </button>

      {value && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {col('phoneColumn', 'Coluna do telefone *', 'Aceita com ou sem DDD, +55, espaços e traços', true)}
            {col('nameColumn', 'Coluna do nome', 'Usada no Chatwoot e na variável "Primeiro nome"')}
            {col('ixcIdColumn', 'Código do cliente no IXC', 'Opcional: libera variáveis de contrato e fatura')}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] text-left text-ink-400">
                <tr>
                  {value.columns.map((c) => (
                    <th key={c} className={`whitespace-nowrap px-3 py-2 font-semibold ${c === value.phoneColumn ? 'text-fuchsia-300' : ''}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {value.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {value.columns.map((c) => (
                      <td key={c} className="whitespace-nowrap px-3 py-2 text-ink-300">
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {value.rows.length > 5 && <p className="text-xs text-ink-400">Mostrando 5 de {value.rows.length.toLocaleString('pt-BR')} linhas.</p>}
        </>
      )}
    </div>
  );
}
