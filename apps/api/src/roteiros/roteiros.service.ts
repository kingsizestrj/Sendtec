import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma.service';
import { stepCode } from '../common/code';

/** Roteiro da IA de atendimento, no formato da API do sistema de conversas. */
export interface Roteiro {
  nome: string;
  instrucoes: string;
  oferta?: string | null;
  duvidas?: { pergunta: string; resposta: string }[];
  quando_humano?: string | null;
  equipe?: 'vendas' | 'suporte' | 'financeiro';
  valido_ate?: string | null; // ISO 8601 com fuso
  ativo?: boolean;
}

export const EQUIPES = ['vendas', 'suporte', 'financeiro'] as const;
const PLACEHOLDER = /\[PREENCH/i;

/**
 * Integração com o sistema de conversas: o roteiro de cada campanha é gravado pela etiqueta
 * (campanha-<código>) para a IA de atendimento saber como responder quem reagir à campanha.
 */
@Injectable()
export class RoteirosService {
  private readonly logger = new Logger(RoteirosService.name);

  constructor(private settings: SettingsService, private prisma: PrismaService) {}

  /** Normaliza e converte a validade "aaaa-mm-dd" (vinda da tela) para ISO com fuso. */
  async prepare(input: Roteiro | null | undefined): Promise<Roteiro | null> {
    if (!input) return null;
    const r = this.normalize(input);
    if (r.valido_ate && /^\d{4}-\d{2}-\d{2}$/.test(r.valido_ate)) r.valido_ate = await this.endOfDay(r.valido_ate);
    return r;
  }

  json(r: Roteiro | null) {
    return r ? (r as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  }

  /**
   * Grava o roteiro de uma campanha no sistema de atendimento.
   * Com `required`, lança erro se não conseguir (antes do disparo: sem roteiro o cliente cai no atendimento normal).
   */
  async syncCampaign(campaignId: string, required = false) {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { code: true, script: true } });
    if (!c?.script || !c.code) return;
    if (!(await this.enabled())) {
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { scriptError: 'Integração de roteiros não configurada: o roteiro não foi enviado' } });
      return;
    }
    try {
      await this.put(c.code, c.script as unknown as Roteiro);
      await this.prisma.campaign.update({ where: { id: campaignId }, data: { scriptSyncedAt: new Date(), scriptError: null } });
    } catch (e: any) {
      await this.prisma.campaign.updateMany({ where: { id: campaignId }, data: { scriptError: String(e.message).slice(0, 500) } });
      if (required) throw new BadRequestException(`O roteiro da IA não foi gravado, por isso a campanha não foi disparada: ${e.message}`);
    }
  }

  /** Desativa o roteiro de uma campanha cancelada ou excluída (sem travar a ação se falhar). */
  async deactivateCampaign(c: { code: string | null; script: unknown }) {
    if (!c.code || !c.script || !(await this.enabled())) return null;
    try {
      await this.deactivate(c.code);
      return null;
    } catch (e: any) {
      this.logger.warn(`Roteiro ${c.code} não foi desativado: ${e.message}`);
      return e.message as string;
    }
  }

  /** Dá código fixo às etapas que ainda não têm. */
  async ensureStepCodes(automationId: string) {
    const a = await this.prisma.automation.findUniqueOrThrow({ where: { id: automationId }, include: { steps: { orderBy: { position: 'asc' } } } });
    const taken = new Set(a.steps.map((s) => s.code).filter(Boolean) as string[]);
    for (const s of a.steps) {
      if (s.code?.startsWith(`${a.code}-`)) continue;
      const code = stepCode(a.code!, s.name, s.position, taken);
      taken.add(code);
      await this.prisma.automationStep.update({ where: { id: s.id }, data: { code } });
    }
  }

  /**
   * Grava os roteiros de uma régua: o geral em <código> e o de cada etapa em <código>-<etapa>.
   * Régua desligada: os roteiros são desativados. `removedCodes`: etapas excluídas ou sem roteiro agora.
   */
  async syncAutomation(automationId: string, required = false, removedCodes: string[] = [], forceActive = false) {
    const a = await this.prisma.automation.findUniqueOrThrow({ where: { id: automationId }, include: { steps: true } });
    const hasAny = !!a.script || a.steps.some((s) => s.script) || removedCodes.length;
    if (!hasAny || !a.code) return;
    if (!(await this.enabled())) {
      await this.prisma.automation.update({ where: { id: a.id }, data: { scriptError: 'Integração de roteiros não configurada: os roteiros não foram enviados' } });
      return;
    }
    const active = a.active || forceActive; // "Rodar agora" numa régua desligada também precisa do roteiro
    const errors: string[] = [];
    const run = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e: any) {
        errors.push(`${label}: ${e.message}`);
      }
    };
    for (const code of removedCodes) await run(code, () => this.deactivate(code));
    if (a.script) await run('roteiro geral', () => (active ? this.put(a.code!, a.script as unknown as Roteiro) : this.deactivate(a.code!)));
    for (const s of a.steps) {
      if (s.script && s.code) await run(`etapa ${s.name}`, () => (active ? this.put(s.code!, s.script as unknown as Roteiro) : this.deactivate(s.code!)));
    }
    const scriptError = errors.length ? errors.join(' · ').slice(0, 1000) : null;
    await this.prisma.automation.update({ where: { id: a.id }, data: { scriptError, ...(scriptError ? {} : { scriptSyncedAt: new Date() }) } });
    if (required && scriptError) throw new BadRequestException(`Roteiro da IA não foi gravado: ${scriptError}`);
  }

  /** Régua excluída: desativa todos os roteiros dela. */
  async deactivateAutomation(a: { code: string | null; script: unknown; steps: { code: string | null; script: unknown }[] }) {
    if (!(await this.enabled())) return;
    const codes = [a.script ? a.code : null, ...a.steps.filter((s) => s.script).map((s) => s.code)].filter(Boolean) as string[];
    for (const code of codes) await this.deactivate(code).catch((e) => this.logger.warn(`Roteiro ${code} não foi desativado: ${e.message}`));
  }

  async enabled() {
    const r = await this.settings.get('roteiros');
    return !!(r.url && r.token);
  }

  /** Confere os limites do contrato e devolve o roteiro limpo (lança erro com o nome do campo). */
  normalize(input: Roteiro): Roteiro {
    const fail = (campo: string, msg: string) => {
      throw new BadRequestException(`Roteiro da IA: ${msg} (${campo})`);
    };
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const r: Roteiro = {
      nome: text(input?.nome),
      instrucoes: text(input?.instrucoes),
      oferta: text(input?.oferta) || null,
      duvidas: (input?.duvidas ?? []).map((d) => ({ pergunta: text(d?.pergunta), resposta: text(d?.resposta) })).filter((d) => d.pergunta || d.resposta),
      quando_humano: text(input?.quando_humano) || null,
      equipe: EQUIPES.includes(input?.equipe as any) ? input.equipe : 'vendas',
      valido_ate: text(input?.valido_ate) || null,
      ativo: input?.ativo !== false,
    };
    if (!r.nome) fail('nome', 'dê um nome ao roteiro');
    if (r.nome.length > 120) fail('nome', 'nome com mais de 120 caracteres');
    if (!r.instrucoes) fail('instrucoes', 'escreva as instruções');
    if (r.instrucoes.length > 8000) fail('instrucoes', 'instruções com mais de 8000 caracteres');
    if ((r.oferta?.length ?? 0) > 4000) fail('oferta', 'oferta com mais de 4000 caracteres');
    if (r.duvidas!.length > 30) fail('duvidas', 'no máximo 30 dúvidas');
    for (const [i, d] of r.duvidas!.entries()) {
      if (!d.pergunta || !d.resposta) fail('duvidas', `a dúvida ${i + 1} precisa de pergunta e resposta`);
      if (d.pergunta.length > 300) fail('duvidas', `a pergunta ${i + 1} passa de 300 caracteres`);
      if (d.resposta.length > 1000) fail('duvidas', `a resposta ${i + 1} passa de 1000 caracteres`);
    }
    if ((r.quando_humano?.length ?? 0) > 2000) fail('quando_humano', '"quando passar para uma pessoa" com mais de 2000 caracteres');
    if (r.valido_ate && Number.isNaN(Date.parse(r.valido_ate))) fail('valido_ate', 'data de validade inválida');
    const all = [r.nome, r.instrucoes, r.oferta, r.quando_humano, ...r.duvidas!.flatMap((d) => [d.pergunta, d.resposta])].join(' ');
    if (PLACEHOLDER.test(all)) fail('oferta', 'ainda há trechos [PREENCHA…] sugeridos pela IA; complete antes de salvar');
    return r;
  }

  /** "2026-11-01" → "2026-11-01T23:59:59-03:00" no fuso configurado. */
  async endOfDay(date: string) {
    const { timezone } = await this.settings.get('general');
    const tz = timezone || 'America/Sao_Paulo';
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${date}T15:00:00Z`))
      .find((p) => p.type === 'timeZoneName')?.value;
    const offset = part && part !== 'GMT' ? part.replace('GMT', '') : '+00:00';
    return `${date}T23:59:59${offset}`;
  }

  /** Data padrão de validade: hoje + N dias (Configurações). */
  async defaultValidity(from = new Date()) {
    const { validityDays } = await this.settings.get('roteiros');
    const { timezone } = await this.settings.get('general');
    const d = new Date(from.getTime() + Math.max(1, Number(validityDays) || 15) * 86400000);
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return this.endOfDay(local);
  }

  async put(code: string, roteiro: Roteiro) {
    return this.request<{ codigo: string; criado: boolean }>('put', code, this.normalize(roteiro));
  }

  /** Desativa (sem apagar). 404 = já não existe, tudo bem. */
  async deactivate(code: string) {
    try {
      return await this.request<{ codigo: string; ativo: boolean }>('delete', code);
    } catch (e: any) {
      if (e.status === 404) return { codigo: code, ativo: false };
      throw e;
    }
  }

  async get(code: string) {
    try {
      return await this.request<Record<string, unknown>>('get', code);
    } catch (e: any) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async test() {
    const code = 'teste-sendtec-01';
    const r = await this.request<{ codigo: string; criado: boolean }>('put', code, { nome: 'Teste integração', instrucoes: 'Teste.', ativo: false });
    await this.deactivate(code);
    return { ok: true, codigo: r.codigo };
  }

  private async request<T>(method: 'get' | 'put' | 'delete', code: string, body?: unknown): Promise<T> {
    const cfg = await this.settings.get('roteiros');
    if (!cfg.url || !cfg.token) throw new BadRequestException('Integração de roteiros não configurada (Configurações → Atendimento com IA)');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code) || code.length > 40) throw new BadRequestException(`Código de campanha inválido: ${code}`);
    const url = `${cfg.url.replace(/\/+$/, '')}/${code}`;
    let lastError: any;
    // erros de rede e 5xx: tenta de novo algumas vezes antes de avisar
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      try {
        const res = await axios.request<T>({ method, url, data: body, timeout: 15000, headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' } });
        return res.data;
      } catch (e) {
        const err = e as AxiosError<any>;
        const status = err.response?.status;
        if (status && status < 500) throw this.error(status, err.response?.data);
        lastError = err;
      }
    }
    const status = (lastError as AxiosError)?.response?.status;
    this.logger.warn(`Roteiro ${code}: ${method.toUpperCase()} falhou (${status ?? lastError?.code ?? lastError?.message})`);
    throw Object.assign(new BadRequestException(status ? `Sistema de atendimento respondeu com erro ${status}. Tente de novo em instantes.` : `Sem conexão com o sistema de atendimento (${lastError?.code ?? lastError?.message}).`), { status });
  }

  private error(status: number, data: any) {
    let msg: string;
    if (status === 401) msg = 'Token da integração de roteiros inválido (Configurações → Atendimento com IA)';
    else if (status === 404) msg = 'Roteiro não encontrado no sistema de atendimento';
    else if (status === 422) msg = `O sistema de atendimento recusou o roteiro: ${data?.error ?? 'dados inválidos'}${data?.campo ? ` (campo ${data.campo})` : ''}`;
    else msg = `Sistema de atendimento respondeu com erro ${status}${data?.error ? `: ${data.error}` : ''}`;
    return Object.assign(new BadRequestException(msg), { status });
  }
}
