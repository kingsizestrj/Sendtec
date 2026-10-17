import { randomBytes } from 'crypto';

/** Slug com hífens: só a-z, 0-9 e hífen, sem hífen no começo, no fim ou repetido. */
export function codeSlug(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, max)
    .replace(/^-+|-+$/g, '');
}

/**
 * Código fixo de campanha ou régua: slug do nome + sufixo aleatório (ex.: upgrade-1giga-a7f3).
 * `max` é o tamanho total; réguas usam 30 para sobrar espaço para "-<etapa>" (limite de 40).
 */
export function newCode(name: string, max = 40): string {
  const suffix = Array.from(randomBytes(4), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  const base = codeSlug(name, max - suffix.length - 1) || 'campanha';
  return `${base}-${suffix}`;
}

/** Código de uma etapa de régua: <código da régua>-<etapa> (ex.: cobranca-a7f3-d3). */
export function stepCode(automationCode: string, rawName: string, position: number, taken: Set<string>): string {
  const stepName = rawName.replace(/\+/g, ' mais '); // "D+2" → d-mais-2 (não confunde com "D-2")
  const room = 40 - automationCode.length - 1;
  let part = codeSlug(stepName, Math.min(room, 9)) || `e${position + 1}`;
  let code = `${automationCode}-${part}`;
  for (let i = 2; taken.has(code); i++) {
    part = `${codeSlug(stepName, Math.min(room, 9) - String(i).length - 1) || 'e'}-${i}`.replace(/^-/, '');
    code = `${automationCode}-${part}`;
  }
  return code;
}
