import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Package,
  FileBarChart,
  Settings,
  CircleHelp,
  Fuel,
  Truck,
  Building2,
  Users,
  CalendarDays,
  Bell,
  X,
  Shield,
  UserCog,
  User,
  BookOpen,
  Fingerprint,
  GraduationCap,
  UserCheck,
  Receipt,
  Warehouse,
  Droplets,
  ClipboardList,
} from 'lucide-react';
import { useRole } from '@/features/auth/useRole';
import { usePodeAprovar, useContagemAguardam } from '@/features/combustivel/hooks/useAprovacao';
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
  // Módulo temporariamente oculto — código intacto, só não aparece no menu.
  hidden?: boolean;
  // Visível para o mecânico, que só vê a Frota (e a Ajuda)
  mecanico?: boolean;
  // Visível para o motorista, que só vê o abastecimento (e a Ajuda)
  motorista?: boolean;
  // Só o motorista vê (os outros entram pelo item do módulo)
  soMotorista?: boolean;
  // Mostra quantos pedidos de combustível esperam decisão (só a quem aprova)
  contaPedidos?: boolean;
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
      { path: '/armazem',        label: 'Armazém',        icon: Warehouse,
        prefetch: () => { void import('@/app/pages/armazem') } },
      { path: '/picagens',       label: 'Picagens',       icon: Fingerprint,
        prefetch: () => { void import('@/features/picagens') }, hidden: true },
      { path: '/abastecimento',  label: 'Abastecimento',  icon: Fuel, contaPedidos: true,
        prefetch: () => { void import('@/features/combustivel/pedidos') } },
      { path: '/abastecimento/pedir', label: 'Pedir combustível', icon: Droplets, motorista: true, soMotorista: true,
        prefetch: () => { void import('@/features/combustivel/pedidos') } },
      { path: '/abastecimento', label: 'Os meus pedidos', icon: ClipboardList, motorista: true, soMotorista: true,
        prefetch: () => { void import('@/features/combustivel/pedidos') } },
      { path: '/frota',          label: 'Frota',          icon: Truck, mecanico: true,
        prefetch: () => { void import('@/features/frota') } },
      { path: '/alertas',        label: 'Alertas',        icon: Bell, gestorOnly: true,
        prefetch: () => { void import('@/features/alertas') } },
    ],
  },
  {
    title: 'Obras',
    items: [
      { path: '/obras',           label: 'Obras',           icon: Building2,
        prefetch: () => { void import('@/features/obras') } },
    ],
  },
  {
    title: 'Recursos Humanos',
    items: [
      { path: '/colaboradores', label: 'Colaboradores', icon: Users,   gestorOnly: true,
        prefetch: () => { void import('@/features/colaboradores/components/ColaboradoresPage') } },
      { path: '/rh',            label: 'RH',            icon: CalendarDays, gestorOnly: true,
        prefetch: () => { void import('@/features/horarios') }, hidden: true },
      { path: '/epis',          label: 'EPIs',          icon: Shield,       gestorOnly: true,
        prefetch: () => { void import('@/features/epis') }, hidden: true },
      { path: '/formacoes',     label: 'Formações',     icon: GraduationCap, gestorOnly: true,
        prefetch: () => { void import('@/features/epis') }, hidden: true },
      { path: '/seguranca',     label: 'Ficha Seg.',    icon: UserCheck,    gestorOnly: true,
        prefetch: () => { void import('@/features/epis') }, hidden: true },
    ],
  },
  {
    title: 'Análise',
    items: [
      { path: '/relatorios',               label: 'Relatórios',   icon: FileBarChart,
        prefetch: () => { void import('@/app/pages/ReportsPage') } },
      { path: '/faturas',                 label: 'Faturas',       icon: Receipt,   gestorOnly: true,
        prefetch: () => { void import('@/features/faturas') }, hidden: true },
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
      { path: '/perfil',              label: 'O meu perfil',  icon: User, mecanico: true, motorista: true,
        prefetch: () => { void import('@/features/auth/components/PerfilPage') } },
      { path: '/ajuda',               label: 'Ajuda',         icon: CircleHelp, mecanico: true, motorista: true,
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
  const { isAdmin, isGestor, isMecanico, isMotorista } = useRole();
  const { podeAprovar } = usePodeAprovar();
  const aguardam = useContagemAguardam(podeAprovar && !isMotorista);

  const visibleSections = menuSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.hidden)                              return false;
        if (isMecanico)                               return !!item.mecanico;
        if (isMotorista)                              return !!item.motorista;
        if (item.soMotorista)                         return false;
        if (item.adminOnly  && !isAdmin)              return false;
        if (item.gestorOnly && !isAdmin && !isGestor) return false;
        return true;
      }),
    }))
    .filter(section => section.items.length > 0);

  // Item ativo = o de caminho mais longo que corresponde (os módulos têm sub-páginas)
  const ativo = visibleSections.flatMap(s => s.items)
    .filter(i => location.pathname === i.path || (i.path !== '/' && location.pathname.startsWith(`${i.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const sidebarContent = (
    <aside className="w-64 bg-sidebar text-sidebar-foreground h-full flex flex-col border-r border-sidebar-border">
      {/* Logo oficial no topo */}
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-sidebar-accent rounded-lg p-1.5 w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/icone_oficial.png"
              alt="ENCIVIL"
              className="w-full h-full object-contain enc-logo"
              draggable={false}
            />
          </div>
          <div>
            <h1 className="text-sidebar-foreground text-base font-semibold leading-tight">ENCIVIL</h1>
            <p className="text-xs text-muted-foreground leading-tight">Gestão</p>
          </div>
        </div>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1 rounded text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        {visibleSections.map((section, idx) => (
          <div key={section.title ?? idx} className={idx > 0 ? 'mt-5' : ''}>
            {section.title && (
              <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item === ativo;
                return (
                  <li key={`${item.path}-${item.label}`}>
                    <Link
                      to={item.path}
                      onClick={onMobileClose}
                      onMouseEnter={item.prefetch}
                      onFocus={item.prefetch}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150
                        ${isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5'}
                      `}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-sm flex-1">{item.label}</span>
                      {item.contaPedidos && podeAprovar && aguardam > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-warning text-warning-foreground text-[11px] font-bold flex items-center justify-center"
                          aria-label={`${aguardam} à espera de decisão`}>
                          {aguardam}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground">Versão 1.0.0 · © 2026 ENCIVIL</p>
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
