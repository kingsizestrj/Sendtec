/** Leitor de CSV simples: aceita ; , ou tab, aspas e quebras de linha do Windows (formato do Excel). */
export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    records.push(row);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  const header = (nonEmpty.shift() ?? []).map((h, i) => h.trim() || `coluna_${i + 1}`);
  // nomes repetidos ganham sufixo para não se sobrescreverem
  const columns = header.map((h, i) => (header.indexOf(h) === i ? h : `${h}_${i + 1}`));
  const rows = nonEmpty.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  return { columns, rows };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Sugere as colunas de telefone, nome e código do IXC pelo nome do cabeçalho. */
export function guessColumns(columns: string[]) {
  const find = (re: RegExp) => columns.find((c) => re.test(norm(c)));
  return {
    phoneColumn: find(/whats|celular|telefone|fone|phone|numero|contato/) ?? '',
    nameColumn: find(/^nome|cliente|razao|name/) ?? '',
    ixcIdColumn: find(/^(id|codigo|cod|id_cliente|id_ixc|cod_cliente|codigo_cliente)$/) ?? '',
  };
}
