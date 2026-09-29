# [P1 · ALTO] Role fetched 5-6x por navegação — queries duplicadas ao Supabase

## Problema
`useRole()` faz SELECT à tabela `profiles` em cada componente que o usa.
Cada navegação de página dispara 5-6 queries HTTP desnecessárias:

```
GET /rest/v1/profiles?id=eq.[uuid]  ← MobileBottomNav
GET /rest/v1/profiles?id=eq.[uuid]  ← Sidebar
GET /rest/v1/profiles?id=eq.[uuid]  ← DashboardPage
GET /rest/v1/profiles?id=eq.[uuid]  ← ProductsPage
GET /rest/v1/profiles?id=eq.[uuid]  ← ProductDetailPage
GET /rest/v1/profiles?id=eq.[uuid]  ← SettingsPage
```

Cada query adiciona ~80-150ms de latência no Supabase free tier.
Em mobile com 4G, pode ser 300-500ms por query.

## Localização
- `src/features/auth/useRole.ts` — faz fetch em cada instância
- `src/features/auth/AuthContext.tsx` — deveria centralizar o perfil

## Solução
Ver tarefa de segurança [[P1-MEDIO_role_duplicado_mover_para_context]].
A mesma solução resolve simultaneamente o problema de segurança e de performance.

**Impacto estimado**: de 5-6 queries/navegação para 1 query/sessão.

## Métricas de referência
- Network: 5-6 requests eliminados por navegação
- Tempo de renderização inicial: -300 a -800ms em mobile
- Bandwidth Supabase: redução de ~80% nas queries a `profiles`

## Esforço estimado
⏱ 2h (já documentado na task de segurança correspondente)

## Critério de conclusão
- [ ] DevTools Network tab: apenas 1 request a `profiles` após login
- [ ] Role disponível instantaneamente em todos os componentes (via context)
- [ ] Tempo de renderização do Dashboard: < 500ms em 4G simulado
