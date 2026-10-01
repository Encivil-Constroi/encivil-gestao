import { useState } from 'react';
import { Navigate, Outlet, useLocation, ScrollRestoration } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { OfflineSyncBanner } from '../components/OfflineSyncBanner';
import { PushSetup } from '../components/PushSetup';
import { useRole } from '@/features/auth/useRole';

// O mecânico só trabalha na Frota: qualquer outro endereço leva-o para lá.
// É conforto de navegação — o que ele pode escrever decide-se na RLS.
const ROTAS_MECANICO = /^\/(frota|ajuda)(\/|$)/;
// O motorista só pede abastecimentos e acompanha os seus pedidos
// (/abastecer: endereços antigos, que redirecionam mantendo o pedido)
const ROTAS_MOTORISTA = /^\/(abastecimento|abastecer|ajuda)(\/|$)/;

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isMecanico, isMotorista } = useRole();

  if (isMecanico && !ROTAS_MECANICO.test(location.pathname)) {
    return <Navigate to="/frota" replace />;
  }
  if (isMotorista && !ROTAS_MOTORISTA.test(location.pathname)) {
    return <Navigate to="/abastecimento/pedir" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuOpen={() => setMobileMenuOpen(true)} />
        <OfflineSyncBanner />

        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
          {/* key forces remount on route change → triggers enc-page entrance animation */}
          <div key={location.pathname} className="enc-page">
            <Outlet />
          </div>
        </main>
        <ScrollRestoration />
        <PushSetup />
      </div>

      <MobileBottomNav />
    </div>
  );
}
