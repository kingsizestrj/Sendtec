import { AlertTriangle, ArrowLeft, Ban, CalendarX, CheckCheck, Copy, Download, Eye, MessageCircleReply, Pause, Pencil, Play, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api, download } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtNumber, fmtPhone, pct } from '../lib/format';
import type { Campaign, Recipient } from '../lib/types';
import { AudienceMap, MapPoint } from '../components/AudienceMap';
import { Button, Card, PageHeader, Spinner, Stat, StatusBadge, useToast } from '../components/ui';

const COLORS: Record<string, string> = {
  PENDING: '#4b4669',
  SENDING: '#e879f9',
  SENT: '#38bdf8',
  DELIVERED: '#a78bfa',
  READ: '#34d399',
  FAILED: '#f43f5e',
  SKIPPED: '#71717a',
};

const TABS = [
  ['', 'Todos'],
  ['READ', 'Lidas'],
  ['DELIVERED', 'Entregues'],
  ['SENT', 'Enviadas'],
  ['PENDING', 'Na fila'],
  ['FAILED', 'Falhas'],
  ['SKIPPED', 'Ignoradas'],
];

export function CampaignDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { mapCenter } = useAuth();
  const [c, setC] = useState<Campaign | null>(null);
  const [list, setList] = useState<{ total: number; items: Recipient[] } | null>(null);
  const [mapItems, setMapItems] = useState<Recipient[]>([]);
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [replies, setReplies] = useState<{ total: number; buttons: { text: string; count: number }[]; others: number; latest: { name: string; phone: string; reply: string; repliedAt: string }[] } | null>(null);

  const load = useCallback(async () => {
    setC(await api<Campaign>(`/campaigns/${id}`));
    api(`/campaigns/${id}/replies`).then(setReplies).catch(() => undefined);
    setList(await api(`/campaigns/${id}/recipients?status=${tab}&search=${encodeURIComponent(search)}&page=${page}&pageSize=25`));
  }, [id, tab, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const live = c && ['RUNNING', 'SCHEDULED'].includes(c.status);
  useEffect(() => {
    // continua atualizando por um tempo após o fim (confirmações de leitura chegam depois)
    const t = setInterval(load, live ? 4000 : 20000);
    return () => clearInterval(t);
  }, [load, live]);

  const loadMap = useCallback(() => api(`/campaigns/${id}/recipients?pageSize=500&page=1`).then(async (first) => {
    let items: Recipient[] = first.items;
    for (let p = 2; items.length < first.total && p <= 20; p++) items = items.concat((await api(`/campaigns/${id}/recipients?pageSize=500&page=${p}`)).items);
    setMapItems(items);
  }), [id]);
  useEffect(() => {
    loadMap();
    const t = setInterval(loadMap, live ? 15000 : 60000);
    return () => clearInterval(t);
  }, [loadMap, live]);

  const points: MapPoint[] = useMemo(
    () =>
      mapItems
        .filter((r) => r.latitude !== null && r.longitude !== null)
        .map((r) => ({
          id: r.id,
          lat: r.latitude!,
          lng: r.longitude!,
          color: COLORS[r.status] ?? '#999',
          popup: () => `<b>${r.name.replace(/</g, '&lt;')}</b><br/><span style="opacity:.7">${fmtPhone(r.phone)}</span>`,
        })),
    [mapItems],
  );

  const act = async (action: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(action);
    try {
      if (action === 'duplicate') {
        const copy = await api<Campaign>(`/campaigns/${id}/duplicate`, { method: 'POST', body: {} });
        toast('Cópia criada como rascunho');
        return nav(`/campanhas/${copy.id}/editar`);
      }
      if (action === 'delete') {
        await api(`/campaigns/${id}`, { method: 'DELETE' });
        toast('Campanha excluída');
        return nav('/campanhas');
      }
      await api(`/campaigns/${id}/${action}`, { method: 'POST', body: {} });
      await load();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (!c) return <Spinner className="mx-auto mt-24 h-8 w-8" />;
  const k = c.counts;
  const total = Object.values(k).reduce((a, b) => a + b, 0);
  const read = k.READ ?? 0;
  const delivered = (k.DELIVERED ?? 0) + read;
  const sent = (k.SENT ?? 0) + delivered;
  const processed = total - (k.PENDING ?? 0) - (k.SENDING ?? 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.name} <StatusBadge status={c.status} />
          </span>
        }
        subtitle={
          <>
            Modelo <span className="font-mono">{c.template.name}</span> · criada por {c.createdBy.name} em {fmtDateTime(c.createdAt)}
            {c.scheduledAt && c.status === 'SCHEDULED' && <> · agendada para {fmtDateTime(c.scheduledAt)}</>}
          </>
        }
        actions={
          <>
            <Link to="/campanhas">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Voltar
              </Button>
            </Link>
            {['DRAFT', 'SCHEDULED'].includes(c.status) && (
              <Link to={`/campanhas/${c.id}/editar`}>
                <Button variant="outline" icon={<Pencil className="h-4 w-4" />}>
                  Editar
                </Button>
              </Link>
            )}
            {c.status === 'SCHEDULED' && (
              <Button variant="outline" loading={busy === 'unschedule'} onClick={() => act('unschedule')} icon={<CalendarX className="h-4 w-4" />}>
                Desagendar
              </Button>
            )}
            <Button variant="outline" loading={busy === 'duplicate'} onClick={() => act('duplicate')} icon={<Copy className="h-4 w-4" />}>
              Duplicar
            </Button>
            {c.status === 'DRAFT' && (
              <Button loading={busy === 'start'} onClick={() => act('start', 'Disparar a campanha agora?')} icon={<Send className="h-4 w-4" />}>
                Disparar agora
              </Button>
            )}
            {c.status === 'RUNNING' && (
              <Button variant="outline" loading={busy === 'pause'} onClick={() => act('pause')} icon={<Pause className="h-4 w-4" />}>
                Pausar
              </Button>
            )}
            {['PAUSED', 'FAILED'].includes(c.status) && (
              <Button loading={busy === 'resume'} onClick={() => act('resume')} icon={<Play className="h-4 w-4" />}>
                Retomar
              </Button>
            )}
            {(k.FAILED ?? 0) > 0 && !['RUNNING', 'SCHEDULED', 'DRAFT'].includes(c.status) && (
              <Button variant="outline" loading={busy === 'retry-failed'} onClick={() => act('retry-failed', `Reenviar para ${k.FAILED} cliente(s) com falha?`)} icon={<RotateCcw className="h-4 w-4" />}>
                Reenviar falhas
              </Button>
            )}
            {!['COMPLETED', 'CANCELLED', 'DRAFT'].includes(c.status) && (
              <Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', 'Cancelar a campanha? Os envios pendentes não serão feitos.')} icon={<XCircle className="h-4 w-4" />}>
                Cancelar
              </Button>
            )}
            {total > 0 && (
              <Button variant="outline" onClick={() => download(`/campaigns/${c.id}/export.csv`, `${c.name}.csv`)} icon={<Download className="h-4 w-4" />}>
                CSV
              </Button>
            )}
            {['DRAFT', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(c.status) && (
              <Button variant="ghost" loading={busy === 'delete'} onClick={() => act('delete', 'Excluir a campanha e o relatório?')} icon={<Trash2 className="h-4 w-4" />} />
            )}
          </>
        }
      />

      {c.error && (
        <div className="mb-6 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {c.error}
        </div>
      )}

      {total > 0 && (
        <Card className="mb-6 p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold">{c.status === 'RUNNING' ? 'Enviando…' : 'Progresso'}</span>
            <span className="text-ink-300">
              {fmtNumber(processed)} de {fmtNumber(total)}
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
            {['READ', 'DELIVERED', 'SENT', 'FAILED', 'SKIPPED'].map((s) => (
              <div key={s} style={{ width: `${(100 * (k[s] ?? 0)) / total}%`, background: COLORS[s] }} className="h-full transition-all" />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Enviadas" value={fmtNumber(sent)} sub={`${pct(sent, total)}% do público`} icon={<Send className="h-4 w-4" />} accent="bg-sky-500" />
        <Stat label="Entregues" value={fmtNumber(delivered)} sub={`${pct(delivered, sent)}% das enviadas`} icon={<CheckCheck className="h-4 w-4" />} accent="bg-violet-500" />
        <Stat label="Lidas" value={fmtNumber(read)} sub={`${pct(read, delivered)}% das entregues`} icon={<Eye className="h-4 w-4" />} accent="bg-emerald-500" />
        <Stat label="Falhas" value={fmtNumber(k.FAILED)} icon={<AlertTriangle className="h-4 w-4" />} accent="bg-rose-500" />
        <Stat label="Ignoradas" value={fmtNumber(k.SKIPPED)} sub="opt-out ou cancelamento" icon={<Ban className="h-4 w-4" />} accent="bg-zinc-500" />
      </div>

      {replies && replies.total > 0 && (
        <Card className="mt-6 p-5">
          <div className="mb-4 flex items-center gap-2">
            <MessageCircleReply className="h-4 w-4 text-fuchsia-300" />
            <h3 className="font-bold">Respostas dos clientes</h3>
            <span className="text-sm text-ink-400">
              {fmtNumber(replies.total)} responderam ({pct(replies.total, sent)}% das enviadas)
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              {[...replies.buttons.map((b) => ({ label: `"${b.text}"`, count: b.count })), { label: 'Outras respostas', count: replies.others }].map((r) => (
                <div key={r.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="font-bold">{fmtNumber(r.count)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct(r.count, replies.total)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="max-h-72 divide-y divide-white/5 overflow-y-auto pr-1">
              {replies.latest.map((r, i) => (
                <div key={i} className="flex gap-3 py-2 text-sm">
                  <div className="w-36 shrink-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-xs text-ink-400">{fmtDateTime(r.repliedAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-white/[0.04] px-3 py-2 text-ink-300">{r.reply}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {points.length > 0 && (
        <Card className="mt-6 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
            <h3 className="font-bold">Mapa da campanha</h3>
            <div className="flex flex-wrap gap-3 text-xs text-ink-300">
              {[['READ', 'Lida'], ['DELIVERED', 'Entregue'], ['SENT', 'Enviada'], ['PENDING', 'Na fila'], ['FAILED', 'Falha']].map(([s, l]) => (
                <span key={s} className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[s] }} /> {l}
                </span>
              ))}
            </div>
          </div>
          <AudienceMap center={mapCenter} points={points} height={380} />
        </Card>
      )}

      <Card className="mt-6 p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(([v, l]) => (
              <button
                key={v}
                onClick={() => {
                  setTab(v);
                  setPage(1);
                }}
                className={clsx('rounded-full px-3 py-1 text-xs font-semibold transition', tab === v ? 'bg-brand text-snow' : 'bg-white/5 text-ink-300 hover:text-white')}
              >
                {l} {v ? `(${fmtNumber(k[v])})` : `(${fmtNumber(total)})`}
              </button>
            ))}
          </div>
          <input
            className="input lg:w-64"
            placeholder="Nome, telefone ou ID do IXC"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {!list ? (
          <Spinner className="mx-auto my-10" />
        ) : !list.items.length ? (
          <div className="py-12 text-center text-sm text-ink-400">{total ? 'Nada por aqui' : 'Os destinatários aparecem quando o disparo começar.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="pb-3 pr-4 font-semibold">Cliente</th>
                  <th className="pb-3 pr-4 font-semibold">Telefone</th>
                  <th className="pb-3 pr-4 font-semibold">Status</th>
                  <th className="pb-3 pr-4 font-semibold">Enviada</th>
                  <th className="pb-3 pr-4 font-semibold">Lida</th>
                  <th className="pb-3 font-semibold">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {list.items.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-ink-400">{r.ixcClientId.startsWith('linha-') ? `Planilha, linha ${r.ixcClientId.slice(6)}` : `IXC #${r.ixcClientId}`}</div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-300">{fmtPhone(r.phone)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={r.status} recipient />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-300">{fmtDateTime(r.sentAt)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-300">{fmtDateTime(r.readAt)}</td>
                    <td className="max-w-xs py-3 text-xs text-rose-300">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between text-sm text-ink-300">
              <span>
                {fmtNumber(list.total)} registros · página {page} de {Math.max(1, Math.ceil(list.total / 25))}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page * 25 >= list.total} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
