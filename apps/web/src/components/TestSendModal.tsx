import { CheckCircle2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtPhone } from '../lib/format';
import type { AudienceClient } from '../lib/types';
import { Button, Field, Modal } from './ui';

const KEY = 'sendtec_test_phone';
const readPhone = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/** Envia a mensagem da campanha para o WhatsApp de quem está criando, com os dados de um cliente real. */
export function TestSendModal({
  open,
  onClose,
  clients,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  clients: AudienceClient[];
  payload: Record<string, unknown>;
}) {
  const [clientId, setClientId] = useState('');
  const [phone, setPhone] = useState(readPhone);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      if (!clients.some((c) => c.id === clientId)) setClientId(clients[0]?.id ?? '');
    }
  }, [open, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      try {
        localStorage.setItem(KEY, phone);
      } catch {
        /* armazenamento indisponível */
      }
      const r = await api<{ text: string; phone: string }>('/campaigns/test', { body: { ...payload, clientId, phone } });
      setResult({ ok: true, text: `Enviado para ${fmtPhone(r.phone)}:\n\n${r.text}` });
    } catch (e: any) {
      setResult({ ok: false, text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enviar mensagem de teste">
      <div className="space-y-4">
        <p className="text-sm text-ink-300">A mensagem chega no seu WhatsApp exatamente como o cliente escolhido vai receber: com imagem e variáveis preenchidas.</p>
        <Field label="Usar os dados de">
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.slice(0, 500).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `· ${fmtPhone(c.phone)}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Enviar para o WhatsApp" hint="Seu número, com DDD. Ele fica salvo neste navegador.">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(22) 99999-0000" />
        </Field>
        {result && (
          <div className={`whitespace-pre-wrap rounded-xl p-3 text-sm ${result.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
            {result.ok && <CheckCircle2 className="mb-1 h-4 w-4" />}
            {result.text}
          </div>
        )}
        <Button className="w-full" loading={sending} disabled={!clientId || !phone} onClick={send} icon={<Send className="h-4 w-4" />}>
          Enviar teste
        </Button>
        <p className="text-xs text-ink-400">O teste aparece no Chatwoot com a etiqueta "sendtec-teste" e não entra no relatório da campanha.</p>
      </div>
    </Modal>
  );
}
