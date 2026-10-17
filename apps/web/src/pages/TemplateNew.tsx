import { ArrowLeft, ImagePlus, Plus, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { AiReviewModal, AiWriter, Draft, Issue, IssueList } from '../components/AiAssistant';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { localMedia } from '../lib/format';
import type { Template } from '../lib/types';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { countVars } from '../lib/template';
import { Button, Card, Field, PageHeader, useToast } from '../components/ui';
import { PhonePreview } from '../components/PhonePreview';

type Btn = { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; urlExample?: string; phoneNumber?: string };

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function TemplateNewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { company } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [image, setImage] = useState<{ id: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [body, setBody] = useState('Olá {{1}}! ');
  const [examples, setExamples] = useState<string[]>(['Maria']);
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const fixMode = params.get('fix') === '1';
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [fixInfo, setFixInfo] = useState<{ loading: boolean; explanation?: string; changes?: string[]; reason?: string | null } | null>(null);

  useEffect(() => {
    api<{ enabled: boolean }>('/ai/status')
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  /** Preenche o formulário com um rascunho vindo da IA (mantém a imagem do cabeçalho, se houver). */
  const applyDraft = (d: Draft) => {
    setName(d.name);
    setCategory(d.category);
    if (d.headerText) {
      setHeaderType('TEXT');
      setHeaderText(d.headerText);
    } else setHeaderType((h) => (h === 'IMAGE' ? 'IMAGE' : 'NONE'));
    setBody(d.body);
    setExamples(d.examples);
    setFooter(d.footer ?? '');
    setButtons(
      d.buttons.map((b) =>
        b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url ?? 'https://' } : b.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: b.text, phoneNumber: b.phoneNumber ?? '' } : { type: 'QUICK_REPLY', text: b.text },
      ),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // "Criar a partir deste": preenche o formulário com um modelo existente
  useEffect(() => {
    if (!fromId) return;
    api<Template>(`/templates/${fromId}`).then((t) => {
      const comp = (type: string) => t.components.find((c: any) => c.type === type);
      const header = comp('HEADER');
      const body = comp('BODY');
      setName(`${t.name}_v2`.slice(0, 512));
      setCategory(t.category === 'UTILITY' ? 'UTILITY' : 'MARKETING');
      setLanguage(t.language);
      if (header?.format === 'TEXT') {
        setHeaderType('TEXT');
        setHeaderText(header.text ?? '');
      } else if (header?.format === 'IMAGE' && t.headerMediaId) {
        setHeaderType('IMAGE');
        setImage({ id: t.headerMediaId, preview: localMedia(t.headerMediaUrl) ?? '' });
      } else if (header?.format === 'IMAGE') setHeaderType('IMAGE');
      setBody(body?.text ?? '');
      setExamples(body?.example?.body_text?.[0] ?? []);
      setFooter(comp('FOOTER')?.text ?? '');
      setButtons(
        (comp('BUTTONS')?.buttons ?? []).map((b: any) =>
          b.type === 'URL'
            ? { type: 'URL', text: b.text, url: b.url, urlExample: b.example?.[0] }
            : b.type === 'PHONE_NUMBER'
              ? { type: 'PHONE_NUMBER', text: b.text, phoneNumber: b.phone_number }
              : { type: 'QUICK_REPLY', text: b.text },
        ),
      );
      // "Corrigir com IA": explica a rejeição e já preenche a versão corrigida
      if (fixMode) {
        setFixInfo({ loading: true, reason: t.rejectedReason });
        api<{ explanation: string; changes: string[]; improved: Draft }>(`/ai/templates/${fromId}/fix`, { method: 'POST' })
          .then((r) => {
            setFixInfo({ loading: false, explanation: r.explanation, changes: r.changes, reason: t.rejectedReason });
            applyDraft(r.improved);
          })
          .catch((e) => {
            setFixInfo(null);
            toast(e.message, 'error');
          });
      }
    });
  }, [fromId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);

  const vars = countVars(body);
  const draft: Draft = useMemo(
    () => ({ name, category, headerText: headerType === 'TEXT' ? headerText : null, body, examples: examples.slice(0, vars), footer: footer || null, buttons }),
    [name, category, headerType, headerText, body, examples, vars, footer, buttons],
  );

  // conferência automática das regras da Meta enquanto digita (sem IA, sem custo)
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ issues: Issue[] }>('/ai/templates/check', { body: draft })
        .then((r) => setIssues(r.issues))
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [draft]);
  const blocking = issues.filter((i) => i.severity === 'bloqueia');

  const exampleValues = useMemo(() => Object.fromEntries(examples.slice(0, vars).map((v, i) => [String(i + 1), v])), [examples, vars]);

  const insertVar = () => {
    const next = vars + 1;
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? body.length;
    setBody(body.slice(0, pos) + `{{${next}}}` + body.slice(pos));
    setExamples((e) => [...e, '']);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const media = await api<{ id: string }>('/media', { form });
      setImage({ id: media.id, preview: URL.createObjectURL(file) });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const addOptOut = () => {
    if (buttons.length >= 10) return;
    setButtons([...buttons, { type: 'QUICK_REPLY', text: 'Sair' }]);
    if (!footer) setFooter('Toque em "Sair" para não receber mais ofertas');
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api('/templates', {
        body: {
          name,
          category,
          language,
          header: { type: headerType, text: headerText, mediaId: image?.id },
          body: { text: body, examples: examples.slice(0, vars) },
          footer,
          buttons,
        },
      });
      toast('Modelo enviado para análise da Meta 🎉');
      nav('/modelos');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const seg = (opts: [string, string][], value: string, set: (v: any) => void) => (
    <div className="inline-flex rounded-xl bg-ink-900/70 p-1 ring-1 ring-white/10">
      {opts.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          className={clsx('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', value === v ? 'bg-brand text-snow shadow-glow' : 'text-ink-300 hover:text-white')}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title={fixMode ? 'Corrigir modelo rejeitado' : fromId ? 'Novo modelo (a partir de outro)' : 'Novo modelo'}
        subtitle="Depois de enviado, a Meta costuma analisar em alguns minutos"
        actions={
          <Link to="/modelos">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
              Voltar
            </Button>
          </Link>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {fixInfo && (
            <Card className="space-y-3 border border-fuchsia-500/20 p-6">
              <div className="flex items-center gap-2 font-bold">
                <Sparkles className={`h-5 w-5 text-fuchsia-300 ${fixInfo.loading ? 'animate-pulse' : ''}`} />
                {fixInfo.loading ? 'A IA está analisando a rejeição…' : 'Por que a Meta rejeitou'}
              </div>
              {fixInfo.reason && <p className="text-xs text-ink-400">Motivo informado pela Meta: {fixInfo.reason}</p>}
              {fixInfo.explanation && <p className="text-sm text-ink-200">{fixInfo.explanation}</p>}
              {!!fixInfo.changes?.length && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-300">
                  {fixInfo.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {!fixInfo.loading && <p className="text-xs text-emerald-300">A versão corrigida já está no formulário abaixo. Confira e envie.</p>}
            </Card>
          )}
          {aiEnabled && !fixMode && <AiWriter onUse={applyDraft} />}
          <Card className="space-y-5 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome do modelo" hint="Minúsculas, números e _ (é assim que a Meta exige)">
                <input className="input font-mono" value={name} onChange={(e) => setName(slugify(e.target.value))} placeholder="promo_fibra_500mb" />
              </Field>
              <Field label="Idioma">
                <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="pt_BR">Português (BR)</option>
                  <option value="es">Espanhol</option>
                  <option value="en_US">Inglês (EUA)</option>
                </select>
              </Field>
            </div>
            <div>
              <span className="label">Categoria</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['MARKETING', 'Marketing', 'Ofertas, upgrades de plano, novidades e promoções.'],
                    ['UTILITY', 'Utilidade', 'Avisos de fatura, manutenção, confirmação de serviço.'],
                  ] as const
                ).map(([v, l, d]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCategory(v)}
                    className={clsx('rounded-2xl border p-4 text-left transition', category === v ? 'border-fuchsia-500/60 bg-brand-soft' : 'border-white/10 hover:border-white/20')}
                  >
                    <div className="font-bold">{l}</div>
                    <div className="mt-1 text-xs text-ink-300">{d}</div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold">Cabeçalho</h3>
              {seg([['NONE', 'Nenhum'], ['TEXT', 'Texto'], ['IMAGE', 'Imagem']], headerType, setHeaderType)}
            </div>
            {headerType === 'TEXT' && (
              <Field hint={`${headerText.length}/60`}>
                <input className="input" maxLength={60} value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="🚀 Novidade na sua região!" />
              </Field>
            )}
            {headerType === 'IMAGE' && (
              <div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload(e.target.files?.[0])} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative grid aspect-[1.91/1] w-full max-w-md place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-white/10 text-ink-300 transition hover:border-fuchsia-500/50 hover:text-white"
                >
                  {image ? (
                    <img src={image.preview} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-sm">
                      <ImagePlus className="h-8 w-8" />
                      {uploading ? 'Enviando…' : 'Clique para escolher (JPG ou PNG, até 5 MB)'}
                    </span>
                  )}
                </button>
                <p className="mt-2 text-xs text-ink-400">A imagem vai de exemplo para a Meta e também é usada por padrão nas campanhas. Proporção ideal 1,91:1 (ex.: 1200×628).</p>
              </div>
            )}
          </Card>

          <Card className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Mensagem</h3>
              <Button size="sm" variant="outline" onClick={insertVar} icon={<Plus className="h-3.5 w-3.5" />}>
                Variável
              </Button>
            </div>
            <Field hint={<>Use *negrito*, _itálico_ e ~riscado~. Variáveis como {'{{1}}'} são preenchidas com dados do IXC na campanha. {body.length}/1024</>}>
              <textarea ref={bodyRef} className="input min-h-[160px] resize-y" maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            {vars > 0 && (
              <div>
                <span className="label">Exemplos para a análise da Meta</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: vars }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 font-mono text-xs text-fuchsia-300">{`{{${i + 1}}}`}</span>
                      <input
                        className="input"
                        value={examples[i] ?? ''}
                        onChange={(e) => setExamples((ex) => Object.assign([...ex], { [i]: e.target.value }))}
                        placeholder={i === 0 ? 'Maria' : 'exemplo'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Field label="Rodapé (opcional)" hint={`${footer.length}/60`}>
              <input className="input" maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Sua Internet • Atendimento 24h" />
            </Field>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">Botões</h3>
              <div className="flex flex-wrap gap-2">
                {category === 'MARKETING' && (
                  <Button size="sm" variant="outline" onClick={addOptOut}>
                    + Botão "Sair"
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={buttons.length >= 10} onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}>
                  + Resposta rápida
                </Button>
                <Button size="sm" variant="outline" disabled={buttons.length >= 10} onClick={() => setButtons([...buttons, { type: 'URL', text: '', url: 'https://' }])}>
                  + Link
                </Button>
                <Button size="sm" variant="outline" disabled={buttons.length >= 10} onClick={() => setButtons([...buttons, { type: 'PHONE_NUMBER', text: '', phoneNumber: '+55' }])}>
                  + Ligar
                </Button>
              </div>
            </div>
            {category === 'MARKETING' && !buttons.length && (
              <p className="text-xs text-ink-400">Dica: um botão "Sair" registra o descadastro automaticamente quando o cliente toca nele.</p>
            )}
            {buttons.map((b, i) => (
              <div key={i} className="grid gap-3 rounded-xl bg-white/[0.03] p-3 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-center">
                <span className="text-xs font-semibold text-ink-300">{b.type === 'URL' ? 'Link' : b.type === 'PHONE_NUMBER' ? 'Ligar' : 'Resposta'}</span>
                <input
                  className="input"
                  maxLength={25}
                  placeholder="Texto do botão"
                  value={b.text}
                  onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                {b.type === 'URL' ? (
                  <input
                    className="input"
                    placeholder="https://site.com/{{1}}"
                    value={b.url}
                    onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                ) : b.type === 'PHONE_NUMBER' ? (
                  <input
                    className="input"
                    placeholder="+5561999999999"
                    value={b.phoneNumber}
                    onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phoneNumber: e.target.value } : x)))}
                  />
                ) : (
                  <span />
                )}
                <button onClick={() => setButtons(buttons.filter((_, j) => j !== i))} className="justify-self-end rounded-lg p-2 text-ink-300 hover:bg-rose-500/10 hover:text-rose-300">
                  <Trash2 className="h-4 w-4" />
                </button>
                {b.type === 'URL' && countVars(b.url) > 0 && (
                  <input
                    className="input sm:col-span-3 sm:col-start-2"
                    placeholder="URL completa de exemplo (ex.: https://site.com/abc123)"
                    value={b.urlExample ?? ''}
                    onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, urlExample: e.target.value } : x)))}
                  />
                )}
              </div>
            ))}
          </Card>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <PhonePreview
            company={company}
            headerFormat={headerType === 'NONE' ? null : headerType}
            headerText={headerText}
            imageUrl={image?.preview}
            body={body}
            footer={footer}
            buttons={buttons}
            values={exampleValues}
          />
          {issues.length > 0 && (
            <div className="mt-6">
              <span className="label">Conferência das regras da Meta</span>
              <IssueList issues={issues} />
            </div>
          )}
          {aiEnabled && (
            <Button variant="outline" className="mt-6 w-full" disabled={!body.trim()} onClick={() => setReviewOpen(true)} icon={<ShieldCheck className="h-4 w-4" />}>
              Revisar com IA antes de enviar
            </Button>
          )}
          <Button
            className="mt-3 w-full"
            loading={saving}
            disabled={!name || !body.trim() || blocking.length > 0}
            title={blocking.length ? 'Corrija os itens em vermelho antes de enviar' : undefined}
            onClick={submit}
            icon={<Send className="h-4 w-4" />}
          >
            Enviar para aprovação
          </Button>
        </div>
      </div>
      <AiReviewModal open={reviewOpen} draft={draft} onClose={() => setReviewOpen(false)} onApply={applyDraft} />
    </>
  );
}
