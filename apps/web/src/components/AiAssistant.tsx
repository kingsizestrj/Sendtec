import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fill } from '../lib/template';
import { Button, Card, Modal, StatusBadge, useToast } from './ui';

export type Draft = {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  headerText: string | null;
  body: string;
  examples: string[];
  footer: string | null;
  buttons: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string | null; phoneNumber?: string | null }[];
};
export type Issue = { severity: 'bloqueia' | 'risco' | 'dica'; problem: string; fix: string };
type Usage = { model: string; costUsd: number };
type Suggestion = { title: string; categoryReason: string; draft: Draft; variables: { n: number; meaning: string; source: string }[]; issues: Issue[] };

const usd = (u?: Usage) => (u ? `custo aprox. US$ ${u.costUsd.toFixed(4)}` : '');

/** Lista de problemas encontrados (regras da Meta + IA). */
export function IssueList({ issues, compact }: { issues: Issue[]; compact?: boolean }) {
  if (!issues.length) return null;
  const order = { bloqueia: 0, risco: 1, dica: 2 };
  return (
    <ul className="space-y-2">
      {[...issues]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((i, k) => {
          const Icon = i.severity === 'bloqueia' ? ShieldAlert : i.severity === 'risco' ? AlertTriangle : Info;
          return (
            <li
              key={k}
              className={clsx(
                'flex gap-2 rounded-xl p-2.5 text-xs',
                i.severity === 'bloqueia' && 'bg-rose-500/10 text-rose-200',
                i.severity === 'risco' && 'bg-amber-500/10 text-amber-200',
                i.severity === 'dica' && 'bg-sky-500/10 text-sky-200',
              )}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>{i.problem}</b>
                {!compact && <span className="opacity-80"> — {i.fix}</span>}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

function DraftPreview({ draft }: { draft: Draft }) {
  const values = Object.fromEntries(draft.examples.map((v, i) => [String(i + 1), v]));
  return (
    <div className="rounded-xl bg-[#1f2c34]/70 p-3 text-[13px] leading-snug text-[#e9edef]">
      {draft.headerText && <div className="mb-1 font-bold">{draft.headerText}</div>}
      <div className="whitespace-pre-wrap">{fill(draft.body, values)}</div>
      {draft.footer && <div className="mt-1.5 text-[11px] text-[#8696a0]">{draft.footer}</div>}
      {draft.buttons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {draft.buttons.map((b, j) => (
            <span key={j} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-[#53bdeb]">
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Escrever com IA": objetivo → 3 versões prontas para usar. */
export function AiWriter({ onUse }: { onUse: (d: Draft) => void }) {
  const toast = useToast();
  const [objective, setObjective] = useState('');
  const [category, setCategory] = useState<'AUTO' | 'MARKETING' | 'UTILITY'>('AUTO');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ suggestions: Suggestion[]; usage: Usage } | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      setResult(await api('/ai/templates/generate', { body: { objective, category } }));
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4 border border-fuchsia-500/20 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-snow shadow-glow">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold">Escrever com IA</h3>
          <p className="text-sm text-ink-300">Descreva o que você quer comunicar. A IA escreve 3 versões seguindo as regras da Meta e sugere a categoria certa.</p>
        </div>
      </div>
      <textarea
        className="input min-h-[90px] resize-y"
        maxLength={2000}
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        placeholder="Ex.: avisar os clientes do bairro Centro que vamos fazer manutenção na rede na quinta das 2h às 5h da manhã, e pedir desculpas pelo transtorno"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value as any)}>
          <option value="AUTO">Categoria: a IA decide</option>
          <option value="MARKETING">Marketing</option>
          <option value="UTILITY">Utilidade</option>
        </select>
        <Button loading={loading} disabled={objective.trim().length < 8} onClick={generate} icon={<Wand2 className="h-4 w-4" />}>
          {result ? 'Gerar de novo' : 'Gerar 3 versões'}
        </Button>
        {loading && <span className="text-xs text-ink-400">Escrevendo… costuma levar de 10 a 30 segundos</span>}
      </div>

      {result && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            {result.suggestions.map((s, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{s.title}</span>
                  <StatusBadge status={s.draft.category} />
                </div>
                <DraftPreview draft={s.draft} />
                <p className="text-[11px] text-ink-400">{s.categoryReason}</p>
                {s.variables.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-ink-300">
                    {s.variables.map((v) => (
                      <li key={v.n}>
                        <span className="font-mono text-fuchsia-300">{`{{${v.n}}}`}</span> {v.meaning} <span className="text-ink-400">({v.source})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <IssueList issues={s.issues} compact />
                <Button size="sm" className="mt-auto" onClick={() => onUse(s.draft)}>
                  Usar esta versão
                </Button>
              </div>
            ))}
          </div>
          <p className="text-right text-[11px] text-ink-400">{usd(result.usage)}</p>
        </>
      )}
    </Card>
  );
}

type Review = {
  verdict: 'ok' | 'atencao' | 'alto_risco';
  summary: string;
  suggestedCategory: 'MARKETING' | 'UTILITY';
  categoryReason: string;
  issues: Issue[];
  improved: Draft | null;
  improvedIssues: Issue[];
  usage: Usage;
};

const VERDICT = {
  ok: { label: 'Pronto para enviar', cls: 'bg-emerald-500/10 text-emerald-200', Icon: CheckCircle2 },
  atencao: { label: 'Atenção: riscos menores', cls: 'bg-amber-500/10 text-amber-200', Icon: AlertTriangle },
  alto_risco: { label: 'Alto risco de rejeição', cls: 'bg-rose-500/10 text-rose-200', Icon: ShieldAlert },
};

/** Revisão por IA antes de enviar para a Meta. */
export function AiReviewModal({ draft, open, onClose, onApply }: { draft: Draft; open: boolean; onClose: () => void; onApply: (d: Draft) => void }) {
  const toast = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setReview(null);
    try {
      setReview(await api('/ai/templates/review', { body: draft }));
    } catch (e: any) {
      toast(e.message, 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // dispara a revisão ao abrir
  useEffect(() => {
    if (open) void run();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = review ? VERDICT[review.verdict] : null;
  return (
    <Modal open={open} onClose={onClose} title="Revisão com IA" wide>
      {loading || !review || !v ? (
        <div className="flex items-center gap-3 py-10 text-sm text-ink-300">
          <Sparkles className="h-5 w-5 animate-pulse text-fuchsia-300" /> Revisando o modelo contra as regras da Meta…
        </div>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className={clsx('flex items-start gap-2 rounded-xl p-3 text-sm', v.cls)}>
            <v.Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>{v.label}.</b> {review.summary}
            </span>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3 text-sm">
            Categoria indicada: <StatusBadge status={review.suggestedCategory} />
            {review.suggestedCategory !== draft.category && <b className="ml-2 text-amber-300">diferente da escolhida</b>}
            <p className="mt-1 text-xs text-ink-400">{review.categoryReason}</p>
          </div>
          <IssueList issues={review.issues} />
          {review.improved && (
            <div className="space-y-2">
              <span className="label">Versão corrigida sugerida</span>
              <DraftPreview draft={review.improved} />
              <IssueList issues={review.improvedIssues} compact />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <span className="mr-auto text-[11px] text-ink-400">{usd(review.usage)}</span>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {review.improved && (
              <Button
                onClick={() => {
                  onApply(review.improved!);
                  onClose();
                }}
                icon={<Wand2 className="h-4 w-4" />}
              >
                Aplicar versão corrigida
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
