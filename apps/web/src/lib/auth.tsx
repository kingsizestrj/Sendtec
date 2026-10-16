import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  company: string;
  mapCenter: [number, number];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState('Sendtec');
  const [mapCenter, setMapCenter] = useState<[number, number]>([-15.78, -47.93]);
  const [loading, setLoading] = useState(true);

  const loadGeneral = () =>
    api('/settings/general')
      .then((g) => {
        setCompany(g.companyName || 'Sendtec');
        if (Array.isArray(g.mapCenter)) setMapCenter(g.mapCenter);
      })
      .catch(() => undefined);

  useEffect(() => {
    if (!tokenStore.get()) return setLoading(false);
    api<User>('/auth/me')
      .then((u) => {
        setUser(u);
        return loadGeneral();
      })
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
    tokenStore.set(res.token);
    setUser(res.user);
    await loadGeneral();
  };

  const logout = () => {
    tokenStore.set(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, company, mapCenter, loading, login, logout }}>{children}</Ctx.Provider>;
}
