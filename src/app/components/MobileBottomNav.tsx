import { Link, useLocation } from 'react-router';
import { LayoutDashboard, Warehouse, Plus, Fuel, FileBarChart, Truck, CircleHelp, Droplets, ClipboardList } from 'lucide-react';
import { useRole } from '@/features/auth/useRole';

const navItems = [
  { path: '/',               label: 'Dashboard', icon: LayoutDashboard },
  { path: '/armazem',        label: 'Armazém',   icon: Warehouse },
  { path: '/armazem/movimento/entrada', label: 'Movimento', icon: Plus, primary: true },
  { path: '/abastecimento',  label: 'Combustível', icon: Fuel },
  { path: '/relatorios',     label: 'Relatórios', icon: FileBarChart },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { podeArmazem, isMecanico, isMotorista } = useRole();

  // Quem tem escrita no armazém pode registar movimentos (admin, gestor, armazém)
  const canRegisterMovement = podeArmazem;

  // O mecânico só usa a Frota; o motorista só o abastecimento
  if (isMecanico || isMotorista) {
    const itens = isMecanico ? [
      { path: '/frota', label: 'Frota', icon: Truck, ativo: (p: string) => p.startsWith('/frota') },
      { path: '/ajuda', label: 'Ajuda', icon: CircleHelp, ativo: (p: string) => p.startsWith('/ajuda') },
    ] : [
      { path: '/abastecimento/pedir', label: 'Pedir', icon: Droplets, ativo: (p: string) => p.startsWith('/abastecimento/pedir') },
      // Inclui o ecrã de cada pedido (/abastecimento/pedido/:id)
      { path: '/abastecimento', label: 'Pedidos', icon: ClipboardList, ativo: (p: string) => p === '/abastecimento' || p.startsWith('/abastecimento/pedido/') },
      { path: '/ajuda', label: 'Ajuda', icon: CircleHelp, ativo: (p: string) => p.startsWith('/ajuda') },
    ];
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around h-16">
          {itens.map(item => {
            const Icon = item.icon;
            const isActive = item.ativo(location.pathname);
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center justify-center h-full min-w-[48px]">
                <div className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path !== '/' && !item.primary && location.pathname.startsWith(`${item.path}/`) && !location.pathname.startsWith('/armazem/movimento'));

          if (item.primary) {
            if (!canRegisterMovement) {
              // Placeholder that preserves layout balance
              return <div key={item.path} className="w-14" />;
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className={`
                  w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all
                  ${isActive ? 'bg-primary/90 scale-105' : 'bg-primary'}
                `}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center h-full min-w-[48px] transition-colors"
            >
              <div className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
              }`}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
