# [P2 · MÉDIO] HistoryPage carrega todos os movimentos sem paginação

## Resolução — 2026-06-12

### Service: `listarMovimentosPaginados()`
Nova função em `movimentosService.ts` com `{ count: 'exact' }` e `.range(from, to)`:
```ts
export const PAGE_SIZE = 50

export async function listarMovimentosPaginados(filtros, page = 0) {
  const { data, error, count } = await supabase
    .from('movimentos_stock')
    .select('*, produtos(nome, unidade)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    // + filtros aplicados
  return { data: data.map(toMovement), count: count ?? 0 }
}
```

### Hook: `useMovimentosPaginados()`
Novo hook em `useMovimentos.ts`:
- `page` state com `setPage`
- Reset automático para página 0 quando `filtros` mudam
- Expõe `count`, `totalPages`, `loading`

### UI: HistoryPage
- Barra de paginação com "Anterior" / "Seguinte" + "Página X de Y · 50 por página"
- Só aparece quando `totalPages > 1`
- Subtitle mostra `N movimentos · página X de Y`

**Critérios cumpridos:**
- [x] Máximo 50 movimentos por query
- [x] Filtros resetam para página 1 automaticamente
- [x] Build sem erros TypeScript
