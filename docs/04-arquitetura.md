# Arquitetura — Controle Armazém ENCIVIL

---

## Visão Geral

Arquitetura frontend-only (SPA + PWA) com backend gerido pelo Supabase. Sem servidor dedicado. Bundle único (sem code-splitting por rota — ver ADR-008), service worker via Workbox para instalação como PWA e cache de assets estáticos.

```
┌─────────────────────────────────────────┐
│               Browser                   │
│   React + TypeScript + Vite (SPA)       │
│                                         │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  React   │  │   React Router v7    │ │
│  │  Estado  │  │   (client-side)      │ │
│  └──────────┘  └──────────────────────┘ │
└────────────────────┬────────────────────┘
                     │ HTTPS / REST / WebSocket
                     ▼
┌─────────────────────────────────────────┐
│              Supabase                   │
│                                         │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  Auth    │  │  PostgreSQL + RLS    │ │
│  │ (JWT)    │  │  (Base de dados)     │ │
│  └──────────┘  └──────────────────────┘ │
│  ┌──────────┐                           │
│  │ Storage  │  (logótipo, futuro)       │
│  └──────────┘                           │
└─────────────────────────────────────────┘
                     │
                     ▼ Deploy
┌─────────────────────────────────────────┐
│                Vercel                   │
│  (CDN global, HTTPS automático, CI/CD)  │
└─────────────────────────────────────────┘
```

---

## Stack Completa

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| UI Framework | React | 18 |
| Linguagem | TypeScript | 5 |
| Build Tool | Vite | 6 |
| Estilização | Tailwind CSS | 4 |
| Roteamento | React Router | 7 |
| Backend | Supabase | Cloud |
| Autenticação | Supabase Auth | — |
| Base de dados | Supabase PostgreSQL | 15+ |
| Segurança | Supabase RLS | — |
| Deploy | Cloudflare Pages | — |

> Nota (2026-09-29): o diagrama acima e a frase "sem code-splitting por rota"
> refletem a decisão original da ADR-008. Essa decisão foi revertida em
> 28/07/2026 (lazy loading está em uso desde então) — ver ADR-010. O deploy
> também mudou de Vercel para Cloudflare Pages — ver `docs/09-implantacao.md`.

---

## Organização do Código (atual — ver a secção "Arquitetura" em `CLAUDE.md` para o detalhe completo)

```
src/
├── app/
│   ├── App.tsx                   # AuthProvider + RouterProvider
│   ├── routes.tsx                # Rotas — bundle único, sem lazy() (ADR-008)
│   ├── types.ts                  # Product, Movement, DashboardStats, LowStockItem
│   ├── layouts/MainLayout.tsx    # Sidebar (desktop) + MobileBottomNav + Header
│   ├── pages/                    # 11 páginas (Login, Dashboard, Produtos, ProdutoDetalhe,
│   │                              # NovoMovimento, Histórico, Relatórios, Configurações,
│   │                              # Docs, Ajuda, NotFound)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui + Radix
│   │   ├── Header.tsx            # Nome real + role do utilizador (useRole, não email)
│   │   ├── NotificationPanel.tsx # Recebe dados via props — não faz query própria
│   │   ├── MobileBottomNav.tsx
│   │   ├── PWAInstallHint.tsx
│   │   └── StatCard.tsx          # useCountUp + skeleton
│   └── data/mockData.ts          # Só helpers de label (getCategoryLabel/getUnitLabel) — sem dados mock
│
├── features/                     # Lógica de negócio por módulo
│   ├── auth/
│   │   ├── AuthContext.tsx       # session + profile (role, nome); auto-logout 30min
│   │   ├── AuthGuard.tsx         # Bloqueia sem sessão
│   │   ├── RoleGuard.tsx         # Bloqueia sem role suficiente
│   │   └── useRole.ts            # Lê do context — zero queries extra
│   ├── produtos/{hooks,services}/
│   ├── movimentos/{hooks,services}/   # useMovimentos + useMovimentosPaginados
│   ├── dashboard/hooks/useDashboard.ts
│   ├── notificacoes/hooks/useNotifications.ts
│   └── configuracoes/services/
│
├── integrations/supabase/
│   ├── client.ts                 # Cliente com anon key apenas
│   └── types.ts                  # RoleUtilizador = 'admin' | 'gestor'
│
├── hooks/useCountUp.ts           # Compartilhado fora de features/
│
└── styles/index.css              # Tailwind v4 @theme

supabase/migrations/              # 10 migrations, todas aplicadas — fonte de verdade do schema
```

**Diferenças relevantes face ao plano original:** sem `integrations/supabase/queries/` (queries inline nos services), sem `shared/` (hooks pequenos foram para `src/hooks/`), sem `utils/date.ts`/`utils/stock.ts` separados (lógica de stock vive na RPC `registar_movimento`, não no frontend).

---

## Responsabilidades por Camada

### `app/pages/`
- Páginas de alto nível; composição de componentes.
- **Não** contém lógica de negócio — delega para `features/`.
- Apenas UI, navegação e estado local de formulário.

### `app/components/`
- Componentes visuais reutilizáveis sem lógica de negócio.
- Aceitam dados por props; não chamam Supabase diretamente.

### `features/*/services/`
- Toda a lógica de negócio e comunicação com Supabase.
- Funções puras sempre que possível.
- Validações de regras de negócio aqui (ex: stock insuficiente).

### `features/*/hooks/`
- React hooks que encapsulam estado e chamadas aos services.
- Expõem `data`, `loading`, `error` e funções de mutação.

### `integrations/supabase/`
- Cliente Supabase configurado com variáveis de ambiente.
- Tipos gerados automaticamente pelo CLI Supabase.
- Queries SQL reutilizáveis (evitar SQL inline nos services).

### `utils/`
- Funções puras utilitárias sem dependências de React.
- Formatação, cálculos, manipulação de datas.

---

## Regra para Agents

> **Agents não devem misturar regra de negócio dentro de componentes visuais quando puder ser isolada em services/utils.**

Correto:
```ts
// features/movimentos/services/movimentosService.ts
export function validarSaida(quantidade: number, stockAtual: number) {
  if (quantidade > stockAtual) throw new Error('Stock insuficiente');
}
```

Errado:
```tsx
// app/pages/NewMovementPage.tsx — NÃO fazer isto
if (quantidade > produto.stock_atual) {
  setErro('Stock insuficiente');
}
```

---

## Fluxo de Dados

```
Utilizador interage com Page
  → Page chama hook (features/*/hooks/)
    → Hook chama service (features/*/services/)
      → Service chama Supabase (integrations/supabase/)
        → Supabase executa query + RLS
          → Resultado volta ao hook
            → Hook atualiza estado React
              → Page re-renderiza
```
