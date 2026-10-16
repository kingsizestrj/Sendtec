import { clsx } from 'clsx';
import { CheckCheck, Eye, MapPinned, Send, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtNumber, pct } from '../lib/format';
import type { Campaign } from '../lib/types';
import { AudienceMap, MapPoint } from '../components/AudienceMap';
import { Card, Empty, PageHeader, Spinner, Stat } from '../components/ui';

interface Counts { total: number; delivered: number; read: number; failed: number }
interface Data { days: number; totals: Counts; cells: (Counts & { lat: number; lng: number })[]; bairros: (Counts & { bairro: string })[] }

const METRICS = {
  read: { label: 'Leitura', calc: (c: Counts) => pct(c.read, c.total), good: true },
  delivered: { label: 'Entrega', calc: (c: Counts) => pct(c.delivered, c.total), good: true },
  failed: { label: 'Falhas', calc: (c: Counts) => pct(c.failed, c.total), good: false },
} as const;
type Metric = keyof typeof METRICS;

/** vermelho → âmbar → verde (invertido para métricas em que menor é melhor) */
function rateColor(rate: number, good: boolean) {
  const t = Math.max(0, Math.min(1, (good ? rate : 100 - rate) / 100));
  const stops = [
    [244, 63, 94],
    [245, 158, 11],
    [52, 211, 153],
  ];
  const [a, b, k] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

export function ResultsPage() {
  const { mapCenter } = useAuth();
  const [days, setDays] = useState(30);
  const [campaignId, setCampaignId] = useState('');
  const [metric, setMetric] = useState<Metric>('read');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    api<Campaign[]>('/campaigns').then((c) => setCampaigns(c.filter((x) => x.startedAt)));
  }, []);
  useEffect(() => {
    setData(null);
    api<Data>(`/results/map?days=${days}&campaignId=${campaignId}`).then(setData);
  }, [days, campaignId]);

  const m = METRICS[metric];
  const points: MapPoint[] = useMemo(
    () =>
      (data?.cells ?? []).map((c, i) => {
        const rate = m.calc(c);
        return {
          id: String(i),
          lat: c.lat,
          lng: c.lng,
          color: rateColor(rate, m.good),
          radius: Math.min(22, 6 + Math.sqrt(c.total) * 1.6),
          popup: () =>
            `<div style="font-weight:700;font-size:15px">${rate}% de ${m.label.toLowerCase()}</div>
             <div style="opacity:.75;font-size:12px;margin-top:4px">${fmtNumber(c.total)} enviadas · ${fmtNumber(c.delivered)} entregues · ${fmtNumber(c.read)} lidas · ${fmtNumber(c.failed)} falhas</div>`,
        };
      }),
    [data, metric], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const t = data?.totals;
  return (
    <>
      <PageHeader
        title="Resultados"
        subtitle="Onde suas mensagens são entregues e lidas"
        actions={
          <>
            <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={365}>Último ano</option>
            </select>
            <select className="input w-auto max-w-[260px]" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Todas as campanhas</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        }
      />

      {!data ? (
        <Spinner className="mx-auto mt-16 h-8 w-8" />
      ) : !t?.total ? (
        <Empty icon={<MapPinned />} title="Sem envios nesse período" text="Os resultados aparecem aqui assim que as campanhas começarem a ser disparadas." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Enviadas" value={fmtNumber(t.total)} icon={<Send className="h-4 w-4" />} accent="bg-sky-500" />
            <Stat label="Entregues" value={`${pct(t.delivered, t.total)}%`} sub={`${fmtNumber(t.delivered)} mensagens`} icon={<CheckCheck className="h-4 w-4" />} accent="bg-violet-500" />
            <Stat label="Lidas" value={`${pct(t.read, t.total)}%`} sub={`${fmtNumber(t.read)} mensagens`} icon={<Eye className="h-4 w-4" />} accent="bg-emerald-500" />
            <Stat label="Falhas" value={`${pct(t.failed, t.total)}%`} sub={`${fmtNumber(t.failed)} mensagens`} icon={<XCircle className="h-4 w-4" />} accent="bg-rose-500" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="inline-flex rounded-xl bg-ink-900/70 p-1 ring-1 ring-white/10">
                  {(Object.keys(METRICS) as Metric[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setMetric(k)}
                      className={clsx('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', metric === k ? 'bg-brand text-snow shadow-glow' : 'text-ink-300 hover:text-white')}
                    >
                      {METRICS[k].label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-300">
                  <span>{m.good ? 'menor' : 'maior'}</span>
                  <span className="h-2 w-28 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(244,63,94), rgb(245,158,11), rgb(52,211,153))' }} />
                  <span>{m.good ? 'maior' : 'menor'}</span>
                </div>
              </div>
              {points.length ? (
                <AudienceMap center={mapCenter} points={points} height={560} />
              ) : (
                <div className="grid h-[560px] place-items-center text-sm text-ink-400">Os envios desse período não têm coordenadas (ex.: campanhas por planilha).</div>
              )}
              <p className="mt-3 px-2 text-xs text-ink-400">Cada círculo agrupa os clientes de uma área de ~500 m. O tamanho indica quantas mensagens foram enviadas ali; clique para ver os números.</p>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 font-bold">Por bairro</h3>
              <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
                {data.bairros.map((b) => {
                  const rate = m.calc(b);
                  return (
                    <div key={b.bairro} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{b.bairro}</span>
                        <span className="shrink-0 font-bold" style={{ color: rateColor(rate, m.good) }}>
                          {rate}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rateColor(rate, m.good) }} />
                      </div>
                      <div className="mt-1 text-[11px] text-ink-400">{fmtNumber(b.total)} enviadas</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
