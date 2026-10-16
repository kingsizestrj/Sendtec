import { Ban, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime, fmtPhone } from '../lib/format';
import { Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast } from '../components/ui';

interface OptOut { phone: string; name: string | null; reason: string | null; source: string; createdAt: string }

export function OptOutsPage() {
  const toast = useToast();
  const [items, setItems] = useState<OptOut[] | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', reason: '' });

  const load = useCallback(() => api<OptOut[]>(`/optouts?search=${encodeURIComponent(search)}`).then(setItems), [search]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const add = async () => {
    try {
      await api('/optouts', { body: form });
      setOpen(false);
      setForm({ phone: '', name: '', reason: '' });
      toast('Número bloqueado para campanhas de marketing');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const remove = async (o: OptOut) => {
    if (!confirm(`Voltar a enviar campanhas para ${fmtPhone(o.phone)}?`)) return;
    await api(`/optouts/${encodeURIComponent(o.phone)}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <PageHeader
        title="Descadastros"
        subtitle="Clientes que responderam SAIR (ou foram bloqueados à mão) não recebem campanhas de marketing"
        actions={
          <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            Bloquear número
          </Button>
        }
      />
      <Card className="p-5">
        <input className="input mb-4 sm:w-80" placeholder="Buscar por telefone ou nome" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!items ? (
          <Spinner className="mx-auto my-10" />
        ) : !items.length ? (
          <Empty icon={<Ban />} title="Ninguém pediu para sair" text="Quando um cliente responder SAIR no WhatsApp, ele aparece aqui automaticamente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="pb-3 pr-4">Telefone</th>
                  <th className="pb-3 pr-4">Nome</th>
                  <th className="pb-3 pr-4">Motivo</th>
                  <th className="pb-3 pr-4">Origem</th>
                  <th className="pb-3 pr-4">Quando</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((o) => (
                  <tr key={o.phone}>
                    <td className="py-3 pr-4 font-medium">{fmtPhone(o.phone)}</td>
                    <td className="py-3 pr-4 text-ink-300">{o.name ?? '—'}</td>
                    <td className="py-3 pr-4 text-ink-300">{o.reason ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs">{o.source === 'whatsapp' ? 'WhatsApp' : 'Manual'}</span>
                    </td>
                    <td className="py-3 pr-4 text-ink-300">{fmtDateTime(o.createdAt)}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => remove(o)} title="Remover bloqueio" className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-500/10 hover:text-rose-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Bloquear número">
        <div className="space-y-4">
          <Field label="Telefone">
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(61) 99999-0000" />
          </Field>
          <Field label="Nome (opcional)">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Motivo (opcional)">
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Button className="w-full" onClick={add} disabled={!form.phone}>
            Bloquear
          </Button>
        </div>
      </Modal>
    </>
  );
}
