import { clsx } from 'clsx';
import { Ban, History, LayoutDashboard, LogOut, MapPinned, Megaphone, Menu, MessageSquareText, Moon, Settings, Sun, Users, X } from 'lucide-react';
import { AccountModal } from './AccountModal';
import { IntegrationBanner } from './IntegrationBanner';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true as boolean | undefined },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/modelos', label: 'Modelos', icon: MessageSquareText },
  { to: '/resultados', label: 'Resultados', icon: MapPinned },
  { to: '/descadastros', label: 'Descadastros', icon: Ban },
];
const ADMIN_NAV: typeof NAV = [
  { to: '/usuarios', label: 'Usuários', icon: Users },
  { to: '/atividades', label: 'Atividades', icon: History },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Logo({ company }: { company?: string }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" className="h-10 w-10 rounded-xl shadow-glow ring-1 ring-white/25" />
      <div>
        <div className="text-lg font-extrabold leading-none tracking-tight">Sendtec</div>
        {company && company !== 'Sendtec' && <div className="mt-1 text-[11px] text-ink-400">{company}</div>}
      </div>
    </div>
  );
}

export function Layout() {
  const { user, company, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));
  const toggleTheme = () => {
    const next = !light;
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('sendtec_theme', next ? 'light' : 'dark');
    } catch {
      /* armazenamento indisponível */
    }
    setLight(next);
  };
  const items = user?.role === 'ADMIN' ? [...NAV, ...ADMIN_NAV] : NAV;

  const nav = (
    <nav className="mt-10 flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            clsx(
              'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-brand-soft text-white ring-1 ring-fuchsia-500/30' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={clsx('h-[18px] w-[18px]', isActive && 'text-fuchsia-300')} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const userBox = (
    <div className="glass flex items-center gap-2 rounded-2xl p-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold text-snow">{user?.name.charAt(0)}</div>
      <button onClick={() => setAccount(true)} title="Minha conta" className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold">{user?.name}</div>
        <div className="truncate text-[11px] text-ink-400">{user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}</div>
      </button>
      <button onClick={toggleTheme} title={light ? 'Modo escuro' : 'Modo claro'} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5 hover:text-white">
        {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
      <button onClick={logout} title="Sair" className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5 hover:text-white">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-white/5 bg-ink-950/60 p-5 backdrop-blur-xl lg:flex">
        <div>
          <Logo company={company} />
          {nav}
        </div>
        {userBox}
      </aside>

      <div className="fixed inset-x-0 top-0 z-[1500] flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/5">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[1600] bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-72 flex-col justify-between bg-ink-900 p-5">
            <div>
              <div className="flex items-center justify-between">
                <Logo company={company} />
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
            </div>
            {userBox}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-16 pt-20 sm:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">
          <IntegrationBanner />
          <Outlet />
        </div>
      </main>
      <AccountModal open={account} onClose={() => setAccount(false)} />
    </div>
  );
}
