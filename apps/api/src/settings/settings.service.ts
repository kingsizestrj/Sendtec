import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { decrypt, encrypt } from '../common/crypto';
import { AllSettings, DEFAULT_SETTINGS, SECRET_FIELDS } from './settings.types';

export const MASK = '••••••••';

@Injectable()
export class SettingsService {
  private cache: AllSettings | null = null;

  constructor(private prisma: PrismaService) {}

  async get<K extends keyof AllSettings>(section: K): Promise<AllSettings[K]> {
    return (await this.all())[section];
  }

  async all(): Promise<AllSettings> {
    if (this.cache) return this.cache;
    const rows = await this.prisma.setting.findMany();
    const result = structuredClone(DEFAULT_SETTINGS);
    for (const row of rows) {
      const section = row.key as keyof AllSettings;
      if (!(section in result)) continue;
      try {
        Object.assign(result[section], JSON.parse(decrypt(row.value)));
      } catch {
        // valor corrompido ou APP_SECRET trocado: mantém os padrões
      }
    }
    if (!result.chatwoot.webhookToken) {
      result.chatwoot.webhookToken = randomBytes(16).toString('hex');
      await this.save('chatwoot', result.chatwoot);
    }
    this.cache = result;
    return result;
  }

  /** Versão segura para o frontend: segredos mascarados. */
  async masked(): Promise<AllSettings> {
    const all = structuredClone(await this.all());
    for (const [section, fields] of Object.entries(SECRET_FIELDS)) {
      const obj = all[section as keyof AllSettings] as unknown as Record<string, unknown>;
      for (const f of fields) if (obj[f]) obj[f] = MASK;
    }
    return all;
  }

  async update<K extends keyof AllSettings>(section: K, patch: Partial<AllSettings[K]>): Promise<void> {
    const current = await this.get(section);
    const next = { ...current } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === MASK) continue; // segredo não alterado
      next[k] = v;
    }
    await this.save(section, next as unknown as AllSettings[K]);
  }

  private async save<K extends keyof AllSettings>(section: K, value: AllSettings[K]) {
    const enc = encrypt(JSON.stringify(value));
    await this.prisma.setting.upsert({ where: { key: section }, create: { key: section, value: enc }, update: { value: enc } });
    this.cache = null;
  }
}
