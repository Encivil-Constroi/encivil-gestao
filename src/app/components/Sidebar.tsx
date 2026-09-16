import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Package,
  Plus,
  History,
  FileBarChart,
  Settings,
  CircleHelp,
  Wrench,
  Fuel,
  Building2,
  HardHat,
  Users,
  CalendarDays,
  Bell,
  X,
  Shield,
  UserCog,
  BookOpen,
} from 'lucide-react';
import { useRole } from '@/features/auth/useRole';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';

type MenuItem = {
  path: string;
  label: string;
  icon: typeof Package;
  adminOnly?: boolean;
  gestorOnly?: boolean;
  // Pré-carrega o chunk da página ao passar o rato — a navegação fica
  // instantânea mesmo na primeira visita.
  prefetch?: () => void;
};
type MenuSection = { title?: string; items: MenuItem[] };

const menuSections: MenuSection[] = [
  {
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard,
        prefetch: () => { void import('@/app/pages/DashboardPage') } },
    ],
  },
  {
    title: 'Operação',
    items: [
      { path: '/produtos',       label: 'Produtos',       icon: Package,
        prefetch: () => { void import('@/app/pages/ProductsPage') } },
      { path: '/novo-movimento', label: 'Novo Movimento', icon: Plus,
        prefetch: () => { void import('@/app/pages/NewMovementPage') } },
      { path: '/historico',      label: 'Histórico',      icon: History,
        prefetch: () => { void import('@/app/pages/HistoryPage') } },
      { path: '/ferramentas',    label: 'Ferramentas',    icon: Wrench,
        prefetch: () => { void import('@/app/pages/ToolsPage') } },
      { path: '/combustivel',    label: 'Combustível',    icon: Fuel,
        prefetch: () => { void import('@/app/pages/CombustivelPage') } },
      { path: '/alertas',        label: 'Alertas',        icon: Bell, gestorOnly: true,
        prefetch: () => { void import('@/features/alertas') } },
    ],
  },
  {
    title: 'Obras',
    items: [
      { path: '/obras',           label: 'Obras',           icon: Building2,
        prefetch: () => { void import('@/app/pages/ObrasPage') } },
      { path: '/subempreiteiros', label: 'Subempreiteiros', icon: HardHat,
        prefetch: () => { void import('@/app/pages/SubempreiteirosPage') } },
    ],
  },
  {
    title: 'Recursos Humanos',
    items: [
      { path: '/colaboradores', label: 'Colaboradores', icon: Users,   gestorOnly: true,
        prefetch: () => { void import('@/features/colaboradores/components/ColaboradoresPage') } },
      { path: '/rh',            label: 'RH',            icon: CalendarDays, gestorOnly: true,
        prefetch: () => { void import('@/features/horarios') } },
    ],
  },
  {
    title: 'Análise',
    items: [
      { path: '/relatorios',               label: 'Relatórios',   icon: FileBarChart,
        prefetch: () => { void import('@/app/pages/ReportsPage') } },
      { path: '/exportacao-contabilidade', label: 'Contabilidade', icon: BookOpen, gestorOnly: true,
        prefetch: () => { void import('@/app/pages/ExportacaoContabilidadePage') } },
    ],
  },
  {
    title: 'Administração',
    items: [
      { path: '/gestao-utilizadores', label: 'Utilizadores',  icon: UserCog,   adminOnly: true,
        prefetch: () => { void import('@/app/pages/GestaoUtilizadoresPage') } },
      { path: '/auditoria',           label: 'Auditoria',     icon: Shield,    adminOnly: true,
        prefetch: () => { void import('@/app/pages/AuditoriaPage') } },
      { path: '/configuracoes',       label: 'Configurações', icon: Settings,  adminOnly: true,
        prefetch: () => { void import('@/app/pages/SettingsPage') } },
      { path: '/ajuda',               label: 'Ajuda',         icon: CircleHelp,
        prefetch: () => { void import('@/app/pages/HelpPage') } },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  useLockBodyScroll(mobileOpen);
  const location = useLocation();
  const { isAdmin, isGestor } = useRole();

  const visibleSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.adminOnly  && !isAdmin)              return false;
        if (item.gestorOnly && !isAdmin && !isGestor) return false;
        return true;
      }),
    }))
    .filter(section => section.items.length > 0);

  const sidebarContent = (
    <aside className="w-64 bg-sidebar text-sidebar-foreground h-full flex flex-col border-r border-sidebar-border">
      {/* Logo oficial no topo */}
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5 w-10 h-10 flex items-center justify-center shrink-0">
            <img
              src="/icone_oficial.png"
              alt="ENCIVIL"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
          <div>
            <h1 className="text-white text-base font-semibold leading-tight">ENCIVIL</h1>
            <p className="text-xs text-sidebar-foreground/70 leading-tight">Gestão</p>
          </div>
        </div>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1 rounded text-sidebar-foreground/70 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        {visibleSections.map((section, idx) => (
          <div key={section.title ?? idx} className={idx > 0 ? 'mt-5' : ''}>
            {section.title && (
              <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onMobileClose}
                      onMouseEnter={item.prefetch}
                      onFocus={item.prefetch}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150
                        ${isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5'}
                      `}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/50">Versão 1.0.0 · © 2026 ENCIVIL</p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 min-h-screen shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex enc-fade-in">
          <div className="fixed inset-0 bg-black/60" onClick={onMobileClose} />
          <div className="relative w-72 max-w-[85vw] h-full enc-slide-in-left">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
