import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { Spinner, ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { TemplatesPage } from './pages/Templates';
import { TemplateNewPage } from './pages/TemplateNew';
import { CampaignsPage } from './pages/Campaigns';
import { CampaignNewPage } from './pages/CampaignNew';
import { CampaignDetailPage } from './pages/CampaignDetail';
import { OptOutsPage } from './pages/OptOuts';
import { UsersPage } from './pages/Users';
import { SettingsPage } from './pages/Settings';
import { ResultsPage } from './pages/Results';

function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid h-screen place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="campanhas" element={<CampaignsPage />} />
              <Route path="campanhas/nova" element={<CampaignNewPage />} />
              <Route path="campanhas/:id/editar" element={<CampaignNewPage />} />
              <Route path="campanhas/:id" element={<CampaignDetailPage />} />
              <Route path="modelos" element={<TemplatesPage />} />
              <Route path="modelos/novo" element={<TemplateNewPage />} />
              <Route path="resultados" element={<ResultsPage />} />
              <Route path="descadastros" element={<OptOutsPage />} />
              <Route path="usuarios" element={<Protected admin><UsersPage /></Protected>} />
              <Route path="configuracoes" element={<Protected admin><SettingsPage /></Protected>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
