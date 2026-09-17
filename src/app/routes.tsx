import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router';

function RouteErrorPage() {
  const error = useRouteError() as Error | undefined;
  const isChunkError =
    error?.message?.includes('Failed to fetch dynamically imported module') ||
    error?.message?.includes('Importing a module script failed');

  useEffect(() => {
    if (!isChunkError) return;
    const GUARD_KEY = 'chunk_reload_ts';
    const lastReload = Number(sessionStorage.getItem(GUARD_KEY) ?? '0');
    if (Date.now() - lastReload < 15_000) return;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));

    const clearAndReload = async () => {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch { /* best effort */ }
      window.location.reload();
    };
    void clearAndReload();
  }, [isChunkError]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
        {isChunkError ? (
          <>
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2">Nova versão disponível</h2>
            <p className="text-sm text-muted-foreground mb-6">
              O app foi atualizado. Recarregue para continuar.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
            >
              Recarregar App
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2">Algo correu mal</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <button
              onClick={() => window.location.assign('/')}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
            >
              Voltar ao Início
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Skeleton de loading — exibido durante o carregamento lazy de cada página
function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Wrapper que adiciona Suspense a cada elemento lazy
function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

// ── Imports estáticos (críticos — necessários no carregamento inicial) ──────
import { MainLayout }   from './layouts/MainLayout';
import { AuthGuard }    from '@/features/auth/AuthGuard';
import { RoleGuard }    from '@/features/auth/RoleGuard';
import { LoginPage }    from './pages/LoginPage';
// Páginas públicas (acedidas via QR code sem autenticação)
import { AbastecimentoPublicPage } from './pages/pub/AbastecimentoPublicPage';
import { ImprimirQrPage }          from './pages/pub/ImprimirQrPage';

// ── Imports lazy (carregados só quando a rota é visitada) ────────────────────
const DashboardPage    = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProductsPage     = lazy(() => import('./pages/ProductsPage').then(m => ({ default: m.ProductsPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));

const ToolsPage        = lazy(() => import('./pages/ToolsPage').then(m => ({ default: m.ToolsPage })));
const ToolDetailPage   = lazy(() => import('./pages/ToolDetailPage').then(m => ({ default: m.ToolDetailPage })));
const ToolFormPage     = lazy(() => import('./pages/ToolFormPage').then(m => ({ default: m.ToolFormPage })));
const ToolLoanPage     = lazy(() => import('./pages/ToolLoanPage').then(m => ({ default: m.ToolLoanPage })));
const ToolReturnPage   = lazy(() => import('./pages/ToolReturnPage').then(m => ({ default: m.ToolReturnPage })));

const ObrasPage        = lazy(() => import('./pages/ObrasPage').then(m => ({ default: m.ObrasPage })));
const ObraFormPage     = lazy(() => import('./pages/ObraFormPage').then(m => ({ default: m.ObraFormPage })));
const ObraDetailPage   = lazy(() => import('./pages/ObraDetailPage').then(m => ({ default: m.ObraDetailPage })));

const SubempreiteirosPage    = lazy(() => import('./pages/SubempreiteirosPage').then(m => ({ default: m.SubempreiteirosPage })));
const SubempreiteiroFormPage = lazy(() => import('./pages/SubempreiteiroFormPage').then(m => ({ default: m.SubempreiteiroFormPage })));
const SubempreiteiroDetailPage = lazy(() => import('./pages/SubempreiteiroDetailPage').then(m => ({ default: m.SubempreiteiroDetailPage })));
const AutoFormPage     = lazy(() => import('./pages/AutoFormPage').then(m => ({ default: m.AutoFormPage })));
const AutoDetailPage   = lazy(() => import('./pages/AutoDetailPage').then(m => ({ default: m.AutoDetailPage })));

const CombustivelPage          = lazy(() => import('./pages/CombustivelPage').then(m => ({ default: m.CombustivelPage })));
const AbastecimentoFormPage    = lazy(() => import('./pages/AbastecimentoFormPage').then(m => ({ default: m.AbastecimentoFormPage })));
const VeiculoFormPage          = lazy(() => import('./pages/VeiculoFormPage').then(m => ({ default: m.VeiculoFormPage })));

const ColaboradoresPage  = lazy(() => import('@/features/colaboradores/components/ColaboradoresPage').then(m => ({ default: m.ColaboradoresPage })));
const RHPage             = lazy(() => import('@/features/horarios').then(m => ({ default: m.RHPage })));
const PicagemPage        = lazy(() => import('@/features/picagens').then(m => ({ default: m.PicagemPage })));
const ValidacaoPicagensPage = lazy(() => import('@/features/picagens').then(m => ({ default: m.ValidacaoPicagensPage })));
const EpisPage           = lazy(() => import('@/features/epis').then(m => ({ default: m.EpisPage })));
const FormacoesPage      = lazy(() => import('@/features/epis').then(m => ({ default: m.FormacoesPage })));
const FichaSegurancaPage = lazy(() => import('@/features/epis').then(m => ({ default: m.FichaSegurancaPage })));
const AlertasPage        = lazy(() => import('@/features/alertas').then(m => ({ default: m.AlertasPage })));
const AuditoriaPage      = lazy(() => import('./pages/AuditoriaPage').then(m => ({ default: m.AuditoriaPage })));

const NewMovementPage    = lazy(() => import('./pages/NewMovementPage').then(m => ({ default: m.NewMovementPage })));
const HistoryPage        = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ReportsPage        = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage       = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const HelpPage           = lazy(() => import('./pages/HelpPage').then(m => ({ default: m.HelpPage })));
const NotFoundPage       = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const ResetPasswordPage      = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const GestaoUtilizadoresPage = lazy(() => import('./pages/GestaoUtilizadoresPage').then(m => ({ default: m.GestaoUtilizadoresPage })));
const AutoPdfPage            = lazy(() => import('./pages/AutoPdfPage').then(m => ({ default: m.AutoPdfPage })));
const ObraRelatorioPage         = lazy(() => import('./pages/ObraRelatorioPage').then(m => ({ default: m.ObraRelatorioPage })));
const ExportacaoContabilidadePage = lazy(() => import('./pages/ExportacaoContabilidadePage').then(m => ({ default: m.ExportacaoContabilidadePage })));
const BackupPage                = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })));

const FaturasPage           = lazy(() => import('@/features/faturas').then(m => ({ default: m.FaturasPage })));
const ClassificarFaturaPage = lazy(() => import('@/features/faturas').then(m => ({ default: m.ClassificarFaturaPage })));
const CustosObraPage        = lazy(() => import('@/features/custos').then(m => ({ default: m.CustosObraPage })));

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/reset-password',
    element: <L><ResetPasswordPage /></L>,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/pub/combustivel',
    element: <AbastecimentoPublicPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/pub/imprimir-qr',
    element: <ImprimirQrPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorPage />,
    children: [
      // Rotas full-page — autenticadas mas sem MainLayout (sem barra lateral, para impressão/PDF)
      {
        path: '/autos/:autoId/pdf',
        element: <L><AutoPdfPage /></L>,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/obras/:id/relatorio',
        element: <L><ObraRelatorioPage /></L>,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/',
        Component: MainLayout,
        errorElement: <RouteErrorPage />,
        children: [
          { index: true,           element: <L><DashboardPage /></L> },
          { path: 'produtos',      element: <L><ProductsPage /></L> },
          { path: 'produtos/:id',  element: <L><ProductDetailPage /></L> },
          { path: 'ferramentas',             element: <L><ToolsPage /></L> },
          { path: 'ferramentas/nova',         element: <L><RoleGuard require="gestor"><ToolFormPage /></RoleGuard></L> },
          { path: 'ferramentas/emprestimo',   element: <L><RoleGuard require="gestor"><ToolLoanPage /></RoleGuard></L> },
          { path: 'ferramentas/:id',          element: <L><ToolDetailPage /></L> },
          { path: 'ferramentas/:id/editar',   element: <L><RoleGuard require="gestor"><ToolFormPage /></RoleGuard></L> },
          { path: 'ferramentas/:id/devolucao', element: <L><RoleGuard require="gestor"><ToolReturnPage /></RoleGuard></L> },
          { path: 'colaboradores', element: <L><RoleGuard require="gestor"><ColaboradoresPage /></RoleGuard></L> },
          { path: 'rh',           element: <L><RoleGuard require="gestor"><RHPage /></RoleGuard></L> },
          { path: 'picagens',     element: <L><PicagemPage /></L> },
          { path: 'picagens/validacao', element: <L><RoleGuard require="gestor"><ValidacaoPicagensPage /></RoleGuard></L> },
          { path: 'epis',            element: <L><RoleGuard require="gestor"><EpisPage /></RoleGuard></L> },
          { path: 'formacoes',       element: <L><RoleGuard require="gestor"><FormacoesPage /></RoleGuard></L> },
          { path: 'seguranca',       element: <L><RoleGuard require="gestor"><FichaSegurancaPage /></RoleGuard></L> },
          { path: 'horarios',     element: <Navigate to="/rh" replace /> },
          { path: 'faltas',       element: <Navigate to="/rh" replace /> },
          { path: 'alertas',      element: <L><RoleGuard require="gestor"><AlertasPage /></RoleGuard></L> },
          { path: 'obras',                    element: <L><ObrasPage /></L> },
          { path: 'obras/nova',               element: <L><RoleGuard require="gestor"><ObraFormPage /></RoleGuard></L> },
          { path: 'obras/:id',                element: <L><ObraDetailPage /></L> },
          { path: 'obras/:id/editar',         element: <L><RoleGuard require="gestor"><ObraFormPage /></RoleGuard></L> },
          { path: 'obras/:id/custos',         element: <L><CustosObraPage /></L> },
          { path: 'subempreiteiros',          element: <L><SubempreiteirosPage /></L> },
          { path: 'subempreiteiros/novo',     element: <L><RoleGuard require="gestor"><SubempreiteiroFormPage /></RoleGuard></L> },
          { path: 'subempreiteiros/:id',      element: <L><SubempreiteiroDetailPage /></L> },
          { path: 'subempreiteiros/:id/editar', element: <L><RoleGuard require="gestor"><SubempreiteiroFormPage /></RoleGuard></L> },
          { path: 'subempreiteiros/:subId/autos/novo', element: <L><RoleGuard require="gestor"><AutoFormPage /></RoleGuard></L> },
          { path: 'autos/:autoId',            element: <L><AutoDetailPage /></L> },
          { path: 'autos/:autoId/editar',     element: <L><RoleGuard require="gestor"><AutoFormPage /></RoleGuard></L> },
          { path: 'combustivel',                       element: <L><CombustivelPage /></L> },
          { path: 'combustivel/abastecimento',         element: <L><AbastecimentoFormPage /></L> },
          { path: 'combustivel/abastecimento/:id/editar', element: <L><AbastecimentoFormPage /></L> },
          { path: 'combustivel/veiculo',               element: <L><VeiculoFormPage /></L> },
          { path: 'combustivel/veiculo/:id/editar',    element: <L><VeiculoFormPage /></L> },
          { path: 'novo-movimento', element: <L><NewMovementPage /></L> },
          { path: 'historico',     element: <L><HistoryPage /></L> },
          { path: 'relatorios',        element: <L><ReportsPage /></L> },
          { path: 'relatorio-semanal', element: <Navigate to="/relatorios" replace /> },
          { path: 'faturas',                  element: <L><RoleGuard require="gestor"><FaturasPage /></RoleGuard></L> },
          { path: 'faturas/:id/classificar', element: <L><RoleGuard require="gestor"><ClassificarFaturaPage /></RoleGuard></L> },
          { path: 'exportacao-contabilidade', element: <L><RoleGuard require="gestor"><ExportacaoContabilidadePage /></RoleGuard></L> },
          { path: 'backup',                element: <L><RoleGuard require="admin"><BackupPage /></RoleGuard></L> },
          { path: 'auditoria',             element: <L><RoleGuard require="admin"><AuditoriaPage /></RoleGuard></L> },
          { path: 'configuracoes',         element: <L><RoleGuard require="admin"><SettingsPage /></RoleGuard></L> },
          { path: 'gestao-utilizadores',   element: <L><RoleGuard require="admin"><GestaoUtilizadoresPage /></RoleGuard></L> },
          { path: 'ajuda',         element: <L><HelpPage /></L> },
          { path: 'documentacao',  element: <Navigate to="/ajuda" replace /> },
          { path: '*',             element: <L><NotFoundPage /></L> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);
