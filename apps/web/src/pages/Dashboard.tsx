import { CheckCheck, Megaphone, MessageSquareText, Plus, Send, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, fmtNumber, pct } from '../lib/format';
import type { Campaign } from '../lib/types';
import { Button, Card, Empty, PageHeader, Spinner, Stat, StatusBadge } from '../components/ui';

interface Stats {
  messages: Record<string, number>;
  campaigns: Record<string, number>;
  templates: Record<string, number>;
  optOuts: number;
  daily: { day: string; sent: number; read: number }[];
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    api<Stats>('/dashboard').then(setStats);
    api<Campaign[]>('/campaigns').then((c) => setCampaigns(c.slice(0, 5)));
  }, []);

  if (!stats) return <Spinner className="mx-auto mt-24 h-8 w-8" />;
  const m = stats.messages;
  const sent = (m.SENT ?? 0) + (m.DELIVERED ?? 0) + (m.READ ?? 0) + (m.FAILED ?? 0);
  const delivered = (m.DELIVERED ?? 0) + (m.READ ?? 0);
  const read = m.READ ?? 0;
  const hello = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <PageHeader
        title={
          <>
            {hello}, <span className="text-gradient">{user?.name.split(' ')[0]}</span>
          </>
        }
        subtitle="Resumo dos últimos 30 dias"
        actions={
          <Link to="/campanhas/nova">
            <Button icon={<Plus className="h-4 w-4" />}>Nova campanha</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Mensagens enviadas" value={fmtNumber(sent)} icon={<Send className="h-4 w-4" />} accent="bg-violet-500" />
        <Stat label="Entregues" value={`${pct(delivered, sent)}%`} sub={`${fmtNumber(delivered)} mensagens`} icon={<CheckCheck className="h-4 w-4" />} accent="bg-fuchsia-500" />
        <Stat label="Lidas" value={`${pct(read, sent)}%`} sub={`${fmtNumber(read)} mensagens`} icon={<CheckCheck className="h-4 w-4 text-sky-400" />} accent="bg-orange-500" />
        <Stat label="Descadastros" value={fmtNumber(stats.optOuts)} icon={<UserX className="h-4 w-4" />} accent="bg-rose-500" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-bold">Envios por dia</h3>
            <div className="flex gap-4 text-xs text-ink-300">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-fuchsia-500" /> Enviadas</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-orange-400" /> Lidas</span>
            </div>
          </div>
          {stats.daily.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.daily.map((d) => ({ ...d, label: d.day.slice(8, 10) + '/' + d.day.slice(5, 7) }))}>
                <defs>
                  <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#d946ef" stopOpacity={0.5} />
                    <stop offset="1" stopColor="#d946ef" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fb923c" stopOpacity={0.45} />
                    <stop offset="1" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="label" stroke="#8b86b3" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8b86b3" fontSize={11} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ background: '#15122a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }} />
                <Area type="monotone" dataKey="sent" name="Enviadas" stroke="#d946ef" strokeWidth={2.5} fill="url(#gs)" />
                <Area type="monotone" dataKey="read" name="Lidas" stroke="#fb923c" strokeWidth={2.5} fill="url(#gr)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-[260px] place-items-center text-sm text-ink-400">Nenhum envio nos últimos 30 dias</div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="mb-5 font-bold">Modelos</h3>
          <div className="space-y-3">
            {[
              ['APPROVED', 'Aprovados', 'bg-emerald-400'],
              ['PENDING', 'Em análise', 'bg-amber-400'],
              ['REJECTED', 'Rejeitados', 'bg-rose-400'],
            ].map(([k, label, color]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                <span className="flex items-center gap-2.5 text-sm">
                  <i className={`h-2.5 w-2.5 rounded-full ${color}`} />
                  {label}
                </span>
                <span className="text-lg font-bold">{stats.templates[k] ?? 0}</span>
              </div>
            ))}
          </div>
          <Link to="/modelos/novo">
            <Button variant="outline" className="mt-5 w-full" icon={<MessageSquareText className="h-4 w-4" />}>
              Criar modelo
            </Button>
          </Link>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Campanhas recentes</h3>
          <Link to="/campanhas" className="text-sm text-fuchsia-300 hover:underline">
            Ver todas
          </Link>
        </div>
        {campaigns.length ? (
          <div className="divide-y divide-white/5">
            {campaigns.map((c) => {
              const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
              return (
                <Link key={c.id} to={`/campanhas/${c.id}`} className="flex items-center gap-4 py-3 transition hover:opacity-80">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft">
                    <Megaphone className="h-4 w-4 text-fuchsia-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="text-xs text-ink-400">
                      {c.template.name} · {fmtDateTime(c.createdAt)}
                    </div>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <div className="font-semibold">{fmtNumber(total)}</div>
                    <div className="text-xs text-ink-400">destinatários</div>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Megaphone />} title="Nenhuma campanha ainda" text="Crie a primeira e veja os números aparecerem aqui." />
        )}
      </Card>
    </>
  );
}
