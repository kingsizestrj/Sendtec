import { CheckCircle2, Download, GitCommit, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Button, Card, useToast } from './ui';

interface UpdateStatus {
  available: boolean;
  pending: boolean;
  log: string;
  status: { branch: string; current: string; currentDate: string; latest: string; behind: number; changes: { hash: string; date: string; message: string }[]; checkedAt: string; error: string | null } | null;
  run: { state: 'running' | 'done' | 'failed'; by: string; from: string; to?: string; startedAt: string; finishedAt?: string } | null;
}

/** Atualização do Sendtec pela tela (somente administradores). */
export function UpdatePanel() {
  const toast = useToast();
  const [data, setData] = useState<UpdateStatus | null>(null);
  const [showLog, setShowLog] = useState(false);
  const load = useCallback(() => api<UpdateStatus>('/system/update').then(setData).catch(() => setData(null)), []);
  const running = data?.pending || data?.run?.state === 'running';

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    // durante a atualização a API reinicia: continua tentando até voltar
    const t = setInterval(() => load(), 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const check = async () => {
    await api('/system/update/check', { method: 'POST' });
    toast('Procurando atualizações…');
    setTimeout(load, 6000);
  };
  const apply = async () => {
    if (!confirm('Atualizar o Sendtec agora? O painel fica fora do ar por 1 a 3 minutos. Campanhas em andamento continuam de onde pararam.')) return;
    try {
      await api('/system/update/apply', { method: 'POST' });
      setShowLog(true);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  if (!data) return null;
  const s = data.status;
  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-fuchsia-300">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Atualizações</h3>
            <p className="text-sm text-ink-300">
              {!data.available
                ? 'O serviço de atualização ainda não está rodando neste servidor.'
                : s?.behind
                  ? `${s.behind} melhoria(s) disponível(is)`
                  : 'O Sendtec está na versão mais recente'}
            </p>
          </div>
        </div>
        {data.available && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={check} icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Procurar agora
            </Button>
            {!!s?.behind && (
              <Button size="sm" loading={running} onClick={apply} icon={<Download className="h-3.5 w-3.5" />}>
                Atualizar
              </Button>
            )}
          </div>
        )}
      </div>

      {!data.available && (
        <p className="text-sm text-ink-300">
          Rode uma vez no servidor, na pasta do Sendtec: <code className="rounded bg-white/5 px-1.5 py-0.5">git pull && docker compose up -d --build</code>. A partir daí as próximas
          atualizações podem ser feitas por aqui.
        </p>
      )}

      {s && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
            <span>
              Versão atual: <b className="font-mono text-white">{s.current}</b> ({fmtDateTime(s.currentDate)})
            </span>
            <span>Última verificação: {fmtDateTime(s.checkedAt)}</span>
            {s.error && <span className="text-amber-300">Aviso ao verificar: {s.error}</span>}
          </div>
          {s.changes.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-white/[0.03] p-3">
              {s.changes.map((c) => (
                <div key={c.hash} className="flex items-start gap-2">
                  <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                  <span className="flex-1">{c.message}</span>
                  <span className="shrink-0 text-xs text-ink-400">{fmtDateTime(c.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data.run && (
        <div className="mt-4 space-y-2">
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              running ? 'bg-sky-500/10 text-sky-200' : data.run.state === 'done' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'
            }`}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : data.run.state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {running
              ? `Atualizando (pedido por ${data.run.by})… o painel pode ficar fora do ar por alguns instantes.`
              : data.run.state === 'done'
                ? `Atualizado de ${data.run.from} para ${data.run.to} em ${fmtDateTime(data.run.finishedAt)} (por ${data.run.by}). Recarregue a página para ver as novidades.`
                : `A atualização falhou em ${fmtDateTime(data.run.finishedAt)}. Veja o registro abaixo.`}
            <button onClick={() => setShowLog(!showLog)} className="ml-auto text-xs underline">
              {showLog ? 'ocultar registro' : 'ver registro'}
            </button>
          </div>
          {showLog && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 font-mono text-[11px] text-ink-300">{data.log || '—'}</pre>}
        </div>
      )}
    </Card>
  );
}
