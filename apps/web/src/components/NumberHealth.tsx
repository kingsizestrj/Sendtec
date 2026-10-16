import { clsx } from 'clsx';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtNumber } from '../lib/format';
import { Card } from './ui';

export interface NumberHealthData {
  numbers: { id: string; phone: string; name: string; quality: string; tier: string | null; limit: number | null; status: string | null }[];
  sentLast24h: number;
  error: string | null;
}

export const QUALITY: Record<string, { label: string; dot: string; text: string; hint: string }> = {
  GREEN: { label: 'Alta', dot: 'bg-emerald-400', text: 'text-emerald-300', hint: 'Tudo certo: clientes estão recebendo bem as mensagens.' },
  YELLOW: { label: 'Média', dot: 'bg-amber-400', text: 'text-amber-300', hint: 'Atenção: muitos bloqueios ou denúncias recentes. Reduza o volume de marketing.' },
  RED: { label: 'Baixa', dot: 'bg-rose-500', text: 'text-rose-300', hint: 'Risco de restrição: pause campanhas de marketing até a qualidade melhorar.' },
  UNKNOWN: { label: 'Sem avaliação', dot: 'bg-zinc-400', text: 'text-zinc-300', hint: 'A Meta ainda não avaliou este número.' },
};

export function useNumberHealth() {
  const [data, setData] = useState<NumberHealthData | null>(null);
  useEffect(() => {
    api<NumberHealthData>('/dashboard/number-health').then(setData).catch(() => undefined);
  }, []);
  return data;
}

/** Card com qualidade e limite diário de cada número do WhatsApp. */
export function NumberHealth() {
  const data = useNumberHealth();
  if (!data) return null;
  if (data.error || !data.numbers.length) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-ink-300">
        <Smartphone className="h-5 w-5 shrink-0 text-ink-400" />
        {data.error ? `Não foi possível ler os números na Meta: ${data.error}` : 'Nenhum número encontrado na conta do WhatsApp Business.'}
      </Card>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.numbers.map((n) => {
        const q = QUALITY[n.quality] ?? QUALITY.UNKNOWN;
        const used = n.limit ? Math.min(100, Math.round((100 * data.sentLast24h) / n.limit)) : null;
        return (
          <Card key={n.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft">
                  <ShieldCheck className={clsx('h-5 w-5', q.text)} />
                </div>
                <div>
                  <div className="font-bold">{n.phone}</div>
                  <div className="text-xs text-ink-400">{n.name}</div>
                </div>
              </div>
              <span className={clsx('inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold', q.text)}>
                <i className={clsx('h-2 w-2 rounded-full', q.dot)} /> Qualidade {q.label}
              </span>
            </div>
            <p className="mt-3 text-xs text-ink-300">{q.hint}</p>
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-ink-300">Clientes alcançados nas últimas 24h</span>
                <span className="font-semibold">
                  {fmtNumber(data.sentLast24h)} {n.limit ? `de ${fmtNumber(n.limit)}` : '· sem limite'}
                </span>
              </div>
              {used !== null && (
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className={clsx('h-full rounded-full', used > 85 ? 'bg-rose-500' : used > 60 ? 'bg-amber-400' : 'bg-brand')} style={{ width: `${used}%` }} />
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
