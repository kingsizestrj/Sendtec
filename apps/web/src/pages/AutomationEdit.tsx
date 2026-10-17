import { clsx } from 'clsx';
import { ArrowLeft, Bookmark, ChevronDown, ChevronUp, Download, Play, Plus, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDateTime, fmtNumber } from '../lib/format';
import { templateInfo } from '../lib/template';
import type { AudienceResult, AudienceSpec, Catalog, Roteiro, Template, VariablesConfig } from '../lib/types';
import { EMPTY_SCRIPT, ScriptEditor, scriptFromServer, scriptProblem, useScriptDefaults } from '../components/ScriptEditor';
import { Bot, CheckCircle2, XCircle } from 'lucide-react';
import { FilterBuilder } from '../components/FilterBuilder';
import { MappingEditor } from '../components/MappingEditor';
import { exportAudience, useSavedAudiences } from '../components/AudienceToolbar';
import { Button, Card, Field, PageHeader, Spinner, StatusBadge, Toggle, useToast } from '../components/ui';
import { Automation, WEEKDAYS } from './Automations';

interface StepForm {
  id?: string;
  name: string;
  time: string;
  templateId: string;
  savedAudienceId: string | null;
  audience: AudienceSpec;
  variables: VariablesConfig;
  cooldownDays: number;
  lastResult?: string | null;
  code?: string | null;
  script: Roteiro | null;
  open: boolean;
}

const EMPTY_AUDIENCE: AudienceSpec = { source: 'ixc', filters: [], areas: [], excludedClientIds: [] };
const newStep = (n: number): StepForm => ({
  name: `Etapa ${n}`,
  time: '09:00',
  templateId: '',
  savedAudienceId: null,
  audience: { ...EMPTY_AUDIENCE, filters: [{ table: 'cliente', field: 'ativo', op: '=', value: 'S' }] },
  variables: { body: {}, buttons: {} },
  cooldownDays: 7,
  script: null,
  open: true,
});

function StepEditor({
  step,
  index,
  total,
  catalog,
  templates,
  onChange,
  onRemove,
  onMove,
}: {
  step: StepForm;
  index: number;
  total: number;
  catalog: Catalog;
  templates: Template[];
  onChange: (s: StepForm) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const toast = useToast();
  const { list: saved } = useSavedAudiences();
  const [preview, setPreview] = useState<AudienceResult | null>(null);
  const [checking, setChecking] = useState(false);
  const template = templates.find((t) => t.id === step.templateId);
  const info = useMemo(() => templateInfo(template?.components), [template]);
  const set = (patch: Partial<StepForm>) => onChange({ ...step, ...patch });
  const spec = (saved.find((a) => a.id === step.savedAudienceId)?.audience ?? step.audience) as AudienceSpec;

  const check = async () => {
    setChecking(true);
    try {
      setPreview(await api<AudienceResult>('/ixc/audience/preview?refresh=1', { body: spec }));
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-snow">{index + 1}</span>
        <input className="input max-w-xs" value={step.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: D-3 — fatura vence em 3 dias" />
        <input type="time" className="input w-32" value={step.time} onChange={(e) => set({ time: e.target.value })} />
        <div className="ml-auto flex items-center gap-1">
          <button disabled={index === 0} onClick={() => onMove(-1)} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5 disabled:opacity-30" title="Subir">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button disabled={index === total - 1} onClick={() => onMove(1)} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5 disabled:opacity-30" title="Descer">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={onRemove} className="rounded-lg p-1.5 text-ink-300 hover:bg-rose-500/10 hover:text-rose-300" title="Remover etapa">
            <Trash2 className="h-4 w-4" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => set({ open: !step.open })}>
            {step.open ? 'Recolher' : 'Editar'}
          </Button>
        </div>
      </div>
      {!step.open && <div className="border-t border-white/5 px-4 py-2 text-xs text-ink-400">{template?.name ?? 'sem modelo'} · {step.lastResult ?? 'ainda não rodou'}</div>}
      {step.open && (
        <div className="space-y-6 border-t border-white/5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Modelo">
              <select className="input" value={step.templateId} onChange={(e) => set({ templateId: e.target.value, variables: { body: {}, buttons: {} } })}>
                <option value="">Escolha…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.status !== 'APPROVED' ? `(${t.status.toLowerCase()})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Não reenviar esta etapa para quem recebeu nos últimos" hint="Evita repetir a mensagem todo dia para o mesmo cliente">
              <div className="flex items-center gap-2">
                <input className="input w-24" type="number" min={0} max={365} value={step.cooldownDays} onChange={(e) => set({ cooldownDays: Number(e.target.value) })} />
                <span className="text-sm text-ink-300">dias</span>
              </div>
            </Field>
          </div>

          <div>
            <span className="label">Público</span>
            <div className="mb-3 inline-flex rounded-xl bg-ink-900/70 p-1 ring-1 ring-white/10">
              {(
                [
                  [false, 'Filtros'],
                  [true, 'Público salvo'],
                ] as const
              ).map(([isSaved, l]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => set({ savedAudienceId: isSaved ? saved[0]?.id ?? '' : null })}
                  className={clsx('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', (step.savedAudienceId !== null) === isSaved ? 'bg-brand text-snow' : 'text-ink-300 hover:text-white')}
                >
                  {l}
                </button>
              ))}
            </div>
            {step.savedAudienceId !== null ? (
              <select className="input max-w-md" value={step.savedAudienceId} onChange={(e) => set({ savedAudienceId: e.target.value })}>
                <option value="">{saved.length ? 'Escolha o público…' : 'Nenhum público salvo — salve um na criação de campanha'}</option>
                {saved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <FilterBuilder catalog={catalog} filters={step.audience.filters} onChange={(filters) => set({ audience: { ...step.audience, filters } })} />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" loading={checking} onClick={check} icon={<Users className="h-3.5 w-3.5" />}>
                Quantos receberiam hoje?
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportAudience(spec, `${step.name || 'etapa'}.csv`).catch((e) => toast(e.message, 'error'))} icon={<Download className="h-3.5 w-3.5" />}>
                Exportar CSV
              </Button>
              {preview && (
                <span className="text-sm">
                  <b className="text-gradient text-lg">{fmtNumber(preview.stats.selected)}</b> cliente(s) hoje
                  <span className="text-xs text-ink-400"> (antes de descadastros e da regra de não reenviar)</span>
                </span>
              )}
            </div>
          </div>

          {template && (info.bodyVars > 0 || info.dynamicUrlButtons.length > 0) && (
            <div className="space-y-3">
              <span className="label">Variáveis do modelo</span>
              <p className="-mt-1 text-xs text-ink-400">{info.bodyText}</p>
              {Array.from({ length: info.bodyVars }, (_, i) => String(i + 1)).map((k) => (
                <div key={k} className="grid gap-3 sm:grid-cols-[60px_1fr] sm:items-start">
                  <span className="pt-2.5 font-mono text-sm font-bold text-fuchsia-300">{`{{${k}}}`}</span>
                  <MappingEditor catalog={catalog} value={step.variables.body[k]} onChange={(m) => set({ variables: { ...step.variables, body: { ...step.variables.body, [k]: m } } })} />
                </div>
              ))}
              {info.dynamicUrlButtons.map((idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-[60px_1fr] sm:items-start">
                  <span className="pt-2.5 text-xs font-bold text-fuchsia-300">Link {idx + 1}</span>
                  <MappingEditor
                    catalog={catalog}
                    value={step.variables.buttons?.[String(idx)]}
                    onChange={(m) => set({ variables: { ...step.variables, buttons: { ...(step.variables.buttons ?? {}), [String(idx)]: m } } })}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-4 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="label mb-0">Roteiro próprio desta etapa</span>
                <p className="text-xs text-ink-400">
                  Sem roteiro próprio, vale o roteiro geral da régua.{step.code ? ` Etiqueta: campanha-${step.code}` : ''}
                </p>
              </div>
              <Toggle checked={!!step.script} onChange={(v) => set({ script: v ? { ...EMPTY_SCRIPT, nome: step.name } : null })} label="Usar" />
            </div>
            {step.script && (
              <>
                <ScriptEditor value={step.script} onChange={(sc) => set({ script: sc })} context={{ campaignName: step.name, templateId: step.templateId }} />
                {scriptProblem(step.script) && <p className="text-xs text-amber-300">{scriptProblem(step.script)}</p>}
              </>
            )}
          </div>
          {step.lastResult && <p className="text-xs text-ink-400">Última execução: {step.lastResult}</p>}
        </div>
      )}
    </Card>
  );
}

export function AutomationEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [steps, setSteps] = useState<StepForm[]>([newStep(1)]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; name: string; status: string; createdAt: string; counts: Record<string, number> }[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [script, setScript] = useState<Roteiro | null>(null);
  const [scriptState, setScriptState] = useState<{ code: string | null; error: string | null; syncedAt: string | null } | null>(null);
  const scriptDefaults = useScriptDefaults();

  useEffect(() => {
    api<Catalog>('/ixc/catalog').then(setCatalog);
    api<Template[]>('/templates').then((t) => setTemplates(t.filter((x) => x.status !== 'DELETED')));
    if (id) {
      api<Automation>(`/automations/${id}`).then((a) => {
        setName(a.name);
        setActive(a.active);
        setWeekdays(a.weekdays);
        setScript(scriptFromServer(a.script));
        setScriptState({ code: a.code, error: a.scriptError, syncedAt: a.scriptSyncedAt });
        setSteps(
          a.steps.map((s) => ({
            id: s.id,
            name: s.name,
            time: s.time,
            templateId: s.templateId,
            savedAudienceId: s.savedAudienceId,
            audience: s.audience ?? EMPTY_AUDIENCE,
            variables: { body: s.variables?.body ?? {}, buttons: s.variables?.buttons ?? {} },
            cooldownDays: s.cooldownDays,
            lastResult: s.lastResult,
            code: s.code,
            script: scriptFromServer(s.script),
            open: false,
          })),
        );
        setLoaded(true);
      });
      api(`/automations/${id}/history`).then(setHistory);
    }
  }, [id]);

  const save = async () => {
    const problem = (script && scriptProblem(script)) || steps.map((s, i) => s.script && scriptProblem(s.script) && `Etapa ${i + 1}: ${scriptProblem(s.script)}`).find(Boolean);
    if (problem) return toast(`Roteiro: ${problem}`, 'error');
    setSaving(true);
    try {
      const body = {
        name,
        active,
        weekdays,
        script,
        steps: steps.map(({ open: _o, lastResult: _l, code: _c, ...s }) => ({ ...s, audience: s.savedAudienceId ? EMPTY_AUDIENCE : s.audience })),
      };
      const a = id ? await api<Automation>(`/automations/${id}`, { method: 'PUT', body }) : await api<Automation>('/automations', { body });
      setScriptState({ code: a.code, error: a.scriptError, syncedAt: a.scriptSyncedAt });
      setSteps((all) => all.map((s, i) => ({ ...s, id: a.steps[i]?.id ?? s.id, code: a.steps[i]?.code ?? s.code })));
      if (a.scriptError) toast(`Régua salva, mas o roteiro não foi gravado: ${a.scriptError}`, 'error');
      else toast(active ? 'Régua salva e ativa ✨' : 'Régua salva (pausada)');
      if (!id) nav(`/reguas/${a.id}`, { replace: true });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (stepId: string, label: string) => {
    if (!confirm(`Rodar agora a etapa "${label}"? Uma campanha será criada e disparada para o público de hoje.`)) return;
    try {
      const r = await api<{ result: string }>(`/automations/steps/${stepId}/run`, { method: 'POST' });
      toast(r.result);
      api(`/automations/${id}/history`).then(setHistory);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const remove = async () => {
    if (!confirm('Excluir esta régua? As campanhas já disparadas continuam no histórico de campanhas.')) return;
    await api(`/automations/${id}`, { method: 'DELETE' });
    nav('/reguas');
  };

  if (!catalog || !loaded) return <Spinner className="mx-auto mt-24 h-8 w-8" />;

  return (
    <>
      <PageHeader
        title={id ? name || 'Régua' : 'Nova régua'}
        subtitle="Cada etapa roda uma vez por dia, no horário dela (horário de Brasília), nos dias escolhidos"
        actions={
          <>
            <Link to="/reguas">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Voltar
              </Button>
            </Link>
            {id && <Button variant="ghost" onClick={remove} icon={<Trash2 className="h-4 w-4" />} />}
            <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
              Salvar régua
            </Button>
          </>
        }
      />

      <Card className="mb-6 grid gap-5 p-6 md:grid-cols-[1fr_auto_auto] md:items-end">
        <Field label="Nome da régua">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Régua de cobrança" />
        </Field>
        <div>
          <span className="label">Dias da semana</span>
          <div className="flex gap-1">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}
                className={clsx('rounded-lg px-2.5 py-2 text-xs font-semibold transition', weekdays.includes(i) ? 'bg-brand text-snow' : 'bg-white/5 text-ink-300 hover:text-white')}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="pb-2">
          <Toggle checked={active} onChange={setActive} label={active ? 'Ativa' : 'Pausada'} />
        </div>
      </Card>

      <Card className="mb-6 space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-fuchsia-300">
              <Bot className="h-5 w-5" />
            </div>
            <div className="text-sm">
              <div className="font-bold">Roteiro geral da IA de atendimento</div>
              <p className="text-ink-300">Vale para todas as etapas que não tiverem roteiro próprio. Régua pausada ou excluída desativa os roteiros.</p>
              {scriptState?.code && <div className="mt-1 font-mono text-[11px] text-ink-400">código: {scriptState.code}</div>}
              {script && scriptState?.error && (
                <div className="mt-1 flex items-start gap-1.5 text-rose-300">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {scriptState.error}
                </div>
              )}
              {script && !scriptState?.error && !active && <div className="mt-1 text-ink-400">Régua pausada: os roteiros ficam desativados no atendimento até ela ser ativada.</div>}
              {script && !scriptState?.error && active && scriptState?.syncedAt && (
                <div className="mt-1 flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Gravado em {fmtDateTime(scriptState.syncedAt)}
                </div>
              )}
              {!scriptDefaults?.enabled && (script || steps.some((s) => s.script)) && (
                <div className="mt-1 text-amber-300">Integração com o atendimento não configurada: os roteiros ficam salvos aqui, mas não são enviados.</div>
              )}
            </div>
          </div>
          <Toggle checked={!!script} onChange={(v) => setScript(v ? { ...EMPTY_SCRIPT, nome: name } : null)} label="Usar" />
        </div>
        {script && (
          <>
            <ScriptEditor value={script} onChange={setScript} context={{ campaignName: name, templateId: steps[0]?.templateId }} />
            {scriptProblem(script) && <p className="text-xs text-amber-300">{scriptProblem(script)}</p>}
          </>
        )}
      </Card>

      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={s.id ?? `novo-${i}`}>
            <StepEditor
              step={s}
              index={i}
              total={steps.length}
              catalog={catalog}
              templates={templates}
              onChange={(n) => setSteps((all) => all.map((x, j) => (j === i ? n : x)))}
              onRemove={() => setSteps((all) => all.filter((_, j) => j !== i))}
              onMove={(dir) =>
                setSteps((all) => {
                  const next = [...all];
                  [next[i], next[i + dir]] = [next[i + dir], next[i]];
                  return next;
                })
              }
            />
            {s.id && (
              <div className="mt-1 flex justify-end">
                <button onClick={() => runNow(s.id!, s.name)} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-ink-400 hover:text-fuchsia-300">
                  <Play className="h-3 w-3" /> Rodar agora
                </button>
              </div>
            )}
          </div>
        ))}
        <Button variant="outline" onClick={() => setSteps((all) => [...all, newStep(all.length + 1)])} icon={<Plus className="h-4 w-4" />}>
          Adicionar etapa
        </Button>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3 text-xs text-ink-300">
        <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Dica de cobrança: use filtros com datas relativas (ex.: vencimento = hoje+3 na etapa D-3; vencimento = hoje-2 na etapa D+2). Etapas com horário que já passou hoje começam a rodar amanhã.
      </div>

      {id && (
        <Card className="mt-6 p-5">
          <h3 className="mb-4 font-bold">Execuções</h3>
          {!history.length ? (
            <p className="text-sm text-ink-400">Nenhuma execução ainda.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {history.map((h) => {
                const total = Object.values(h.counts).reduce((a, b) => a + b, 0);
                return (
                  <Link key={h.id} to={`/campanhas/${h.id}`} className="flex items-center gap-4 py-2.5 text-sm hover:opacity-80">
                    <span className="w-32 shrink-0 text-xs text-ink-400">{fmtDateTime(h.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    <span className="text-xs text-ink-300">
                      {fmtNumber(total)} clientes · {fmtNumber(h.counts.READ ?? 0)} lidas
                    </span>
                    <StatusBadge status={h.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
