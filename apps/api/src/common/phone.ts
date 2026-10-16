/**
 * Normaliza telefones brasileiros para o formato E.164 (+55DDNNNNNNNNN).
 * Retorna null quando o número não parece um celular/fixo válido.
 */
export function normalizeBrPhone(raw: unknown, defaultDdd?: string): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  digits = digits.replace(/^0+/, '');
  // Remove código de operadora (ex.: 0 15 11 9xxxx) — sobra DDD + número
  if (digits.length === 13 && !digits.startsWith('55')) digits = digits.slice(2);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if ((digits.length === 8 || digits.length === 9) && defaultDdd) digits = defaultDdd + digits;
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  const local = digits.slice(2);
  // Celular com 8 dígitos começando com 6-9: adiciona o nono dígito
  if (local.length === 8 && /^[6-9]/.test(local)) digits = digits.slice(0, 2) + '9' + local;
  return '+55' + digits;
}

export function isMobile(e164: string): boolean {
  return /^\+55\d{2}9\d{8}$/.test(e164);
}
