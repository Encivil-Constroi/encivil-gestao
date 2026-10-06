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
import { Redirecionar } from './components/Redirecionar';
const ImprimirQrPage          = lazy(() => import('./pages/pub/ImprimirQrPage').then(m => ({ default: m.ImprimirQrPage })));

// ── Imports lazy (carregados só quando a rota é visitada) ────────────────────
const DashboardPage    = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));


const ObrasLayout          = lazy(() => import('@/features/obras').then(m => ({ default: m.ObrasLayout })));
const ObrasPainelPage      = lazy(() => import('@/features/obras').then(m => ({ default: m.ObrasPainelPage })));
const ObrasListaPage       = lazy(() => import('@/features/obras').then(m => ({ default: m.ObrasListaPage })));
const ObraFormPage         = lazy(() => import('@/features/obras').then(m => ({ default: m.ObraFormPage })));
const ObraFichaPage        = lazy(() => import('@/features/obras').then(m => ({ default: m.ObraFichaPage })));
const RelatoriosDiariosPage = lazy(() => import('@/features/obras').then(m => ({ default: m.RelatoriosDiariosPage })));
const RelatorioDiarioPage  = lazy(() => import('@/features/obras').then(m => ({ default: m.RelatorioDiarioPage })));

const SubempreiteirosPage    = lazy(() => import('@/features/obras/components/subempreitadas/SubempreiteirosPage').then(m => ({ default: m.SubempreiteirosPage })));
const SubWriteGuard = lazy(() => import('@/features/obras/components/subempreitadas/SubWriteGuard').then(m => ({ default: m.SubWriteGuard })));
const SubempreiteiroFormPage = lazy(() => import('@/features/obras/components/subempreitadas/SubempreiteiroFormPage').then(m => ({ default: m.SubempreiteiroFormPage })));
const SubempreiteiroDetailPage = lazy(() => import('@/features/obras/components/subempreitadas/SubempreiteiroDetailPage').then(m => ({ default: m.SubempreiteiroDetailPage })));
const AutoFormPage     = lazy(() => import('@/features/obras/components/subempreitadas/AutoFormPage').then(m => ({ default: m.AutoFormPage })));
const AutoDetailPage   = lazy(() => import('@/features/obras/components/subempreitadas/AutoDetailPage').then(m => ({ default: m.AutoDetailPage })));

const AbastecimentoFormPage    = lazy(() => import('./pages/AbastecimentoFormPage').then(m => ({ default: m.AbastecimentoFormPage })));

const RecursosHumanosPage = lazy(() => import('./pages/RecursosHumanosPage').then(m => ({ default: m.RecursosHumanosPage })));
const PerfilPage          = lazy(() => import('@/features/auth/components/PerfilPage').then(m => ({ default: m.PerfilPage })));
const RHPage             = lazy(() => import('@/features/horarios').then(m => ({ default: m.RHPage })));
const PicagemPage        = lazy(() => import('@/features/picagens').then(m => ({ default: m.PicagemPage })));
const ValidacaoPicagensPage = lazy(() => import('@/features/picagens').then(m => ({ default: m.ValidacaoPicagensPage })));
const EpisPage           = lazy(() => import('@/features/epis').then(m => ({ default: m.EpisPage })));
const FormacoesPage      = lazy(() => import('@/features/epis').then(m => ({ default: m.FormacoesPage })));
const FichaSegurancaPage = lazy(() => import('@/features/epis').then(m => ({ default: m.FichaSegurancaPage })));
const AlertasPage        = lazy(() => import('@/features/alertas').then(m => ({ default: m.AlertasPage })));
const AuditoriaPage      = lazy(() => import('./pages/AuditoriaPage').then(m => ({ default: m.AuditoriaPage })));

const ReportsPage        = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage       = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const HelpPage           = lazy(() => import('./pages/HelpPage').then(m => ({ default: m.HelpPage })));
const NotFoundPage       = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const ResetPasswordPage      = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const AutoPdfPage            = lazy(() => import('@/features/obras/components/subempreitadas/AutoPdfPage').then(m => ({ default: m.AutoPdfPage })));
const ObraRelatorioPage         = lazy(() => import('./pages/ObraRelatorioPage').then(m => ({ default: m.ObraRelatorioPage })));
const ExportacaoContabilidadePage = lazy(() => import('./pages/ExportacaoContabilidadePage').then(m => ({ default: m.ExportacaoContabilidadePage })));
const BackupPage                = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })));

const FaturasPage           = lazy(() => import('@/features/faturas').then(m => ({ default: m.FaturasPage })));
const ClassificarFaturaPage = lazy(() => import('@/features/faturas').then(m => ({ default: m.ClassificarFaturaPage })));
const CustosObraPage        = lazy(() => import('@/features/custos').then(m => ({ default: m.CustosObraPage })));
const LivroObraPage         = lazy(() => import('@/features/livro-obra').then(m => ({ default: m.LivroObraPage })));
const GuiasTransportePage   = lazy(() => import('@/features/livro-obra').then(m => ({ default: m.GuiasTransportePage })));
const FrotaLayout            = lazy(() => import('@/features/frota').then(m => ({ default: m.FrotaLayout })));
const FrotaDashboardPage     = lazy(() => import('@/features/frota').then(m => ({ default: m.FrotaDashboardPage })));
const ViaturasListaPage      = lazy(() => import('@/features/frota').then(m => ({ default: m.ViaturasListaPage })));
const ViaturaFormPage        = lazy(() => import('@/features/frota').then(m => ({ default: m.ViaturaFormPage })));
const EntregasPage           = lazy(() => import('@/features/frota').then(m => ({ default: m.EntregasPage })));
const EntregaFormPage        = lazy(() => import('@/features/frota').then(m => ({ default: m.EntregaFormPage })));
const ManutencaoPage         = lazy(() => import('@/features/frota').then(m => ({ default: m.ManutencaoPage })));
const ManutencaoFormPage     = lazy(() => import('@/features/frota').then(m => ({ default: m.ManutencaoFormPage })));
const FrotaConfigPage        = lazy(() => import('@/features/frota').then(m => ({ default: m.FrotaConfigPage })));
const FichaViaturaPage      = lazy(() => import('@/features/frota').then(m => ({ default: m.FichaViaturaPage })));
const FichaViaturaPrintPage = lazy(() => import('@/features/frota').then(m => ({ default: m.FichaViaturaPrintPage })));
const ConfigurarItensPage   = lazy(() => import('@/features/frota').then(m => ({ default: m.ConfigurarItensPage })));
const ChecklistPage         = lazy(() => import('@/features/frota').then(m => ({ default: m.ChecklistPage })));
const CatalogoFrotaPage     = lazy(() => import('@/features/frota').then(m => ({ default: m.CatalogoPage })));
const DestinatariosFrotaPage = lazy(() => import('@/features/frota').then(m => ({ default: m.DestinatariosPage })));
const NovoPedidoPage          = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.NovoPedidoPage })));
const ArmazemLayout          = lazy(() => import('./pages/armazem').then(m => ({ default: m.ArmazemLayout })));
const InventarioPage         = lazy(() => import('./pages/armazem').then(m => ({ default: m.InventarioPage })));
const ProdutoFormPage        = lazy(() => import('./pages/armazem').then(m => ({ default: m.ProdutoFormPage })));
const ProdutoDetalhePage     = lazy(() => import('./pages/armazem').then(m => ({ default: m.ProdutoDetalhePage })));
const VisaoGeralPage         = lazy(() => import('./pages/armazem').then(m => ({ default: m.VisaoGeralPage })));
const MovimentosPage         = lazy(() => import('./pages/armazem').then(m => ({ default: m.MovimentosPage })));
const MovimentoFormPage      = lazy(() => import('./pages/armazem').then(m => ({ default: m.MovimentoFormPage })));
const ObrasArmazemPage       = lazy(() => import('./pages/armazem').then(m => ({ default: m.ObrasArmazemPage })));
const FerramentasPage        = lazy(() => import('./pages/armazem').then(m => ({ default: m.FerramentasPage })));
const FerramentaFormPage     = lazy(() => import('./pages/armazem').then(m => ({ default: m.FerramentaFormPage })));
const FerramentaDetalhePage  = lazy(() => import('./pages/armazem').then(m => ({ default: m.FerramentaDetalhePage })));
const EmprestimoPage         = lazy(() => import('./pages/armazem').then(m => ({ default: m.EmprestimoPage })));
const DevolucaoPage          = lazy(() => import('./pages/armazem').then(m => ({ default: m.DevolucaoPage })));
const AbastecimentoLayout     = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.AbastecimentoLayout })));
const SeparadorPedidos        = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.SeparadorPedidos })));
const SeparadorBomba          = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.SeparadorBomba })));
const HistoricoAbastecimentos = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.HistoricoAbastecimentos })));
const PedidoPage              = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.PedidoPage })));
const ConfigAbastecimentoPage = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.ConfigAbastecimentoPage })));
const RelatorioCombustivelPage = lazy(() => import('@/features/combustivel/pedidos').then(m => ({ default: m.RelatorioCombustivelPage })));

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
    element: <Redirecionar para="/abastecimento/pedir" />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/pub/imprimir-qr',
    element: <L><ImprimirQrPage /></L>,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorPage />,
    children: [
      // Rotas full-page — autenticadas mas sem MainLayout (sem barra lateral, para impressão/PDF)
      {
        path: '/obras/auto/:autoId/pdf',
        element: <L><AutoPdfPage /></L>,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/autos/:autoId/pdf',
        element: <Redirecionar para="/obras/auto/:autoId/pdf" />,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/obras/:id/relatorio',
        element: <L><ObraRelatorioPage /></L>,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/frota/viatura/:id/imprimir',
        element: <L><FichaViaturaPrintPage /></L>,
        errorElement: <RouteErrorPage />,
      },
      {
        path: '/',
        Component: MainLayout,
        errorElement: <RouteErrorPage />,
        children: [
          { index: true,           element: <L><DashboardPage /></L> },
          // ── Armazém ── (quem pode escrever decide-se em cada página e na RLS)
          {
            path: 'armazem',
            element: <L><ArmazemLayout /></L>,
            children: [
              { index: true,         element: <L><VisaoGeralPage /></L> },
              { path: 'inventario',  element: <L><InventarioPage /></L> },
              { path: 'movimentos',  element: <L><MovimentosPage /></L> },
              { path: 'ferramentas', element: <L><FerramentasPage /></L> },
              { path: 'obras',       element: <L><ObrasArmazemPage /></L> },
            ],
          },
          { path: 'armazem/produto/novo',             element: <L><ProdutoFormPage /></L> },
          { path: 'armazem/produto/:id',              element: <L><ProdutoDetalhePage /></L> },
          { path: 'armazem/produto/:id/editar',       element: <L><ProdutoFormPage /></L> },
          { path: 'armazem/movimento/entrada',        element: <L><MovimentoFormPage tipo="entrada" /></L> },
          { path: 'armazem/movimento/saida',          element: <L><MovimentoFormPage tipo="saida" /></L> },
          { path: 'armazem/ferramenta/nova',          element: <L><FerramentaFormPage /></L> },
          { path: 'armazem/ferramenta/emprestimo',    element: <L><EmprestimoPage /></L> },
          { path: 'armazem/ferramenta/:id',           element: <L><FerramentaDetalhePage /></L> },
          { path: 'armazem/ferramenta/:id/editar',    element: <L><FerramentaFormPage /></L> },
          { path: 'armazem/ferramenta/:id/devolucao', element: <L><DevolucaoPage /></L> },
          // Endereços antigos do armazém
          { path: 'produtos',                  element: <Redirecionar para="/armazem/inventario" /> },
          { path: 'produtos/:id',              element: <Redirecionar para="/armazem/produto/:id" /> },
          { path: 'novo-movimento',            element: <Redirecionar para="/armazem/movimento/entrada" /> },
          { path: 'historico',                 element: <Redirecionar para="/armazem/movimentos" /> },
          { path: 'ferramentas',               element: <Redirecionar para="/armazem/ferramentas" /> },
          { path: 'ferramentas/nova',          element: <Redirecionar para="/armazem/ferramenta/nova" /> },
          { path: 'ferramentas/emprestimo',    element: <Redirecionar para="/armazem/ferramenta/emprestimo" /> },
          { path: 'ferramentas/:id',           element: <Redirecionar para="/armazem/ferramenta/:id" /> },
          { path: 'ferramentas/:id/editar',    element: <Redirecionar para="/armazem/ferramenta/:id/editar" /> },
          { path: 'ferramentas/:id/devolucao', element: <Redirecionar para="/armazem/ferramenta/:id/devolucao" /> },
          { path: 'colaboradores', element: <L><RoleGuard require="gestor"><RecursosHumanosPage /></RoleGuard></L> },
          { path: 'rh',           element: <L><RoleGuard require="gestor"><RHPage /></RoleGuard></L> },
          { path: 'picagens',     element: <L><PicagemPage /></L> },
          { path: 'picagens/validacao', element: <L><RoleGuard require="gestor"><ValidacaoPicagensPage /></RoleGuard></L> },
          { path: 'epis',            element: <L><RoleGuard require="gestor"><EpisPage /></RoleGuard></L> },
          { path: 'formacoes',       element: <L><RoleGuard require="gestor"><FormacoesPage /></RoleGuard></L> },
          { path: 'seguranca',       element: <L><RoleGuard require="gestor"><FichaSegurancaPage /></RoleGuard></L> },
          { path: 'horarios',     element: <Navigate to="/colaboradores?aba=horarios" replace /> },
          { path: 'faltas',       element: <Navigate to="/colaboradores?aba=faltas" replace /> },
          { path: 'alertas',      element: <L><RoleGuard require="gestor"><AlertasPage /></RoleGuard></L> },
          // ── Obras ── (um só módulo: obras, relatórios diários e subempreitadas)
          {
            path: 'obras',
            element: <L><ObrasLayout /></L>,
            children: [
              { index: true,           element: <L><ObrasPainelPage /></L> },
              { path: 'lista',         element: <L><ObrasListaPage /></L> },
              { path: 'relatorios',    element: <L><RelatoriosDiariosPage /></L> },
              { path: 'subempreitadas', element: <L><SubempreiteirosPage /></L> },
            ],
          },
          { path: 'obras/nova',                          element: <L><RoleGuard require="gestor"><ObraFormPage /></RoleGuard></L> },
          { path: 'obras/:id',                           element: <L><ObraFichaPage /></L> },
          { path: 'obras/:id/editar',                    element: <L><RoleGuard require="gestor"><ObraFormPage /></RoleGuard></L> },
          { path: 'obras/:id/custos',                    element: <L><CustosObraPage /></L> },
          { path: 'obras/:id/livro',                     element: <L><LivroObraPage /></L> },
          { path: 'obras/:id/guias',                     element: <L><GuiasTransportePage /></L> },
          { path: 'obras/:id/relatorio-diario/novo',     element: <L><RelatorioDiarioPage /></L> },
          { path: 'obras/relatorio-diario/:rid',         element: <L><RelatorioDiarioPage /></L> },
          { path: 'obras/subempreitada/novo',            element: <L><SubWriteGuard><SubempreiteiroFormPage /></SubWriteGuard></L> },
          { path: 'obras/subempreitada/:id',             element: <L><SubempreiteiroDetailPage /></L> },
          { path: 'obras/subempreitada/:id/editar',      element: <L><SubWriteGuard><SubempreiteiroFormPage /></SubWriteGuard></L> },
          { path: 'obras/subempreitada/:subId/auto/novo', element: <L><SubWriteGuard><AutoFormPage /></SubWriteGuard></L> },
          { path: 'obras/auto/:autoId',                  element: <L><AutoDetailPage /></L> },
          { path: 'obras/auto/:autoId/editar',           element: <L><SubWriteGuard><AutoFormPage /></SubWriteGuard></L> },
          // Endereços antigos das subempreitadas e autos (favoritos, notificações já enviadas)
          { path: 'subempreiteiros',                     element: <Redirecionar para="/obras/subempreitadas" /> },
          { path: 'subempreiteiros/novo',                element: <Redirecionar para="/obras/subempreitada/novo" /> },
          { path: 'subempreiteiros/:id',                 element: <Redirecionar para="/obras/subempreitada/:id" /> },
          { path: 'subempreiteiros/:id/editar',          element: <Redirecionar para="/obras/subempreitada/:id/editar" /> },
          { path: 'subempreiteiros/:subId/autos/novo',   element: <Redirecionar para="/obras/subempreitada/:subId/auto/novo" /> },
          { path: 'autos/:autoId',                       element: <Redirecionar para="/obras/auto/:autoId" /> },
          { path: 'autos/:autoId/editar',                element: <Redirecionar para="/obras/auto/:autoId/editar" /> },
          // ── Abastecimento ──
          {
            path: 'abastecimento',
            element: <L><AbastecimentoLayout /></L>,
            children: [
              { index: true,           element: <L><SeparadorPedidos /></L> },
              { path: 'historico',     element: <L><HistoricoAbastecimentos /></L> },
              { path: 'analise',       element: <L><RelatorioCombustivelPage embutido /></L> },
              { path: 'bomba',         element: <L><SeparadorBomba /></L> },
              { path: 'configuracao',  element: <L><RoleGuard require="admin"><ConfigAbastecimentoPage embutido /></RoleGuard></L> },
            ],
          },
          { path: 'abastecimento/pedir',               element: <L><NovoPedidoPage /></L> },
          { path: 'abastecimento/pedido/:id',          element: <L><PedidoPage /></L> },
          { path: 'abastecimento/registo/novo',        element: <L><RoleGuard require="admin"><AbastecimentoFormPage /></RoleGuard></L> },
          { path: 'abastecimento/registo/:id',         element: <L><RoleGuard require="admin"><AbastecimentoFormPage /></RoleGuard></L> },
          // Endereços antigos (favoritos, QR, notificações enviadas)
          { path: 'abastecer',                         element: <Redirecionar para="/abastecimento/pedir" /> },
          { path: 'abastecer/pedidos',                 element: <Redirecionar para="/abastecimento" /> },
          { path: 'abastecer/pedido/:id',              element: <Redirecionar para="/abastecimento/pedido/:id" /> },
          { path: 'combustivel',                       element: <Redirecionar para="/abastecimento" /> },
          { path: 'combustivel/relatorio',             element: <Redirecionar para="/abastecimento/analise" /> },
          { path: 'combustivel/configuracao',          element: <Redirecionar para="/abastecimento/configuracao" /> },
          { path: 'combustivel/abastecimento/*',       element: <Redirecionar para="/abastecimento/historico" /> },
          { path: 'combustivel/abastecimento',         element: <Redirecionar para="/abastecimento/historico" /> },
          { path: 'combustivel/veiculo',               element: <Redirecionar para="/frota/viatura/nova" /> },
          { path: 'combustivel/veiculo/:id/editar',    element: <Redirecionar para="/frota/viatura/:id/editar" /> },
          // ── Frota ──
          {
            path: 'frota',
            element: <L><FrotaLayout /></L>,
            children: [
              { index: true,           element: <L><FrotaDashboardPage /></L> },
              { path: 'viaturas',      element: <L><ViaturasListaPage /></L> },
              { path: 'entregas',      element: <L><EntregasPage /></L> },
              { path: 'manutencao',    element: <L><ManutencaoPage /></L> },
              { path: 'configuracao',  element: <L><FrotaConfigPage /></L> },
            ],
          },
          { path: 'frota/viatura/nova',                element: <L><ViaturaFormPage /></L> },
          { path: 'frota/viatura/:id/editar',          element: <L><ViaturaFormPage /></L> },
          { path: 'frota/entregar',                    element: <L><EntregaFormPage tipo="ENTREGA" /></L> },
          { path: 'frota/devolver',                    element: <L><EntregaFormPage tipo="DEVOLUCAO" /></L> },
          { path: 'frota/manutencao/nova',             element: <L><ManutencaoFormPage /></L> },
          { path: 'frota/manutencao/:id/editar',       element: <L><ManutencaoFormPage /></L> },
          { path: 'frota/catalogo',                    element: <L><CatalogoFrotaPage /></L> },
          { path: 'frota/notificacoes',                element: <L><RoleGuard require="admin"><DestinatariosFrotaPage /></RoleGuard></L> },
          { path: 'frota/viatura/:id',                 element: <L><FichaViaturaPage /></L> },
          { path: 'frota/viatura/:id/configurar',      element: <L><ConfigurarItensPage /></L> },
          { path: 'frota/viatura/:id/manutencao',      element: <Redirecionar para="/frota/manutencao/nova?viatura=:id" /> },
          { path: 'frota/viatura/:id/checklist',       element: <L><ChecklistPage /></L> },
          { path: 'relatorios',        element: <L><ReportsPage /></L> },
          { path: 'relatorio-semanal', element: <Navigate to="/relatorios" replace /> },
          { path: 'faturas',                  element: <L><RoleGuard require="gestor"><FaturasPage /></RoleGuard></L> },
          { path: 'faturas/:id/classificar', element: <L><RoleGuard require="gestor"><ClassificarFaturaPage /></RoleGuard></L> },
          { path: 'exportacao-contabilidade', element: <L><RoleGuard require="gestor"><ExportacaoContabilidadePage /></RoleGuard></L> },
          { path: 'backup',                element: <L><RoleGuard require="admin"><BackupPage /></RoleGuard></L> },
          { path: 'auditoria',             element: <L><RoleGuard require="admin"><AuditoriaPage /></RoleGuard></L> },
          { path: 'configuracoes',         element: <L><RoleGuard require="admin"><SettingsPage /></RoleGuard></L> },
          { path: 'gestao-utilizadores',   element: <Navigate to="/colaboradores?aba=utilizadores" replace /> },
          { path: 'perfil',        element: <L><PerfilPage /></L> },
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
