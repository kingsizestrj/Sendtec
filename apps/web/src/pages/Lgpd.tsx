import { Ban, Download, EyeOff, Save, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, download } from '../lib/api';
import { fmtDateTime, fmtPhone } from '../lib/format';
import { Button, Card, Field, Modal, PageHeader, Spinner, StatusBadge, Toggle, useToast } from '../components/ui';

interface Found { phone: string; name: string; messages: number; lastSentAt: string | null; optOut: { createdAt: string; source: string; reason: string | null } | null }
interface Subject {
  phone: string;
  names: string[];
  optOut: Found['optOut'];
  recipients: { id: string; status: string; sentAt: string | null; readAt: string | null; reply: string | null; campaign: { name: string; template: { name: string } } }[];
}

const ORIGEM: Record<string, string> = { whatsapp: 'respondeu no WhatsApp', manual: 'bloqueio manual', importacao: 'importado de planilha' };

export function LgpdPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [anonOpen, setAnonOpen] = useState(false);
  const [keepOptOut, setKeepOptOut] = useState(true);
  const [retention, setRetention] = useState<number>(0);

  useEffect(() => {
    api('/settings').then((s) => setRetention(s.lgpd?.retentionMonths ?? 0));
  }, []);

  const search = async () => {
    setSearching(true);
    try {
      setFound(await api<Found[]>(`/lgpd/search?q=${encodeURIComponent(q)}`));
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const open = async (phone: string) => setSubject(await api<Subject>(`/lgpd/subject?phone=${encodeURIComponent(phone)}`));

  const optOut = async () => {
    await api('/optouts', { body: { phone: subject!.phone, name: subject!.names[0], reason: 'Pedido do titular (LGPD)' } });
    toast('Número descadastrado');
    open(subject!.phone);
  };

  const anonymize = async () => {
    const r = await api<{ anonymized: number }>('/lgpd/subject/anonymize', { body: { phone: subject!.phone, keepOptOut } });
    toast(`${r.anonymized} registro(s) anonimizados`);
    setAnonOpen(false);
    setSubject(null);
    search();
  };

  const saveRetention = async () => {
    await api('/settings', { method: 'PUT', body: { lgpd: { retentionMonths: retention } } });
    toast('Política de retenção salva');
  };

  return (
    <>
      <PageHeader
        title="LGPD"
        subtitle="Atenda pedidos de titulares: consulta, exportação, descadastro e eliminação de dados"
        actions={
          <Button variant="outline" onClick={() => download('/lgpd/optouts.csv', 'descadastros.csv')} icon={<Download className="h-4 w-4" />}>
            Histórico de descadastros (CSV)
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <h3 className="mb-3 font-bold">Consultar titular</h3>
          <div className="flex gap-2">
            <input className="input" placeholder="Telefone ou nome do cliente" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            <Button loading={searching} onClick={search} icon={<Search className="h-4 w-4" />}>
              Buscar
            </Button>
          </div>
          {found && (
            <div className="mt-4 divide-y divide-white/5">
              {!found.length && <p className="py-6 text-center text-sm text-ink-400">Nada encontrado no Sendtec para essa busca.</p>}
              {found.map((f) => (
                <button key={f.phone} onClick={() => open(f.phone)} className="flex w-full items-center gap-4 py-3 text-left text-sm hover:opacity-80">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{f.name || '—'}</div>
                    <div className="text-xs text-ink-400">{fmtPhone(f.phone)}</div>
                  </div>
                  <div className="text-right text-xs text-ink-300">
                    {f.messages} mensagem(ns)
                    <br />
                    última: {fmtDateTime(f.lastSentAt)}
                  </div>
                  {f.optOut && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">descadastrado</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-fuchsia-300" />
              <h3 className="font-bold">Retenção de dados</h3>
            </div>
            <p className="mb-4 text-sm text-ink-300">
              Anonimiza automaticamente nome, telefone, respostas e dados do IXC das mensagens mais antigas que o prazo. Os totais das campanhas continuam disponíveis.
            </p>
            <Field label="Anonimizar mensagens com mais de" hint="0 = não anonimizar automaticamente">
              <div className="flex items-center gap-2">
                <input className="input w-24" type="number" min={0} max={120} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
                <span className="text-sm text-ink-300">meses</span>
                <Button size="sm" className="ml-auto" onClick={saveRetention} icon={<Save className="h-3.5 w-3.5" />}>
                  Salvar
                </Button>
              </div>
            </Field>
          </Card>
          <Card className="p-5 text-sm text-ink-300">
            <b className="text-white">O que o Sendtec guarda:</b> nome e telefone de quem recebeu cada campanha, os valores das variáveis enviadas, status de entrega/leitura, a resposta
            do cliente e os descadastros. As conversas completas ficam no <b>Chatwoot</b> e o cadastro no <b>IXC</b> — pedidos de eliminação também precisam ser atendidos lá.
          </Card>
        </div>
      </div>

      <Modal open={!!subject} onClose={() => setSubject(null)} title="Dados do titular" wide>
        {subject && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{subject.names.join(' / ') || '—'}</div>
                <div className="text-sm text-ink-400">{fmtPhone(subject.phone)}</div>
                <div className="mt-1 text-xs">
                  {subject.optOut ? (
                    <span className="text-rose-300">
                      Descadastrado em {fmtDateTime(subject.optOut.createdAt)} ({ORIGEM[subject.optOut.source] ?? subject.optOut.source})
                    </span>
                  ) : (
                    <span className="text-ink-300">Recebe campanhas de marketing</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => download(`/lgpd/subject/export?phone=${encodeURIComponent(subject.phone)}`, `dados-${subject.phone}.json`)} icon={<Download className="h-3.5 w-3.5" />}>
                  Exportar dados
                </Button>
                {!subject.optOut && (
                  <Button size="sm" variant="outline" onClick={optOut} icon={<Ban className="h-3.5 w-3.5" />}>
                    Descadastrar
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setAnonOpen(true)} icon={<EyeOff className="h-3.5 w-3.5" />}>
                  Anonimizar
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="pb-2 pr-3">Campanha</th>
                    <th className="pb-2 pr-3">Enviada</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Resposta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {subject.recipients.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3">{r.campaign.name}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-ink-300">{fmtDateTime(r.sentAt)}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={r.status} recipient />
                      </td>
                      <td className="py-2 text-ink-300">{r.reply ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!subject.recipients.length && <p className="py-4 text-center text-sm text-ink-400">Nenhuma mensagem enviada para este número.</p>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={anonOpen} onClose={() => setAnonOpen(false)} title="Anonimizar dados">
        <div className="space-y-4 text-sm">
          <p className="text-ink-300">
            Nome, telefone, respostas e dados do IXC deste titular serão apagados de todas as campanhas no Sendtec. Os totais das campanhas continuam. <b>Não dá para desfazer.</b>
          </p>
          <Toggle checked={keepOptOut} onChange={setKeepOptOut} label="Manter o número na lista de descadastros (recomendado)" />
          <p className="text-xs text-ink-400">Sem o número na lista de descadastros, o Sendtec não consegue garantir que ele não volte a receber marketing.</p>
          <Button variant="danger" className="w-full" onClick={anonymize}>
            Anonimizar definitivamente
          </Button>
        </div>
      </Modal>
    </>
  );
}
