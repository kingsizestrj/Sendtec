import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Proteção contra tentativa e erro de senha (força bruta).
 * Conta falhas por e-mail e por IP numa janela de 15 minutos; ao passar do limite, bloqueia
 * novas tentativas até a janela expirar. Login com sucesso zera o contador do e-mail.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 50;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function assertNotLocked(email: string, ip: string, now = Date.now()) {
  for (const [key, max] of [[`e:${email}`, MAX_PER_EMAIL], [`i:${ip}`, MAX_PER_IP]] as const) {
    const list = recent(key, now);
    if (list.length >= max) {
      const minutes = Math.ceil((WINDOW_MS - (now - list[0])) / 60000);
      throw new HttpException(`Muitas tentativas de login. Tente novamente em ${minutes} minuto(s).`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

export function registerFailure(email: string, ip: string, now = Date.now()) {
  for (const key of [`e:${email}`, `i:${ip}`]) failures.set(key, [...recent(key, now), now]);
}

export function registerSuccess(email: string) {
  failures.delete(`e:${email}`);
}
