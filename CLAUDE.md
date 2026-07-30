# ENCIVIL Gestão — Guia para Claude

## Contexto do Projeto

ERP interno da ENCIVIL (empresa de construção civil) — sistema em produção, multiutilizador, usado diariamente pelas equipas de obra.

**Stack:** React 18 + Vite + TypeScript (strict) + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, Storage, RLS)  
**Deploy:** Cloudflare Pages via `origin` remote (GitHub org: Encivil-Constroi)  
**Legado:** `antigo-vercel` remote — ignorar, deprecado  
**URL produção:** https://encivil-gestao.pages.dev

---

## Arquitetura

```
src/
  app/
    lib/          ← useAsync<T>, useMutation<TArgs,TResult>, stockUtils, exportCsv
    types.ts      ← tipos de domínio (Product, Movement, Tool, FuelEntry, etc.)
    router.tsx    ← React Router v7
  features/       ← módulos por domínio (um por funcionalidade)
    auth/         ← useAuth, AuthGuard, RoleGuard, useRole
    produtos/     ← armazém (produtos + stock)
    movimentos/   ← movimentos de stock + offline queue (useOfflineQueue)
    obras/        ← gestão de obras
    subempreiteiros/ ← contratos + autos de medição
    ferramentas/  ← ferramentas + empréstimos (com termo de responsabilidade)
    combustivel/  ← abastecimentos + viaturas + pendentes QR
    dashboard/    ← overview + alertas stock
    custos/       ← custos agregados por obra
    configuracoes/ ← configurações globais
    notificacoes/ ← sistema de notificações
  integrations/
    supabase/     ← client.ts + types.ts (GERADO — não editar manualmente)
  components/     ← UI shared (shadcn/ui + Radix)
```

**RBAC — 3 papeis:**
- `admin` — acesso total, pode eliminar permanentemente
- `gestor` — gestão e aprovação; sem delete permanente
- `operador` — registo (entradas/saídas/empréstimos); sem gestão

---

## Padrões Obrigatórios

### Hooks de dados — SEMPRE useAsync / useMutation

```typescript
// Fetch
export function useFoo(id?: string) {
  const { data: foo, loading, error, reload } = useAsync(
    () => fetchFoo(id!), [id],
    { enabled: !!id, errorMsg: 'Foo não encontrado' }
  )
  return { foo, loading, error, reload }
}

// Mutação com retorno
export function useSalvarFoo() {
  const { mutate: salvar, loading, error } = useMutation(salvarFoo, 'Erro ao salvar')
  return { salvar, loading, error }
}

// Void mutation (delete/archive) — padrão obrigatório
export function useEliminarFoo() {
  const { mutate, loading } = useMutation(
    async (id: string): Promise<true> => { await eliminarFoo(id); return true }
  )
  const eliminar = async (id: string) => (await mutate(id)) === true
  return { eliminar, loading }
}

// Dual mutation (criar + atualizar no mesmo hook)
export function useGuardarFoo() {
  const criador    = useMutation(criarFoo, 'Erro ao guardar')
  const atualizador = useMutation((id: string, input: AtualizarFoo) => atualizarFoo(id, input), 'Erro ao guardar')
  return {
    criar: criador.mutate, atualizar: atualizador.mutate,
    loading: criador.loading || atualizador.loading,
    error:   criador.error   || atualizador.error,
  }
}
```

### Services — SELECT constante + sem N+1

```typescript
const SELECT = '*, tabela_b(col1, col2)'  // constante no topo do ficheiro

// Encadear .select() em INSERT/UPDATE para retornar o row completo num único round-trip
const { data } = await supabase
  .insert({ ... })
  .select(SELECT)
  .single()
return toEntity(data as Row)
```

### Filtros Supabase — inline, nunca em helpers genéricos

```typescript
// BOM — type-safe, sem as any
if (filtros.estado) query = query.eq('estado', filtros.estado)

// MAU — helper genérico com as any
function aplicarFiltros<T>(query: T, filtros: F): T { ... }  // ← nunca fazer
```

---

## Supabase — Regras Críticas

### Migrations
- Ficheiros em `supabase/migrations/YYYYMMDDHHMMSS_nome.sql`
- **Automatically expose new tables está OFF** — SEMPRE incluir GRANTs explícitos:
  ```sql
  GRANT SELECT, INSERT, UPDATE ON TABLE public.nova_tabela TO authenticated;
  GRANT EXECUTE ON FUNCTION public.nova_fn(UUID) TO authenticated;
  ```
- Após aplicar migration: regenerar tipos com `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

### RPCs existentes (não duplicar)
- `registar_movimento` — atomic stock movement com audit log e advisory lock
- `criar_auto_rpc` — numeração de autos sem race condition (advisory lock por subempreiteiro)
- `custos_materiais_por_obra` — custos agregados server-side (materiais + combustível)
- `produtos_em_alerta` — produtos com stock baixo/sem-stock (sem fetch total da tabela)

### Segurança de chaves
- `sb_publishable_*` → chave pública → pode ir em `VITE_` env vars
- `sb_secret_*` → chave secreta → **NUNCA no frontend**, **NUNCA em VITE_**
- O pre-commit hook bloqueia automaticamente commits com `sb_secret_`

---

## Comandos

```sh
npm run dev          # servidor local (Vite HMR)
npm run typecheck    # TypeScript check — deve dar 0 erros
npm run build        # bundle de produção (Cloudflare Pages)
npm test             # Vitest (testes unitários, sem Supabase)
npm run test:watch   # Vitest em modo watch
```

**Git:**
- Pre-commit: scan de secrets + typecheck
- Pre-push: `npm run build`
- Branch principal: `main` → deploy automático via Cloudflare Pages

---

## Regras — NUNCA Fazer

1. **Sem `as any`** — filtros Supabase devem ser inlined; helpers genéricos quebram os tipos
2. **Sem N+1** — encadear `.select(SELECT)` em INSERT/UPDATE; nunca buscar item depois de criar
3. **Sem `sb_secret_` no frontend** — apenas `sb_publishable_` em VITE_ vars
4. **Sem migrations sem GRANT** — RLS está ativo mas without GRANT o `authenticated` não acede
5. **Sem `useEffect`+`useState` manual para dados remotos** — usar `useAsync`
6. **Sem comentários de O QUÊ** — só comentar O PORQUÊ quando a razão não é óbvia
7. **Sem editar `src/integrations/supabase/types.ts` manualmente** — é gerado
8. **Sem push para `antigo-vercel`** — Cloudflare Pages é o deploy oficial

---

## Ficheiros Chave

| Ficheiro | Papel |
|---|---|
| `src/app/lib/useAsync.ts` | Hook base de fetch (DRY para todos os módulos) |
| `src/app/lib/useMutation.ts` | Hook base de mutação |
| `src/app/lib/stockUtils.ts` | `calcStatus(atual, minimo)` — lógica de estado de stock |
| `src/app/types.ts` | Tipos de domínio (Product, Movement, Tool, FuelEntry…) |
| `src/integrations/supabase/types.ts` | Tipos gerados — regenerar após migrations |
| `supabase/migrations/` | Histórico de migrations SQL |
| `.githooks/pre-commit` | Scan de secrets + typecheck |
| `.githooks/pre-push` | Build check antes do push |
| `.github/workflows/ci.yml` | CI: typecheck + build + tests em cada PR/push |

---

## PWA

- Service Worker com Workbox (`registerType: 'prompt'`)
- JS/CSS: `StaleWhileRevalidate` (chunks novos buscados em background)
- Imagens/fonts: `CacheFirst` (imutáveis entre deploys)
- Supabase API: `NetworkFirst` (dados críticos de stock nunca servidos do cache)
- Offline queue em `src/features/movimentos/hooks/useOfflineQueue.ts`
