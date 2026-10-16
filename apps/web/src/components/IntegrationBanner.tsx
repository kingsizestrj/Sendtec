import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Status { name: string; ok: boolean; configured: boolean; error?: string; since: string }

/** Faixa no topo quando IXC, Chatwoot ou Meta param de responder (conferido a cada 5 min no servidor). */
export function IntegrationBanner() {
  const { user } = useAuth();
  const [down, setDown] = useState<Status[]>([]);
  useEffect(() => {
    const load = () =>
      api<Status[]>('/health/integrations')
        .then((s) => setDown(s.filter((x) => x.configured && !x.ok)))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 2 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!down.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {down.map((d) => (
        <div key={d.name} className="flex flex-wrap items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <b>{d.name} não está respondendo</b> desde {new Date(d.since).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
            <span className="block truncate text-xs opacity-80">{d.error}</span>
          </div>
          {user?.role === 'ADMIN' && (
            <Link to="/configuracoes" className="text-xs font-semibold underline">
              Ver configurações
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
