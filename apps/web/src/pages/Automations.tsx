import { clsx } from 'clsx';
import { Clock, Plus, Repeat } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Empty, PageHeader, Spinner, StatusBadge, Toggle, useToast } from '../components/ui';

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface AutomationStep {
  id: string;
  name: string;
  time: string;
  templateId: string;
  template: { name: string; status: string; category: string };
  savedAudienceId: string | null;
  savedAudience: { name: string } | null;
  audience: any;
  variables: any;
  headerMediaUrl: string | null;
  cooldownDays: number;
  lastRunDate: string | null;
  lastResult: string | null;
}
export interface Automation { id: string; name: string; active: boolean; weekdays: number[]; steps: AutomationStep[]; createdBy: { name: string } }

export function AutomationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Automation[] | null>(null);
  const load = () => api<Automation[]>('/automations').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const toggle = async (a: Automation, active: boolean) => {
    try {
      await api(`/automations/${a.id}/active`, { body: { active } });
      toast(active ? 'Régua ativada' : 'Régua pausada');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Réguas automáticas"
        subtitle="Campanhas que rodam sozinhas todo dia, com o público recalculado no IXC"
        actions={
          <Link to="/reguas/nova">
            <Button icon={<Plus className="h-4 w-4" />}>Nova régua</Button>
          </Link>
        }
      />
      {!items ? (
        <Spinner className="mx-auto mt-16 h-8 w-8" />
      ) : !items.length ? (
        <Empty
          icon={<Repeat />}
          title="Nenhuma régua ainda"
          text="Exemplo: régua de cobrança com etapas D-3, D+2 e D+7, ou aniversariantes do dia às 9h."
          action={
            <Link to="/reguas/nova">
              <Button icon={<Plus className="h-4 w-4" />}>Criar régua</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/reguas/${a.id}`} className="min-w-0">
                  <div className="truncate text-lg font-bold hover:underline">{a.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {WEEKDAYS.map((d, i) => (
                      <span key={d} className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold', a.weekdays.includes(i) ? 'bg-brand-soft text-white' : 'text-ink-400')}>
                        {d}
                      </span>
                    ))}
                  </div>
                </Link>
                <Toggle checked={a.active} onChange={(v) => toggle(a, v)} label={<span className="text-xs text-ink-300">{a.active ? 'Ativa' : 'Pausada'}</span>} />
              </div>
              <div className="mt-4 space-y-2">
                {a.steps.map((s) => (
                  <Link key={s.id} to={`/reguas/${a.id}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm hover:bg-white/[0.06]">
                    <span className="flex w-14 shrink-0 items-center gap-1 font-mono text-xs text-fuchsia-300">
                      <Clock className="h-3 w-3" /> {s.time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-ink-400">{s.lastResult ?? 'Ainda não rodou'}</span>
                    </span>
                    {s.template.status !== 'APPROVED' && <StatusBadge status={s.template.status} />}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
