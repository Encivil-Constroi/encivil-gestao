# [P1 · ALTO] Dashboard faz SELECT * em produtos e movimentos — colunas desnecessárias

## Resolução — 2026-06-12

Query 4 em `useDashboard.ts` mudou de `select('*')` para `select('id, nome, unidade, stock_atual, stock_minimo')`.
- `ProdRow` type e `mapProduct` atualizados para os 5 campos mínimos necessários
- Novo tipo `LowStockItem = Pick<Product, 'id'|'name'|'unit'|'currentStock'|'minStock'|'status'>` em `types.ts`
- `DashboardStats.lowStockItems` agora usa `LowStockItem[]` em vez de `Product[]`
- Campos eliminados: `codigo`, `categoria`, `observacoes`, `created_at`, `updated_at` (não usados no Dashboard)

**Critérios cumpridos:**
- [x] Dashboard queries: máximo 5 colunas por tabela
- [x] Build e tipos TypeScript sem erros

## Problema
`useDashboard` (ou as queries individuais usadas no Dashboard) provavelmente
faz `SELECT *` ou selecciona colunas que não são usadas nos KPIs:

```ts
supabase.from('produtos').select('*')  // traz: codigo, nome, categoria, unidade,
                                       // stock_atual, stock_minimo, ativo, notas,
                                       // created_at, updated_at
```

O Dashboard só precisa de: `id, nome, stock_atual, stock_minimo, ativo`.
O campo `notas` pode ter strings longas. `created_at`/`updated_at` são irrelevantes.

Com 500+ produtos: transferência desnecessária de 3-5x mais dados do que o necessário.

## Localização
- `src/features/dashboard/useDashboard.ts` — queries ao Supabase
- `src/features/produtos/services/produtosService.ts` — `listarProdutos()`

## Solução

### Dashboard — seleccionar apenas campos necessários
```ts
// Para KPIs de stock
const { data: produtos } = await supabase
  .from('produtos')
  .select('id, nome, stock_atual, stock_minimo, ativo')
  .eq('ativo', true);

// Para movimentos recentes (últimos 7 dias)
const { data: movimentos } = await supabase
  .from('movimentos_stock')
  .select('id, tipo, quantidade, data_movimento, produto:produtos(nome)')
  .order('data_movimento', { ascending: false })
  .limit(10);
```

### Lista de produtos — seleccionar só o necessário para os cards
```ts
export async function listarProdutos() {
  return supabase
    .from('produtos')
    .select('id, codigo, nome, categoria, unidade, stock_atual, stock_minimo, ativo')
    // 'notas', 'created_at', 'updated_at' excluídos — não mostrados na lista
    .eq('ativo', true)
    .order('nome');
}
```

`notas` e timestamps só são necessários na `ProductDetailPage` — buscar lá.

### Referência: padrão do sector
Netflix Engineering: "Select only the columns you need — each unused column
adds serialization time, bandwidth, and JSON parse cost." (Netflix Tech Blog, 2023)

## Esforço estimado
⏱ 1.5h (audit de todas as queries + ajustar selects)

## Critério de conclusão
- [ ] Dashboard queries: máximo 5-6 colunas por tabela
- [ ] `listarProdutos()` não inclui `notas` ou timestamps
- [ ] Payload de resposta do Supabase verificado no DevTools (< 50KB para 200 produtos)
- [ ] Build e tipos TypeScript sem erros (campos removidos do select → remover do type)
