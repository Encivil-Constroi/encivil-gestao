# [P1 · ALTO] AuthGuard só verifica autenticação — rotas admin acessíveis por gestores

## Problema
`AuthGuard.tsx` verificava apenas `session != null`. Qualquer gestor podia
aceder a `/configuracoes` por URL directa e ver o formulário completo.

## Resolução — 2026-06-12

### 1. `RoleGuard.tsx` criado
`src/features/auth/RoleGuard.tsx` — componente que verifica role antes de renderizar:

```tsx
export function RoleGuard({ require: requiredRole, children }: Props) {
  const { role, loading } = useRole()
  if (loading) return null
  if (requiredRole === 'admin' && role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
```

### 2. `/configuracoes` protegida em `routes.tsx`
```tsx
{ path: 'configuracoes', element: (
  <Suspense fallback={<PageLoader />}>
    <RoleGuard require="admin">
      <SettingsPage />
    </RoleGuard>
  </Suspense>
)},
```

### 3. `SettingsPage.tsx` — defesa em profundidade
- Banner de aviso amarelo visível para não-admins
- `<fieldset disabled={!isAdmin}>` desactiva todos os inputs
- Botão "Guardar" com `disabled={!isAdmin}` + `cursor-not-allowed`

**Critérios cumpridos:**
- [x] Gestor que navega para `/configuracoes` é redirecionado para `/`
- [x] Admin acede normalmente
- [x] Build sem erros TypeScript
- [x] Defesa em profundidade no componente (belt-and-suspenders)
