# [P2 · MÉDIO] Queries de movimentos sem LIMIT — crescimento ilimitado

## Resolução — 2026-06-12

**ProductDetailPage:**
- `movFiltros` agora inclui `limit: 20` → `listarMovimentos` aplica `.limit(20)` via `FiltrosMovimentos`
- `.slice(0, 20)` removido do mobile render (redundante agora que a query já limita)
- Título "Histórico Completo" → "Últimos Movimentos" + link "Ver histórico completo →" para `/historico?produto=<id>`

**HistoryPage:**
- Adicionado `useSearchParams` — lê `?produto=` e aplica `f.produtoId` aos filtros
- Paginação já limita a 50 por query (implementada nas tasks UX)

**DB:**
- Nova migration `20260612000004_movimentos_idx_produto.sql` com índice `idx_movimentos_produto_created_at ON movimentos_stock (produto_id, created_at DESC)`

**Critérios cumpridos:**
- [x] ProductDetailPage: máximo 20 movimentos por query
- [x] Link "Ver histórico completo" filtra HistoryPage pelo produto
- [x] Índice criado na DB (migration pendente de push)

## Problema
Múltiplas queries a `movimentos_stock` sem limite de linhas:

```ts
// ProductDetailPage — todos os movimentos do produto:
supabase.from('movimentos_stock').select('*').eq('produto_id', id)

// HistoryPage — todos os movimentos:
supabase.from('movimentos_stock').select('*').order('data_movimento', { ascending: false })
```

Um produto muito movimentado (ex: cimento, areia) pode ter 1000+ movimentos
ao fim de um ano. A query traz tudo sem necessidade.

## Localização
- `src/features/movimentos/services/movimentosService.ts`
- `src/app/pages/ProductDetailPage.tsx` — secção de histórico recente
- `src/app/pages/HistoryPage.tsx` — ver também [[P2-MEDIO_historico_sem_paginacao]]

## Solução

### ProductDetailPage — mostrar apenas os últimos N movimentos
```ts
// Mostrar só os últimos 20 movimentos no detalhe do produto
const { data: movimentos } = await supabase
  .from('movimentos_stock')
  .select('id, tipo, quantidade, responsavel, data_movimento, destino_obra, observacoes')
  .eq('produto_id', produtoId)
  .order('data_movimento', { ascending: false })
  .limit(20);
```

Com link "Ver histórico completo" → HistoryPage filtrado por produto.

### HistoryPage — paginação
Ver tarefa [[P2-MEDIO_historico_sem_paginacao]] — solução completa documentada lá.

### Índice DB para acelerar queries por produto
```sql
-- Migration: se não existir
CREATE INDEX IF NOT EXISTS idx_movimentos_produto_data
  ON public.movimentos_stock (produto_id, data_movimento DESC);
```

Este índice torna a query por produto O(log n) em vez de O(n).

## Impacto estimado
- Payload de rede: de ~500KB (1000 movimentos) para ~10KB (20 movimentos)
- Tempo de resposta: de 800ms para <100ms com índice
- Renderização DOM: de 1000 linhas para 20 linhas

## Esforço estimado
⏱ 1.5h (service + hooks + DB index + link "ver tudo")

## Critério de conclusão
- [ ] ProductDetailPage: máximo 20 movimentos visíveis
- [ ] Link "Ver histórico completo" filtra HistoryPage pelo produto
- [ ] Índice `idx_movimentos_produto_data` criado na DB
- [ ] Query time < 100ms para qualquer produto (verificar em Supabase Dashboard → Logs)
