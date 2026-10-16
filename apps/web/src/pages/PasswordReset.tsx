import { ArrowLeft, MailCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Field } from '../components/ui';
import { Logo } from '../components/Layout';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10">
          <Logo />
        </div>
        {children}
        <Link to="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Link>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ available: boolean }>('/auth/forgot/available').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/forgot', { body: { email } });
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold tracking-tight">Esqueceu a senha?</h1>
      {available === false ? (
        <p className="mt-3 text-sm text-ink-300">O envio de e-mails ainda não foi configurado neste Sendtec. Peça a um administrador para redefinir sua senha em Usuários.</p>
      ) : sent ? (
        <div className="mt-6 flex gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <MailCheck className="h-5 w-5 shrink-0" />
          Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Ele vale por 1 hora.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-ink-300">Informe seu e-mail de acesso e enviaremos um link para criar uma nova senha.</p>
          <Field label="E-mail">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <Button className="w-full" type="submit" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('A confirmação não confere com a nova senha');
    setLoading(true);
    setError('');
    try {
      await api('/auth/reset', { body: { token: params.get('token') ?? '', password } });
      setDone(true);
      setTimeout(() => nav('/login'), 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold tracking-tight">Criar nova senha</h1>
      {done ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">Senha alterada! Levando você para o login…</div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nova senha" hint="Mínimo de 8 caracteres">
            <input className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirme a nova senha">
            <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <Button className="w-full" type="submit" loading={loading}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </Shell>
  );
}
