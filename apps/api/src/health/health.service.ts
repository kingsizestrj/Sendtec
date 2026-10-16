import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { IxcClient } from '../ixc/ixc.client';
import { ChatwootClient } from '../chatwoot/chatwoot.client';
import { MetaClient } from '../meta/meta.client';

export interface IntegrationStatus {
  name: 'IXC' | 'Chatwoot' | 'Meta';
  ok: boolean;
  configured: boolean;
  error?: string;
  since: string; // desde quando está nesse estado
  checkedAt: string;
}

/** Confere periodicamente se IXC, Chatwoot e Meta estão respondendo. */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private status = new Map<string, IntegrationStatus>();

  constructor(private settings: SettingsService, private ixc: IxcClient, private chatwoot: ChatwootClient, private meta: MetaClient) {}

  current() {
    return [...this.status.values()];
  }

  private set(name: IntegrationStatus['name'], configured: boolean, ok: boolean, error?: string) {
    const prev = this.status.get(name);
    const now = new Date().toISOString();
    if (prev && prev.ok !== ok) this.logger.warn(`${name} ${ok ? 'voltou a responder' : `parou de responder: ${error}`}`);
    this.status.set(name, { name, configured, ok, error, since: prev && prev.ok === ok ? prev.since : now, checkedAt: now });
  }

  async check() {
    const all = await this.settings.all();
    const run = async (name: IntegrationStatus['name'], configured: boolean, fn: () => Promise<unknown>) => {
      if (!configured) return this.set(name, false, true);
      try {
        const r: any = await fn();
        if (r && r.ok === false) throw new Error(r.error || 'falhou');
        this.set(name, true, true);
      } catch (e: any) {
        this.set(name, true, false, String(e.message).slice(0, 300));
      }
    };
    await Promise.all([
      run('IXC', !!(all.ixc.baseUrl && all.ixc.token), () => this.ixc.test(all.ixc)),
      run('Chatwoot', !!(all.chatwoot.baseUrl && all.chatwoot.apiToken), () => this.chatwoot.test(all.chatwoot)),
      run('Meta', !!(all.meta.wabaId && all.meta.accessToken), () => this.meta.test(all.meta)),
    ]);
    return this.current();
  }
}
