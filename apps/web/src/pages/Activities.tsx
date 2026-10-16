import { History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Button, Card, Empty, PageHeader, Spinner } from '../components/ui';

interface Log { id: string; userName: string; action: string; entity: string | null; entityId: string | null; details: Record<string, unknown> | null; createdAt: string }

const detailText = (d: Record<string, unknown> | null) =>
  d
    ? Object.entries(d)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' · ')
    : '';

export function ActivitiesPage() {
  const [data, setData] = useState<{ total: number; items: Log[] } | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => api(`/audit?page=${page}&search=${encodeURIComponent(search)}`).then(setData), 250);
    return () => clearTimeout(t);
  }, [page, search]);

  return (
    <>
      <PageHeader title="Atividades" subtitle="Quem criou, disparou, pausou ou cancelou campanhas e quem alterou configurações e usuários" />
      <Card className="p-5">
        <input
          className="input mb-4 sm:w-80"
          placeholder="Buscar por ação ou usuário"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {!data ? (
          <Spinner className="mx-auto my-10" />
        ) : !data.items.length ? (
          <Empty icon={<History />} title="Nenhuma atividade ainda" text="As ações feitas no Sendtec aparecem aqui." />
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {data.items.map((l) => (
                <div key={l.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="w-32 shrink-0 text-xs text-ink-400">{fmtDateTime(l.createdAt)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <b>{l.userName}</b> · {l.action}
                    </div>
                    {l.details && <div className="truncate text-xs text-ink-400">{detailText(l.details)}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-ink-300">
              <span>
                {data.total.toLocaleString('pt-BR')} registros · página {page} de {Math.max(1, Math.ceil(data.total / 50))}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
