export function normalizeKeyword(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .toUpperCase();
}

export function firstName(full: string): string {
  const first = (full || '').trim().split(/\s+/)[0] || '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function titleCase(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_m, s, c) => s + c.toUpperCase());
}

/** "2026-10-16" -> "16/10/2026" (mantém o valor se não for data ISO) */
export function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

export function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Resolve tokens de data relativos usados nos filtros: @hoje, @hoje-5, @hoje+3 */
export function resolveDynamicValue(value: string, now = new Date()): string {
  const m = /^@hoje([+-]\d+)?$/i.exec((value || '').trim());
  if (!m) return value;
  const d = new Date(now);
  if (m[1]) d.setDate(d.getDate() + Number(m[1]));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
