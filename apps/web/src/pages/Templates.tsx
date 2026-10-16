import { AlertTriangle, MessageSquareText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { templateInfo } from '../lib/template';
import type { Template } from '../lib/types';
import { Button, Card, Empty, PageHeader, Spinner, StatusBadge, useToast } from '../components/ui';

const FILTERS = [
  { v: '', l: 'Todos' },
  { v: 'APPROVED', l: 'Aprovados' },
  { v: 'PENDING', l: 'Em análise' },
  { v: 'REJECTED', l: 'Rejeitados' },
];

export function TemplatesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Template[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => api<Template[]>('/templates').then(setItems), []);

  const sync = async (silent = false) => {
    setSyncing(true);
    try {
      await api('/templates/sync', { method: 'POST' });
      await load();
      if (!silent) toast('Modelos sincronizados com a Meta');
    } catch (e: any) {
      if (!silent) toast(e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  // acompanha a aprovação automaticamente enquanto houver modelos em análise
  const hasPending = items?.some((t) => t.status === 'PENDING' || t.status === 'IN_APPEAL');
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => sync(true), 30_000);
    return () => clearInterval(t);
  }, [hasPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (t: Template) => {
    if (!confirm(`Excluir o modelo "${t.name}" também na Meta?`)) return;
    try {
      await api(`/templates/${t.id}`, { method: 'DELETE' });
      toast('Modelo excluído');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const visible = (items ?? []).filter((t) => t.status !== 'DELETED' && (!filter || t.status === filter));

  return (
    <>
      <PageHeader
        title="Modelos de mensagem"
        subtitle="Modelos aprovados pela Meta para iniciar conversas no WhatsApp"
        actions={
          <>
            <Button variant="outline" loading={syncing} onClick={() => sync()} icon={<RefreshCw className="h-4 w-4" />}>
              Sincronizar
            </Button>
            <Link to="/modelos/novo">
              <Button icon={<Plus className="h-4 w-4" />}>Novo modelo</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${filter === f.v ? 'bg-brand text-snow' : 'bg-white/5 text-ink-300 hover:text-white'}`}
          >
            {f.l}
          </button>
        ))}
        {hasPending && <span className="ml-auto self-center text-xs text-amber-300">Verificando a aprovação a cada 30 segundos…</span>}
      </div>

      {!items ? (
        <Spinner className="mx-auto mt-16 h-8 w-8" />
      ) : !visible.length ? (
        <Empty
          icon={<MessageSquareText />}
          title="Nenhum modelo por aqui"
          text="Crie um modelo ou sincronize os que já existem na sua conta do WhatsApp Business."
          action={
            <Link to="/modelos/novo">
              <Button icon={<Plus className="h-4 w-4" />}>Criar modelo</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t, i) => {
            const info = templateInfo(t.components);
            return (
              <Card key={t.id} className="group flex flex-col p-5 animate-fade-up" >
                <div style={{ animationDelay: `${i * 30}ms` }} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold">{t.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StatusBadge status={t.category} />
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-ink-300">{t.language}</span>
                      {t.qualityScore && t.qualityScore !== 'UNKNOWN' && (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-ink-300">Qualidade: {t.qualityScore}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-4 flex-1 rounded-xl bg-[#1f2c34]/70 p-3 text-[13px] leading-snug text-[#e9edef]">
                  {info.headerFormat === 'IMAGE' && <div className="mb-2 h-20 rounded-lg bg-brand-soft" />}
                  {info.headerText && <div className="mb-1 font-bold">{info.headerText}</div>}
                  <div className="line-clamp-5 whitespace-pre-wrap">{info.bodyText}</div>
                  {info.buttons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {info.buttons.map((b: any, j: number) => (
                        <span key={j} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-[#53bdeb]">{b.text}</span>
                      ))}
                    </div>
                  )}
                </div>
                {t.status === 'REJECTED' && t.rejectedReason && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Motivo: {t.rejectedReason}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
                  <span>Atualizado {fmtDateTime(t.updatedAt)}</span>
                  <Link
                    to={`/modelos/novo?from=${t.id}`}
                    className="ml-auto mr-1 rounded-lg px-2 py-1 text-xs font-semibold text-fuchsia-300 opacity-0 transition hover:bg-white/5 group-hover:opacity-100"
                  >
                    Criar a partir deste
                  </Link>
                  {user?.role === 'ADMIN' && (
                    <button onClick={() => remove(t)} className="rounded-lg p-1.5 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
