import { Plus, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Role, User } from '../lib/types';
import { Button, Card, Field, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui';

type Form = { id?: string; name: string; email: string; password: string; role: Role; active: boolean };
const EMPTY: Form = { name: '', email: '', password: '', role: 'OPERATOR', active: true };

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<User[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const load = () => api<User[]>('/users').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form) return;
    try {
      if (form.id) {
        const { id, email: _e, password, ...rest } = form;
        await api(`/users/${id}`, { method: 'PATCH', body: { ...rest, ...(password ? { password } : {}) } });
      } else {
        const { id: _id, active: _a, ...rest } = form;
        await api('/users', { body: rest });
      }
      toast('Usuário salvo');
      setForm(null);
      load();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Administradores configuram integrações e usuários; operadores criam modelos e campanhas"
        actions={
          <Button onClick={() => setForm(EMPTY)} icon={<Plus className="h-4 w-4" />}>
            Novo usuário
          </Button>
        }
      />
      {!items ? (
        <Spinner className="mx-auto mt-16 h-8 w-8" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((u) => (
            <Card key={u.id} className={`flex items-center gap-4 p-5 ${u.active ? '' : 'opacity-50'}`}>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-lg font-bold">{u.name.charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">
                  {u.name} {u.id === me?.id && <span className="text-xs font-normal text-ink-400">(você)</span>}
                </div>
                <div className="truncate text-sm text-ink-300">{u.email}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">
                  {u.role === 'ADMIN' ? <ShieldCheck className="h-3.5 w-3.5 text-fuchsia-300" /> : <UserRound className="h-3.5 w-3.5" />}
                  {u.role === 'ADMIN' ? 'Administrador' : 'Operador'} {!u.active && '· inativo'}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setForm({ id: u.id, name: u.name, email: u.email, password: '', role: u.role, active: u.active ?? true })}>
                Editar
              </Button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar usuário' : 'Novo usuário'}>
        {form && (
          <div className="space-y-4">
            <Field label="Nome">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <input className="input" type="email" disabled={!!form.id} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={form.id ? 'Nova senha (deixe em branco para manter)' : 'Senha'} hint="Mínimo de 8 caracteres">
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Perfil">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </Field>
            {form.id && <Toggle checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Usuário ativo" />}
            <Button className="w-full" onClick={save}>
              Salvar
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
