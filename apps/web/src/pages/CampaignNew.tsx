import { clsx } from 'clsx';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Check, ImagePlus, MapPinned, RefreshCw, Rocket, Save, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtNumber, fmtPhone, localMedia } from '../lib/format';
import { templateInfo } from '../lib/template';
import type { Area, AudienceFilter, AudienceResult, Campaign, Catalog, Template, VariableMapping, VariablesConfig } from '../lib/types';
import { AudienceMap, MapPoint } from '../components/AudienceMap';
import { FilterBuilder } from '../components/FilterBuilder';
import { PhonePreview } from '../components/PhonePreview';
import { Button, Card, Field, PageHeader, Spinner, StatusBadge, Toggle, useToast } from '../components/ui';

const STEPS = ['Modelo', 'Público', 'Personalização', 'Revisão'];
const FORMATS = [
  { v: 'none', l: 'Como está' },
  { v: 'title', l: 'Nome Próprio' },
  { v: 'upper', l: 'MAIÚSCULAS' },
  { v: 'date', l: 'Data (dd/mm/aaaa)' },
  { v: 'money', l: 'Moeda (R$)' },
];

function MappingEditor({ catalog, value, onChange }: { catalog: Catalog; value?: VariableMapping; onChange: (m: VariableMapping) => void }) {
  const key = value ? (value.source === 'fixo' ? 'fixo' : `${value.source}.${value.field}`) : '';
  return (
    <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
      <select
        className="input"
        value={key}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'fixo') return onChange({ source: 'fixo', value: value?.value ?? '' });
          const [source, field] = v.split('.');
          const format = field === 'valor' || field === 'valor_aberto' ? 'money' : field.startsWith('data_') ? 'date' : field === 'primeiro_nome' || field === 'razao' ? 'title' : 'none';
          onChange({ source: source as VariableMapping['source'], field, format, fallback: value?.fallback });
        }}
      >
        <option value="">Escolha o dado…</option>
        {catalog.variableSources.map((s) => (
          <optgroup key={s.source} label={s.label}>
            {s.fields.map((f) => (
              <option key={f.field} value={`${s.source}.${f.field}`}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="fixo">✏️ Texto fixo</option>
      </select>
      {value?.source === 'fixo' ? (
        <input className="input" placeholder="Texto para todos" value={value.value ?? ''} onChange={(e) => onChange({ ...value, value: e.target.value })} />
      ) : (
        <select className="input" value={value?.format ?? 'none'} disabled={!value} onChange={(e) => onChange({ ...value!, format: e.target.value })}>
          {FORMATS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.l}
            </option>
          ))}
        </select>
      )}
      {value && value.source !== 'fixo' && (
        <input
          className="input sm:col-span-2"
          placeholder="Se o campo estiver vazio, usar… (ex.: cliente)"
          value={value.fallback ?? ''}
          onChange={(e) => onChange({ ...value, fallback: e.target.value })}
        />
      )}
    </div>
  );
}

export function CampaignNewPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { company, mapCenter } = useAuth();

  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(!id);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [filters, setFilters] = useState<AudienceFilter[]>([{ table: 'cliente', field: 'ativo', op: '=', value: 'S' }]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [variables, setVariables] = useState<VariablesConfig>({ body: {}, buttons: {} });
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);
  const [respectOptOut, setRespectOptOut] = useState(true);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  const [audience, setAudience] = useState<AudienceResult | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [audienceError, setAudienceError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Catalog>('/ixc/catalog').then(setCatalog);
    api<Template[]>('/templates').then((t) => setTemplates(t.filter((x) => x.status !== 'DELETED')));
    if (id)
      api<Campaign>(`/campaigns/${id}`).then((c) => {
        setName(c.name);
        setTemplateId(c.templateId);
        setFilters(c.audience.filters ?? []);
        setAreas(c.audience.areas ?? []);
        setExcluded(c.audience.excludedClientIds ?? []);
        setVariables({ body: c.variables.body ?? {}, buttons: c.variables.buttons ?? {} });
        setHeaderUrl(c.headerMediaUrl);
        setRespectOptOut(c.respectOptOut);
        setLoaded(true);
      });
  }, [id]);

  useEffect(() => {
    if (templateId) api<Template>(`/templates/${templateId}`).then(setTemplate);
    else setTemplate(null);
  }, [templateId]);

  const info = useMemo(() => templateInfo(template?.components), [template]);
  const isMarketing = template?.category === 'MARKETING';

  const spec = useMemo(() => ({ filters: filters.filter((f) => f.field && f.value !== ''), areas, excludedClientIds: excluded }), [filters, areas, excluded]);

  const loadAudience = useCallback(
    async (refresh = false) => {
      setLoadingAudience(true);
      setAudienceError('');
      try {
        setAudience(await api<AudienceResult>(`/ixc/audience/preview${refresh ? '?refresh=1' : ''}`, { body: spec }));
      } catch (e: any) {
        setAudienceError(e.message);
      } finally {
        setLoadingAudience(false);
      }
    },
    [spec],
  );

  // recalcula a prévia quando filtros/áreas mudam (o servidor guarda as consultas do IXC em cache)
  useEffect(() => {
    if (step !== 1) return;
    const t = setTimeout(() => loadAudience(), 500);
    return () => clearTimeout(t);
  }, [step, loadAudience]);

  const toggleExclude = useCallback((cid: string) => setExcluded((ex) => (ex.includes(cid) ? ex.filter((x) => x !== cid) : [...ex, cid])), []);

  const points: MapPoint[] = useMemo(() => {
    if (!audience) return [];
    const selected = new Set(audience.selected.map((c) => c.id));
    const ex = new Set(excluded);
    return audience.clients
      .filter((c) => c.lat !== null && c.lng !== null)
      .map((c) => ({
        id: c.id,
        lat: c.lat!,
        lng: c.lng!,
        color: selected.has(c.id) ? '#e879f9' : ex.has(c.id) ? '#f43f5e' : c.inArea ? '#f59e0b' : '#4b4669',
        radius: selected.has(c.id) ? 5.5 : 4,
        popup: () => {
          const el = document.createElement('div');
          el.innerHTML = `<div style="font-weight:700">${c.name.replace(/</g, '&lt;')}</div>
            <div style="opacity:.7;font-size:12px">${fmtPhone(c.phone) || 'sem telefone'} · ${c.bairro.replace(/</g, '&lt;')}</div>`;
          const b = document.createElement('button');
          b.textContent = ex.has(c.id) ? 'Incluir de volta' : 'Remover da campanha';
          b.style.cssText = 'margin-top:8px;padding:4px 10px;border-radius:8px;background:#db2777;color:#fff;font-size:12px;font-weight:600';
          b.onclick = () => toggleExclude(c.id);
          el.appendChild(b);
          return el;
        },
      }));
  }, [audience, excluded, toggleExclude]);

  const previewValues = useMemo(() => {
    const out: Record<string, string> = {};
    const label = (m?: VariableMapping) => {
      if (!m) return '';
      if (m.source === 'fixo') return m.value ?? '';
      const f = catalog?.variableSources.find((s) => s.source === m.source)?.fields.find((x) => x.field === m.field);
      return f ? `[${f.label}]` : '';
    };
    for (let i = 1; i <= info.bodyVars; i++) out[String(i)] = label(variables.body[String(i)]);
    return out;
  }, [variables, info, catalog]);

  const varsOk =
    Array.from({ length: info.bodyVars }, (_, i) => variables.body[String(i + 1)]).every((m) => m && (m.source === 'fixo' ? m.value : m.field)) &&
    info.dynamicUrlButtons.every((idx) => {
      const m = variables.buttons?.[String(idx)];
      return m && (m.source === 'fixo' ? m.value : m.field);
    });

  const canNext = [
    !!name.trim() && template?.status === 'APPROVED',
    (audience?.stats.selected ?? 0) > 0 && !loadingAudience,
    varsOk && (info.headerFormat !== 'IMAGE' || !!headerUrl || !!template?.headerMediaUrl),
    true,
  ][step];

  const uploadHeader = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const media = await api<{ url: string }>('/media', { form });
      setHeaderUrl(media.url);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const save = async (launch: boolean) => {
    setSaving(true);
    try {
      const body = { name, templateId, audience: spec, variables, headerMediaUrl: headerUrl, respectOptOut: isMarketing ? true : respectOptOut };
      const c = id ? await api<Campaign>(`/campaigns/${id}`, { method: 'PATCH', body }) : await api<Campaign>('/campaigns', { body });
      if (launch) {
        await api(`/campaigns/${c.id}/start`, { body: { scheduledAt: when === 'later' ? new Date(scheduledAt).toISOString() : null } });
        toast(when === 'later' ? 'Campanha agendada ✨' : 'Disparo iniciado 🚀');
      } else toast('Rascunho salvo');
      nav(`/campanhas/${c.id}`);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!catalog || !loaded) return <Spinner className="mx-auto mt-24 h-8 w-8" />;

  const approved = templates.filter((t) => t.status === 'APPROVED');
  const listed = (audience?.selected ?? []).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search));

  return (
    <>
      <PageHeader
        title={id ? 'Editar campanha' : 'Nova campanha'}
        actions={
          <Link to="/campanhas">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
              Voltar
            </Button>
          </Link>
        }
      />

      {/* passos */}
      <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              disabled={i > step}
              onClick={() => setStep(i)}
              className={clsx(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
                i === step ? 'bg-brand text-white shadow-glow' : i < step ? 'bg-white/5 text-white' : 'text-ink-400',
              )}
            >
              <span className={clsx('grid h-5 w-5 place-items-center rounded-full text-[11px]', i < step ? 'bg-emerald-500' : 'bg-white/15')}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-white/10" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card className="p-6">
              <Field label="Nome da campanha" hint="Também vira etiqueta nas conversas do Chatwoot">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Upgrade 1 Giga — Setor Norte" />
              </Field>
            </Card>
            <div>
              <span className="label">Escolha o modelo</span>
              {!approved.length && (
                <Card className="p-6 text-sm text-ink-300">
                  Nenhum modelo aprovado ainda.{' '}
                  <Link to="/modelos/novo" className="text-fuchsia-300 underline">
                    Crie um modelo
                  </Link>{' '}
                  ou sincronize em Modelos.
                </Card>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {approved.map((t) => {
                  const ti = templateInfo(t.components);
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTemplateId(t.id);
                        setVariables({ body: {}, buttons: {} });
                      }}
                      className={clsx(
                        'glass rounded-2xl p-4 text-left transition',
                        templateId === t.id ? 'ring-2 ring-fuchsia-500/70 bg-brand-soft' : 'hover:bg-white/[0.06]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-sm font-semibold">{t.name}</span>
                        <StatusBadge status={t.category} />
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-ink-300">{ti.bodyText}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="lg:sticky lg:top-8 lg:self-start">
            {template ? (
              <PhonePreview
                company={company}
                headerFormat={info.headerFormat}
                headerText={info.headerText}
                imageUrl={template.headerMediaUrl}
                body={info.bodyText}
                footer={info.footerText}
                buttons={info.buttons}
              />
            ) : (
              <Card className="grid h-[480px] place-items-center p-6 text-center text-sm text-ink-400">Selecione um modelo para ver a prévia</Card>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-bold">Filtros do IXC</h3>
            <FilterBuilder catalog={catalog} filters={filters} onChange={setFilters} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-fuchsia-300" />
                  <h3 className="font-bold">Selecione por área</h3>
                  {loadingAudience && <Spinner className="h-4 w-4" />}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-300">
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#e879f9]" /> Selecionado</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> Sem telefone/duplicado</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#f43f5e]" /> Removido</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#4b4669]" /> Fora da área</span>
                </div>
              </div>
              <AudienceMap center={mapCenter} points={points} areas={areas} onAreasChange={setAreas} />
              <p className="mt-3 px-2 text-xs text-ink-400">
                Use as ferramentas à esquerda do mapa para desenhar polígonos, retângulos ou círculos. Sem nenhuma área, todos os clientes filtrados entram — inclusive os sem coordenadas.
                Clique em um ponto para removê-lo da campanha.
              </p>
            </Card>

            <div className="space-y-4">
              <Card className="relative overflow-hidden p-6">
                <div className="absolute inset-0 bg-brand opacity-[0.12]" />
                <div className="relative">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-300">Vão receber</div>
                  <div className="mt-1 text-5xl font-extrabold tracking-tight text-gradient">{fmtNumber(audience?.stats.selected)}</div>
                  <div className="text-sm text-ink-300">clientes</div>
                </div>
                {audience && (
                  <div className="relative mt-5 grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Encontrados no IXC', audience.stats.matched],
                      ['Com coordenadas', audience.stats.withCoords],
                      ['Dentro da área', audience.stats.inArea],
                      ['Sem telefone válido', audience.stats.withoutPhone],
                      ['Telefones repetidos', audience.stats.duplicates],
                      ['Removidos à mão', audience.stats.excluded],
                    ].map(([l, v]) => (
                      <div key={l as string} className="rounded-xl bg-black/20 px-3 py-2">
                        <div className="text-ink-400">{l}</div>
                        <div className="text-base font-bold">{fmtNumber(v as number)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="relative mt-4 w-full" loading={loadingAudience} onClick={() => loadAudience(true)} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Buscar novamente no IXC
                </Button>
              </Card>
              {audienceError && (
                <div className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {audienceError}
                </div>
              )}
              <Card className="p-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="max-h-[300px] divide-y divide-white/5 overflow-y-auto pr-1">
                  {listed.slice(0, 200).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="truncate text-xs text-ink-400">
                          {fmtPhone(c.phone)} {c.bairro && `· ${c.bairro}`}
                        </div>
                      </div>
                      <button onClick={() => toggleExclude(c.id)} title="Remover" className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-500/10 hover:text-rose-300">
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {listed.length > 200 && <div className="py-2 text-center text-xs text-ink-400">+ {fmtNumber(listed.length - 200)} clientes</div>}
                </div>
                {excluded.length > 0 && (
                  <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExcluded([])} icon={<UserPlus className="h-3.5 w-3.5" />}>
                    Incluir de volta {excluded.length} removido(s)
                  </Button>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {info.headerFormat === 'IMAGE' && (
              <Card className="p-6">
                <h3 className="mb-1 font-bold">Imagem do cabeçalho</h3>
                <p className="mb-4 text-sm text-ink-300">Por padrão usamos a imagem cadastrada no modelo. Você pode trocar só para esta campanha.</p>
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg" onChange={(e) => uploadHeader(e.target.files?.[0])} />
                <div className="flex flex-wrap items-center gap-4">
                  {(headerUrl || template?.headerMediaUrl) && <img src={localMedia(headerUrl || template?.headerMediaUrl) || ''} className="h-24 rounded-xl object-cover" />}
                  <Button variant="outline" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                    Trocar imagem
                  </Button>
                  {headerUrl && (
                    <Button variant="ghost" onClick={() => setHeaderUrl(null)}>
                      Usar a do modelo
                    </Button>
                  )}
                </div>
              </Card>
            )}
            <Card className="space-y-5 p-6">
              <div>
                <h3 className="font-bold">Variáveis</h3>
                <p className="mt-1 text-sm text-ink-300">Cada variável é preenchida com dados do cliente no IXC no momento do envio.</p>
              </div>
              {info.bodyVars === 0 && !info.dynamicUrlButtons.length && <p className="text-sm text-ink-400">Este modelo não tem variáveis. Pode seguir! ✨</p>}
              {Array.from({ length: info.bodyVars }, (_, i) => String(i + 1)).map((k) => (
                <div key={k} className="grid gap-3 sm:grid-cols-[60px_1fr] sm:items-start">
                  <span className="pt-2.5 font-mono text-sm font-bold text-fuchsia-300">{`{{${k}}}`}</span>
                  <MappingEditor catalog={catalog} value={variables.body[k]} onChange={(m) => setVariables((v) => ({ ...v, body: { ...v.body, [k]: m } }))} />
                </div>
              ))}
              {info.dynamicUrlButtons.map((idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-[60px_1fr] sm:items-start">
                  <span className="pt-2.5 text-xs font-bold text-fuchsia-300">Link {idx + 1}</span>
                  <MappingEditor
                    catalog={catalog}
                    value={variables.buttons?.[String(idx)]}
                    onChange={(m) => setVariables((v) => ({ ...v, buttons: { ...(v.buttons ?? {}), [String(idx)]: m } }))}
                  />
                </div>
              ))}
            </Card>
          </div>
          <div className="lg:sticky lg:top-8 lg:self-start">
            <PhonePreview
              company={company}
              headerFormat={info.headerFormat}
              headerText={info.headerText}
              imageUrl={headerUrl || template?.headerMediaUrl}
              body={info.bodyText}
              footer={info.footerText}
              buttons={info.buttons}
              values={previewValues}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card className="grid gap-4 p-6 sm:grid-cols-3">
              <div>
                <div className="label">Campanha</div>
                <div className="font-bold">{name}</div>
              </div>
              <div>
                <div className="label">Modelo</div>
                <div className="font-mono text-sm font-semibold">{template?.name}</div>
              </div>
              <div>
                <div className="label">Destinatários</div>
                <div className="flex items-center gap-2 text-2xl font-extrabold text-gradient">
                  <Users className="h-5 w-5 text-fuchsia-300" /> {fmtNumber(audience?.stats.selected)}
                </div>
              </div>
            </Card>

            <Card className="space-y-5 p-6">
              <h3 className="font-bold">Quando enviar?</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['now', 'Agora', 'Começa assim que você confirmar', Rocket],
                    ['later', 'Agendar', 'Escolha dia e horário', CalendarClock],
                  ] as const
                ).map(([v, l, d, Icon]) => (
                  <button
                    key={v}
                    onClick={() => setWhen(v)}
                    className={clsx('flex items-start gap-3 rounded-2xl border p-4 text-left transition', when === v ? 'border-fuchsia-500/60 bg-brand-soft' : 'border-white/10 hover:border-white/20')}
                  >
                    <Icon className="mt-0.5 h-5 w-5 text-fuchsia-300" />
                    <div>
                      <div className="font-bold">{l}</div>
                      <div className="text-xs text-ink-300">{d}</div>
                    </div>
                  </button>
                ))}
              </div>
              {when === 'later' && (
                <Field label="Data e hora">
                  <input type="datetime-local" className="input max-w-xs" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </Field>
              )}
              <div className="border-t border-white/5 pt-5">
                {isMarketing ? (
                  <p className="text-sm text-ink-300">✅ Clientes que pediram para sair não recebem campanhas de marketing.</p>
                ) : (
                  <Toggle checked={respectOptOut} onChange={setRespectOptOut} label="Não enviar para quem pediu para sair" />
                )}
              </div>
            </Card>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" loading={saving} onClick={() => save(false)} icon={<Save className="h-4 w-4" />}>
                Salvar rascunho
              </Button>
              <Button
                loading={saving}
                disabled={when === 'later' && !scheduledAt}
                onClick={() => save(true)}
                icon={when === 'later' ? <CalendarClock className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
              >
                {when === 'later' ? 'Agendar campanha' : `Disparar para ${fmtNumber(audience?.stats.selected)} clientes`}
              </Button>
            </div>
            <p className="text-xs text-ink-400">
              A lista final de clientes é buscada novamente no IXC no momento do disparo, com os mesmos filtros e áreas.
            </p>
          </div>
          <div className="lg:sticky lg:top-8 lg:self-start">
            <PhonePreview
              company={company}
              headerFormat={info.headerFormat}
              headerText={info.headerText}
              imageUrl={headerUrl || template?.headerMediaUrl}
              body={info.bodyText}
              footer={info.footerText}
              buttons={info.buttons}
              values={previewValues}
            />
          </div>
        </div>
      )}

      {step < 3 && (
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft className="h-4 w-4" />}>
            Anterior
          </Button>
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continuar <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
