import { ArrowRight, MapPinned, MessageCircleHeart, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, Field } from '../components/ui';
import { Logo } from '../components/Layout';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden text-snow lg:block">
        <div className="absolute inset-0 bg-brand opacity-90" />
        <div className="absolute -left-20 top-1/4 h-96 w-96 rounded-full bg-snow/20 blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-96 w-96 rounded-full bg-orange-300/30 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-14">
          <Logo />
          <div>
            <h2 className="max-w-md text-5xl font-extrabold leading-[1.05] tracking-tight">Sua base do IXC, no WhatsApp, em minutos.</h2>
            <div className="mt-10 grid max-w-md gap-4">
              {[
                { icon: MapPinned, t: 'Desenhe no mapa', d: 'Selecione bairros, ruas ou regiões inteiras.' },
                { icon: Sparkles, t: 'Modelos aprovados pela Meta', d: 'Crie, envie para análise e acompanhe o status.' },
                { icon: MessageCircleHeart, t: 'Tudo registrado no Chatwoot', d: 'Entregas, leituras e respostas no mesmo lugar.' },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="flex items-start gap-4 rounded-2xl bg-snow/10 p-4 backdrop-blur">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-bold">{t}</div>
                    <div className="text-sm text-snow/80">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-sm text-snow/70">Feito para provedores de internet</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Bem-vindo de volta 👋</h1>
          <p className="mt-2 text-sm text-ink-300">Entre para criar e acompanhar suas campanhas.</p>
          <div className="mt-8 space-y-4">
            <Field label="E-mail">
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field
              label={
                <span className="flex justify-between">
                  Senha
                  <Link to="/esqueci-senha" className="normal-case tracking-normal text-fuchsia-300 hover:underline">
                    Esqueci minha senha
                  </Link>
                </span>
              }
            >
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <Button className="w-full" loading={loading} type="submit">
              Entrar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
