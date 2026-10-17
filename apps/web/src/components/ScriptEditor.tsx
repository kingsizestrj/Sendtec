import { Bot, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Roteiro } from '../lib/types';
import { Button, Field, Toggle, useToast } from './ui';

export const EMPTY_SCRIPT: Roteiro = { nome: '', instrucoes: '', oferta: null, duvidas: [], quando_humano: null, equipe: 'vendas', valido_ate: null, ativo: true };

const PLACEHOLDER = /\[PREENCH/i;

/** Roteiro vindo do servidor (validade ISO) → formato da tela (aaaa-mm-dd). */
export const scriptFromServer = (s: Roteiro | null | undefined): Roteiro | null => (s ? { ...EMPTY_SCRIPT, ...s, valido_ate: s.valido_ate ? s.valido_ate.slice(0, 10) : null } : null);

/** O que impede salvar o roteiro (mesmas regras do servidor). */
export function scriptProblem(s: Roteiro): string | null {
  if (!s.nome.trim()) return 'Dê um nome ao roteiro';
  if (!s.instrucoes.trim()) return 'Escreva as instruções do roteiro';
  if (s.duvidas.some((d) => !d.pergunta.trim() || !d.resposta.trim())) return 'Preencha pergunta e resposta de todas as dúvidas (ou remova as vazias)';
  const all = [s.nome, s.instrucoes, s.oferta, s.quando_humano, ...s.duvidas.flatMap((d) => [d.pergunta, d.resposta])].join(' ');
  if (PLACEHOLDER.test(all)) return 'Complete os trechos [PREENCHA…] sugeridos pela IA';
  return null;
}

/** Integração de roteiros ligada? E a validade padrão. */
export function useScriptDefaults() {
  const [d, setD] = useState<{ enabled: boolean; validUntil: string } | null>(null);
  useEffect(() => {
    api<{ enabled: boolean; validUntil: string }>('/roteiros/defaults')
      .then(setD)
      .catch(() => setD({ enabled: false, validUntil: '' }));
  }, []);
  return d;
}

/** Editor do roteiro que a IA de atendimento segue com quem responder à campanha. */
export function ScriptEditor({
  value,
  onChange,
  context,
}: {
  value: Roteiro;
  onChange: (s: Roteiro) => void;
  context: { campaignName: string; templateId?: string | null };
}) {
  const toast = useToast();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const set = <K extends keyof Roteiro>(k: K, v: Roteiro[K]) => onChange({ ...value, [k]: v });

  useEffect(() => {
    api<{ enabled: boolean }>('/ai/status')
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => undefined);
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api<{ script: Omit<Roteiro, 'valido_ate' | 'ativo'> }>('/ai/scripts/generate', {
        body: { campaignName: context.campaignName, templateId: context.templateId, objective: notes },
      });
      onChange({ ...value, ...r.script });
      toast('Roteiro sugerido pela IA. Revise antes de salvar.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const hasPlaceholder = PLACEHOLDER.test(JSON.stringify(value));
  const len = (t: string | null, max: number) => `${(t ?? '').length}/${max}`;

  return (
    <div className="space-y-5">
      {aiEnabled && (
        <div className="space-y-3 rounded-2xl border border-fuchsia-500/20 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-fuchsia-300" /> Gerar com IA
          </div>
          <textarea
            className="input min-h-[70px] resize-y text-sm"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional: objetivo, preço, condições e validade da oferta. Ex.: upgrade para 1 Giga por R$ 129,90/mês, sem taxa de instalação, válido até 30/11, só para clientes com fidelidade em dia"
          />
          <Button size="sm" loading={generating} onClick={generate} icon={<Wand2 className="h-3.5 w-3.5" />}>
            {value.instrucoes ? 'Gerar de novo' : 'Gerar roteiro'}
          </Button>
          <p className="text-[11px] text-ink-400">A IA usa o texto do modelo e as suas observações. Ela nunca inventa preço: o que faltar vem marcado como [PREENCHA…].</p>
        </div>
      )}

      {hasPlaceholder && (
        <div className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">Há trechos <b>[PREENCHA…]</b>: complete com os dados reais antes de salvar.</div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nome do roteiro" hint={len(value.nome, 120)}>
          <input className="input" maxLength={120} value={value.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Upgrade 1 Giga — outubro" />
        </Field>
        <Field label="Equipe que recebe a transferência">
          <select className="input" value={value.equipe} onChange={(e) => set('equipe', e.target.value as Roteiro['equipe'])}>
            <option value="vendas">Vendas</option>
            <option value="suporte">Suporte</option>
            <option value="financeiro">Financeiro</option>
          </select>
        </Field>
      </div>

      <Field label="Instruções" hint={<>Objetivo, tom e como conduzir a conversa. {len(value.instrucoes, 8000)}</>}>
        <textarea className="input min-h-[140px] resize-y" maxLength={8000} value={value.instrucoes} onChange={(e) => set('instrucoes', e.target.value)} />
      </Field>

      <Field label="Oferta (opcional)" hint={<>É a <b>única</b> fonte de preço, condições e validade que a IA pode citar. {len(value.oferta, 4000)}</>}>
        <textarea className="input min-h-[90px] resize-y" maxLength={4000} value={value.oferta ?? ''} onChange={(e) => set('oferta', e.target.value || null)} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Dúvidas frequentes ({value.duvidas.length}/30)</span>
          <Button
            size="sm"
            variant="outline"
            disabled={value.duvidas.length >= 30}
            onClick={() => set('duvidas', [...value.duvidas, { pergunta: '', resposta: '' }])}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Dúvida
          </Button>
        </div>
        <div className="space-y-2">
          {value.duvidas.map((d, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-white/[0.03] p-3 sm:grid-cols-[1fr_1.5fr_auto]">
              <input
                className="input"
                maxLength={300}
                placeholder="Pergunta"
                value={d.pergunta}
                onChange={(e) => set('duvidas', value.duvidas.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)))}
              />
              <textarea
                className="input min-h-[42px] resize-y"
                maxLength={1000}
                placeholder="Resposta"
                value={d.resposta}
                onChange={(e) => set('duvidas', value.duvidas.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))}
              />
              <button onClick={() => set('duvidas', value.duvidas.filter((_, j) => j !== i))} className="self-start rounded-lg p-2 text-ink-300 hover:bg-rose-500/10 hover:text-rose-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!value.duvidas.length && <p className="text-xs text-ink-400">Perguntas que os clientes costumam fazer sobre esta campanha, com a resposta certa.</p>}
        </div>
      </div>

      <Field label="Quando passar para uma pessoa (opcional)" hint={len(value.quando_humano, 2000)}>
        <textarea
          className="input min-h-[70px] resize-y"
          maxLength={2000}
          value={value.quando_humano ?? ''}
          onChange={(e) => set('quando_humano', e.target.value || null)}
          placeholder="Ex.: cliente pede cancelamento, reclama de lentidão ou quer negociar valor"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Válido até" hint="Depois desta data a IA volta ao atendimento normal">
          <div className="flex items-center gap-3">
            <input type="date" className="input" disabled={!value.valido_ate} value={value.valido_ate ?? ''} onChange={(e) => set('valido_ate', e.target.value || null)} />
            <label className="flex shrink-0 items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                checked={!value.valido_ate}
                onChange={(e) => set('valido_ate', e.target.checked ? null : new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10))}
              />
              Sem prazo
            </label>
          </div>
        </Field>
        <div className="flex items-end">
          <Toggle checked={value.ativo} onChange={(v) => set('ativo', v)} label="Roteiro ativo" />
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-ink-400">
        <Bot className="h-4 w-4 shrink-0" /> As regras fixas (não inventar preço, voltar ao atendimento normal se o cliente mudar de assunto e orientar sobre o SAIR) entram sozinhas no sistema de atendimento.
      </p>
    </div>
  );
}
