# [P2 · MÉDIO] Sistema de notificações faz query a `produtos` separada do Dashboard

## Resolução — 2026-06-12

`useNotifications()` era chamado em `Header.tsx` (para `notifCount`) E em `NotificationPanel.tsx` — duas queries idênticas ao Supabase.

**Fix:**
- `Header.tsx`: chama `useNotifications()` uma vez, destrói `{ notifications, loading, count }` e passa `notifications` + `loading` como props para `NotificationPanel`
- `NotificationPanel.tsx`: Props `{ notifications, loading, onClose }` em vez de hook próprio
- Bónus descobertos: corrigido `displayName = email.split('@')[0]` → `nome` de `useRole()`; "Administrador" hardcoded → `ROLE_LABELS[role]` (mostra "Encarregado" para gestores)

**Critérios cumpridos:**
- [x] Apenas 1 query a `produtos` ao abrir o Header
- [x] Dados sincronizados (uma instância)

## Problema
O sistema de notificações de stock mínimo (`useNotifications` ou equivalente)
faz uma query independente a `produtos`:
```ts
// A cada render / polling:
supabase.from('produtos').select('*').lte('stock_atual', 'stock_minimo')
```

Enquanto o Dashboard já fez a mesma query há fracções de segundo.
**Duas queries quase idênticas em paralelo**, resultando em:
- 2x requests HTTP ao Supabase
- 2x parsing de JSON no browser
- Race condition potencial (dados ligeiramente dessincronizados)

## Localização
- `src/features/notifications/useNotifications.ts` (ou similar)
- `src/features/dashboard/useDashboard.ts` — dados já disponíveis aqui

## Solução

### Opção A — Derivar notificações dos dados do Dashboard
Se o Dashboard já tem a lista de produtos com stock, passar como prop:
```tsx
// DashboardPage.tsx
const { produtos, movimentosRecentes } = useDashboard();
const produtosAbaixoMinimo = produtos.filter(p => p.stock_atual <= p.stock_minimo);

// Passar para componente de notificações:
<StockAlertsBanner produtos={produtosAbaixoMinimo} />
```

### Opção B — React Query / SWR com cache partilhado
Se o projecto adoptar React Query (tarefa futura), queries com a mesma key
são deduplicadas automaticamente — zero config adicional.

### Opção C — Context de produtos global
Centralizar a lista de produtos activos num `ProdutosContext`:
```tsx
// ProdutosProvider.tsx
const [produtos, setProdutos] = useState<Produto[]>([]);

useEffect(() => {
  supabase.from('produtos').select('id, nome, stock_atual, stock_minimo, ativo')
    .eq('ativo', true)
    .then(({ data }) => setProdutos(data ?? []));
}, []);

// Ambos Dashboard e Notificações consomem do mesmo estado
```

A Opção A é a mais simples para o estado actual do projecto.

## Esforço estimado
⏱ 1h (Opção A — derivar de dados existentes)

## Critério de conclusão
- [ ] DevTools Network: apenas 1 query a `produtos` ao carregar o Dashboard
- [ ] Notificações de stock mostram os mesmos dados que os KPIs
- [ ] Sem race condition (dados sincronizados)
