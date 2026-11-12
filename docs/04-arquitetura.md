# Arquitetura — Controle Armazém ENCIVIL

> Revisto em 2026-11-12. A visão de módulos e fronteiras está em `ARCHITECTURE.md`; as regras de código em `CLAUDE.md`. Este documento descreve a stack e a organização do código.

---

## Visão Geral

SPA + PWA sem servidor dedicado: o browser fala diretamente com o Supabase (Auth, PostgreSQL com RLS, Storage, Edge Functions em Deno). A segurança real está na BD (RLS, GRANTs, RPCs); a UI é só conforto.

```
Browser (React 18 + Vite + TypeScript, PWA com service worker Workbox)
   │  HTTPS: REST (PostgREST), RPC, Storage, Edge Functions
   ▼
Supabase: Auth (JWT, MFA TOTP) · PostgreSQL + RLS + pg_cron + pg_net · Storage (buckets) · Edge Functions (Deno)
   ▲
   └── Shelly Pro 3 (bomba Polo 2) → Edge Function pump-status

Deploy: GitHub (org Encivil-Constroi) → Cloudflare Pages (main = deploy automático; cabeçalhos em public/_headers)
Erros: Sentry · Backup: GitHub Actions (backup-bd.yml)
```

Rotas por `lazy()` (ADR-010, que substituiu a ADR-008); a atualização da PWA é tratada em `UpdatePrompt.tsx`.

---

## Stack (versões em `package.json`)

| Camada | Tecnologia |
|--------|-----------|
| UI | React 18.3, TypeScript 5 (strict, `noUnusedLocals/Parameters`) |
| Build | Vite 6, `vite-plugin-pwa` (`injectManifest`, SW em `src/sw.ts`) |
| Estilos | Tailwind CSS 4 (plugin Vite), shadcn/ui + Radix (`src/app/components/ui`), tokens em `src/styles/theme.css` |
| Rotas | React Router 7 |
| Gráficos / mapas / avisos | Recharts, Leaflet, Sonner |
| Backend | Supabase (`@supabase/supabase-js` 2): Auth, PostgreSQL, Storage, RLS, Edge Functions |
| Testes | Vitest 4 (jsdom), PGlite para a BD, Deno para as Edge Functions |
| Deploy | Cloudflare Pages |

---

## Organização do Código

```
src/
├── main.tsx, sw.ts
├── app/
│   ├── App.tsx, routes.tsx (lazy() por rota), types.ts
│   ├── layouts/MainLayout.tsx        # Sidebar (desktop) + MobileBottomNav + Header
│   ├── pages/                        # ecrãs transversais (Início, Dashboard, Relatórios, Auditoria, Backup,
│   │                                 #   Configurações…) e pages/armazem/* (junta produtos + movimentos + ferramentas)
│   ├── components/                   # UI partilhada (PageHeader, SeparadoresNav, FiltroChips, CampoSelect, Sidebar…) e ui/ (shadcn)
│   └── lib/                          # useAsync, useMutation, stockUtils, format, buscarTodas, exportCsv/Json/Xlsx, rpcSemTipos, sentry, push…
├── features/<módulo>/                # components/ hooks/ services/ lib/ (+ db.ts, index.ts)
│   # alertas, auth, autos, backup, colaboradores, combustivel, configuracoes, contabilidade, custos, dashboard,
│   # epis, faturas, ferramentas, frota, horarios, livro-obra, movimentos, notificacoes, obras, picagens,
│   # produtos, search, subempreiteiros, theme
├── integrations/supabase/            # client.ts, config.ts (guarda de dev), types.ts (GERADO)
├── hooks/                            # useCountUp, useLockBodyScroll
├── styles/                           # theme.css (tokens), index.css
└── __tests__/                        # Vitest

supabase/migrations/                  # 101 ficheiros; fonte de verdade do schema
supabase/functions/                   # admin-utilizadores, enviar-resumo-alertas, extrair-fatura, ler-foto-abastecimento,
                                      #   notificar-abastecimento, pump-status, send-push-frota (+ _shared)
supabase/tests/                       # testes de BD (PGlite)
```

Fronteiras: um módulo de `features/` importa só de `auth`, `@/app/lib`, `@/integrations`, `@/app/components`; quem junta módulos vive em `src/app/pages`. Exceções históricas (obras como núcleo) em `CLAUDE.md`.

---

## Responsabilidades por Camada

### `app/pages/`
- Composição de componentes, navegação e estado local de formulário; sem regra de negócio.

### `app/components/`
- Componentes visuais reutilizáveis; recebem dados por props e não chamam o Supabase.

### `features/*/services/`
- Toda a lógica de negócio e a comunicação com o Supabase; funções puras sempre que possível. Constante `SELECT` no topo; sem N+1.

### `features/*/hooks/`
- Hooks sobre `useAsync` / `useMutation` (`src/app/lib`): expõem `data`, `loading`, `error` e mutações.

### `integrations/supabase/`
- Cliente configurado por variáveis de ambiente (`config.ts` valida o par URL/chave) e tipos gerados pelo CLI. Nunca editar `types.ts` à mão.

### `app/lib/`
- Funções puras e utilitários sem regra de módulo: formatação (`format.ts`), datas de Lisboa (`dataLisboa.ts`), paginação (`buscarTodas.ts`), exportações.

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
