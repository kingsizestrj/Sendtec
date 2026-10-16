import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Modal, useToast } from './ui';

/** "Minha conta": qualquer usuário troca a própria senha. */
export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (next !== confirm) return toast('A confirmação não confere com a nova senha', 'error');
    setSaving(true);
    try {
      await api('/auth/password', { method: 'PATCH', body: { currentPassword: current, newPassword: next } });
      toast('Senha alterada');
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Minha conta">
      <div className="space-y-4">
        <div className="rounded-xl bg-white/[0.04] p-3 text-sm">
          <div className="font-semibold">{user?.name}</div>
          <div className="text-ink-400">{user?.email}</div>
        </div>
        <Field label="Senha atual">
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nova senha" hint="Mínimo de 8 caracteres">
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirme a nova senha">
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button className="w-full" loading={saving} disabled={!current || next.length < 8} onClick={save}>
          Trocar senha
        </Button>
      </div>
    </Modal>
  );
}
