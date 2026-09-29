# Controle Armazém ENCIVIL - Estrutura do Projeto

## Visão Geral
Sistema interno de controle de armazém para a ENCIVIL, empresa de construção civil em Portugal. Em produção, com Supabase real (PostgreSQL + Auth + RLS) e deploy automático na Vercel.

## Estrutura de Diretórios (atual)

```
src/
├── app/
│   ├── App.tsx                    # Raiz: AuthProvider + RouterProvider
│   ├── routes.tsx                 # Definição de rotas (sem lazy loading — ver ADR-008)
│   ├── types.ts                   # Tipos partilhados (Product, Movement, DashboardStats, LowStockItem)
│   ├── layouts/
│   │   └── MainLayout.tsx         # Sidebar (desktop) + MobileBottomNav (mobile) + Header
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ProductsPage.tsx       # Inclui tab de produtos arquivados
│   │   ├── ProductDetailPage.tsx
│   │   ├── NewMovementPage.tsx
│   │   ├── HistoryPage.tsx        # Paginação 50/página + filtro ?produto=
│   │   ├── ReportsPage.tsx
│   │   ├── SettingsPage.tsx       # admin-only (RoleGuard + fieldset disabled)
│   │   ├── DocsPage.tsx
│   │   ├── HelpPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/
│   │   ├── ui/                    # shadcn/ui + Radix primitivos
│   │   ├── Sidebar.tsx
│   │   ├── MobileBottomNav.tsx    # Botão "+" visível para admin e gestor
│   │   ├── Header.tsx             # Nome real + role do utilizador, sino de notificações
│   │   ├── NotificationPanel.tsx  # Recebe notifications/loading via props (sem query própria)
│   │   ├── PWAInstallHint.tsx
│   │   ├── StatCard.tsx           # useCountUp com skeleton (sem flash de "0")
│   │   ├── StockBadge.tsx
│   │   ├── MovementTypeBadge.tsx
│   │   ├── AddProductModal.tsx
│   │   ├── EditProductModal.tsx
│   │   └── ConfirmDialog.tsx
│   └── data/
│       └── mockData.ts            # Apenas labels/helpers (getCategoryLabel, getUnitLabel) — dados reais vêm do Supabase
│
├── features/                      # Lógica de negócio por módulo
│   ├── auth/
│   │   ├── AuthContext.tsx        # session + profile (role, nome) + auto-logout por inatividade
│   │   ├── AuthGuard.tsx          # Bloqueia rotas sem sessão
│   │   ├── RoleGuard.tsx          # Bloqueia rotas sem role suficiente (ex: /configuracoes)
│   │   └── useRole.ts             # Lê role/nome do AuthContext — zero queries extra
│   ├── produtos/
│   │   ├── hooks/useProdutos.ts
│   │   └── services/produtosService.ts
│   ├── movimentos/
│   │   ├── hooks/useMovimentos.ts        # useMovimentos + useMovimentosPaginados
│   │   └── services/movimentosService.ts # listarMovimentos, listarMovimentosPaginados, registarMovimento
│   ├── dashboard/
│   │   └── hooks/useDashboard.ts  # 5 queries paralelas, colunas mínimas (sem SELECT *)
│   ├── notificacoes/
│   │   └── hooks/useNotifications.ts  # Alertas de stock baixo/sem stock
│   └── configuracoes/
│       └── services/configuracoesService.ts
│
├── integrations/
│   └── supabase/
│       ├── client.ts               # Cliente Supabase (anon key apenas)
│       └── types.ts                # RoleUtilizador e tipos gerados
│
├── hooks/
│   └── useCountUp.ts                # Animação de números, sem flash de "0"
│
└── styles/
    └── index.css                   # Tailwind v4 + tokens @theme

supabase/
└── migrations/                     # Ordem cronológica, todas aplicadas em produção
    ├── 20260611000000_initial_schema.sql
    ├── 20260611000001_grants.sql
    ├── 20260611000002_gestor_role.sql
    ├── 20260611000003_seed_users.sql
    ├── 20260611000004_produto_crud.sql
    ├── 20260612000001_default_role_gestor.sql
    ├── 20260612000002_secure_registar_movimento.sql
    ├── 20260612000003_produto_codigo_seq.sql
    ├── 20260612000004_movimentos_idx_produto.sql
    └── 20260622000001_fix_profiles_privilege_escalation.sql
```

## Rotas do Sistema

| Rota | Página | Proteção |
|---|---|---|
| `/login` | LoginPage | Pública |
| `/` | DashboardPage | AuthGuard |
| `/produtos` | ProductsPage | AuthGuard |
| `/produtos/:id` | ProductDetailPage | AuthGuard |
| `/novo-movimento` | NewMovementPage | AuthGuard (?tipo= pré-seleciona entrada/saída) |
| `/historico` | HistoryPage | AuthGuard (?produto= filtra por produto) |
| `/relatorios` | ReportsPage | AuthGuard |
| `/configuracoes` | SettingsPage | AuthGuard + **RoleGuard require="admin"** |
| `/ajuda` | HelpPage | AuthGuard |
| `/documentacao` | DocsPage | AuthGuard |
| `*` | NotFoundPage | AuthGuard |

## Tipos de Dados Principais

### Product (`src/app/types.ts`)
```ts
interface Product {
  id: string; code: string; name: string;
  category: ProductCategory; unit: Unit;
  currentStock: number; minStock: number; status: StockStatus;
  notes?: string; createdAt: Date; updatedAt: Date;
}
type LowStockItem = Pick<Product, 'id'|'name'|'unit'|'currentStock'|'minStock'|'status'>;
```

### Movement
```ts
interface Movement {
  id: string; productId: string; productName: string;
  type: 'entrada' | 'saida' | 'ajuste'; quantity: number; unit: Unit;
  responsible: string; destination?: string;
  date: Date; previousStock: number; newStock: number;
}
```

### RoleUtilizador (`src/integrations/supabase/types.ts`)
```ts
type RoleUtilizador = 'admin' | 'gestor';
```

## Modelo de Roles (resumo — ver `docs/05-seguranca-e-acesso.md`)

| Capacidade | admin | gestor |
|---|---|---|
| Ver dashboard, produtos, histórico, relatórios | ✅ | ✅ |
| Registar movimento (entrada/saída/ajuste) | ✅ | ✅ |
| Criar/editar/arquivar/eliminar produto | ✅ | ❌ |
| Configurações da empresa | ✅ | ❌ |
| Promover/despromover role de outro utilizador | ✅ | ❌ |

Aplicado em três camadas: RLS/GRANTs na DB (real), RPC com verificação de role (real), `RoleGuard`/UI no frontend (UX — nunca a única defesa).

## Paleta de Cores (Tema ENCIVIL)

- **Primary (Azul ENCIVIL)**: `#1e3a8a`
- **Success (Verde)**: `#16a34a`
- **Warning (Amarelo)**: `#f59e0b`
- **Destructive (Vermelho)**: `#dc2626`
- **Background**: `#f5f6f8` · **Card**: `#ffffff` · **Sidebar**: `#1a1d29`

## Funcionalidades por Módulo

### Dashboard
Stats (total produtos, entradas/saídas hoje, stock baixo), últimos 5 movimentos, alertas de stock com link direto ao produto, botões de ação rápida (`?tipo=entrada/saida`).

### Produtos
Listagem com paginação, tab "Arquivados", pesquisa, filtro por categoria, modal de criar/editar (admin), código gerado por sequência DB (`gerar_codigo_produto()`), arquivar/eliminar (admin).

### Novo Movimento
3 tipos, validação de stock em tempo real, responsável pré-preenchido com o nome do utilizador autenticado, atualização atómica via RPC `registar_movimento`.

### Histórico
Paginação 50/página, filtros (tipo, período), filtro por produto via `?produto=`, link "Ver histórico completo" desde o detalhe do produto.

### Relatórios
Gráficos de consumo por produto/categoria/obra, calculados sempre a partir de `movimentos_stock`.

### Configurações
Dados da empresa — admin apenas; gestor vê formulário desativado com banner de aviso.

## Como Adicionar Novas Funcionalidades

### Adicionar Nova Página
1. Criar componente em `src/app/pages/NomePage.tsx`
2. Adicionar rota em `src/app/routes.tsx` (importação direta — **não usar `lazy()`**, ver ADR-008)
3. Adicionar item ao menu em `Sidebar.tsx` e/ou `MobileBottomNav.tsx`
4. Se exigir role específica, envolver com `<RoleGuard require="admin">`

### Adicionar Novo Tipo de Produto
1. Atualizar `ProductCategory` em `src/app/types.ts`
2. Adicionar label em `getCategoryLabel()` em `src/app/data/mockData.ts`

### Alterar Estrutura da Base de Dados
1. Criar migration em `supabase/migrations/` com timestamp novo
2. Aplicar com `supabase db push --db-url <connection-string>`
3. Atualizar `docs/03-modelo-de-dados.md`

## Dependências Principais

- `react-router` 7.18+ — Navegação (sem CVEs conhecidos)
- `recharts` — Gráficos
- `lucide-react` — Ícones
- `sonner` — Toasts
- `vite-plugin-pwa` — PWA / Service Worker
- `@supabase/supabase-js` — Cliente Supabase
- Tailwind CSS v4 — Estilos

## Notas de Design

- Mobile-first; expande para tablet e desktop
- Bottom nav fixa no mobile, sidebar fixa no desktop
- Foco em velocidade operacional (< 10 segundos para registar saída)
- Feedback visual imediato (toasts, skeletons, sem flash de "0")
- Português de Portugal em toda a interface
