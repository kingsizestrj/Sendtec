import { CalendarClock, Megaphone, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDateTime, fmtNumber, pct } from '../lib/format';
import type { Campaign } from '../lib/types';
import { Button, Card, Empty, PageHeader, Spinner, StatusBadge } from '../components/ui';

export function CampaignsPage() {
  const [items, setItems] = useState<Campaign[] | null>(null);

  useEffect(() => {
    const load = () => api<Campaign[]>('/campaigns').then(setItems);
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader
        title="Campanhas"
        subtitle="Disparos de modelos para clientes do IXC"
        actions={
          <Link to="/campanhas/nova">
            <Button icon={<Plus className="h-4 w-4" />}>Nova campanha</Button>
          </Link>
        }
      />
      {!items ? (
        <Spinner className="mx-auto mt-16 h-8 w-8" />
      ) : !items.length ? (
        <Empty
          icon={<Megaphone />}
          title="Sua primeira campanha começa aqui"
          text="Escolha um modelo aprovado, filtre clientes do IXC ou desenhe uma área no mapa e dispare."
          action={
            <Link to="/campanhas/nova">
              <Button icon={<Plus className="h-4 w-4" />}>Criar campanha</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
            const done = total - (c.counts.PENDING ?? 0) - (c.counts.SENDING ?? 0);
            const read = c.counts.READ ?? 0;
            const delivered = (c.counts.DELIVERED ?? 0) + read;
            return (
              <Link key={c.id} to={`/campanhas/${c.id}`}>
                <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.06]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold">{c.name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-ink-400">{c.template.name}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.status === 'SCHEDULED' && c.scheduledAt && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                      <CalendarClock className="h-4 w-4" /> {fmtDateTime(c.scheduledAt)}
                    </div>
                  )}
                  {total > 0 && (
                    <>
                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct(done, total)}%` }} />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold">{fmtNumber(total)}</div>
                          <div className="text-[11px] text-ink-400">Clientes</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{pct(delivered, total)}%</div>
                          <div className="text-[11px] text-ink-400">Entregues</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-gradient">{pct(read, total)}%</div>
                          <div className="text-[11px] text-ink-400">Lidas</div>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="mt-4 text-xs text-ink-400">
                    {c.createdBy.name} · {fmtDateTime(c.createdAt)}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
