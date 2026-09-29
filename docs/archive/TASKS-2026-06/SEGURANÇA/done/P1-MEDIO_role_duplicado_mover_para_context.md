# [P1 · MÉDIO] Role carregado 5-6x por navegação — movido para AuthContext

## Problema
`useRole()` fazia SELECT a `profiles` em cada componente que o usava.
Cada navegação disparava 5-6 queries HTTP desnecessárias ao Supabase.

## Resolução — 2026-06-12

### `AuthContext.tsx` — profile centralizado
```tsx
interface Profile { role: RoleUtilizador; nome: string }

// Função auxiliar (1 query por sessão):
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles').select('role, nome').eq('id', userId).single()
  return data ?? null
}

// No useEffect — carrega profile junto com a sessão inicial:
supabase.auth.getSession().then(async ({ data: { session } }) => {
  setSession(session)
  if (session?.user) {
    const p = await fetchProfile(session.user.id)
    setProfile(p)
  }
  setLoading(false)
})

// onAuthStateChange — actualiza em SIGNED_IN / limpa em SIGNED_OUT
```

**`loading` agora espera** que session E profile estejam resolvidos.
O `AuthGuard` mostra spinner até ambos estarem prontos → sem flash de UI.

### `useRole.ts` — zero queries
```ts
export function useRole() {
  const { profile, loading } = useAuth()
  return {
    role:     profile?.role ?? null,
    loading,
    isAdmin:  profile?.role === 'admin',
    isGestor: profile?.role === 'gestor',
    nome:     profile?.nome ?? '',
  }
}
```

### `NewMovementPage.tsx` — usa `nome` em vez de email
```tsx
const { nome } = useRole()
// formData: responsible: nome
// useEffect: sincroniza quando nome chega (caso transiente)
```

**Critérios cumpridos:**
- [x] 0 queries extras a `profiles` após login (verificável em DevTools Network)
- [x] `nome` disponível em `useRole()` — campo Responsável pré-preenchido correctamente
- [x] Role reflecte mudanças após re-login (SIGNED_IN event actualiza profile)
- [x] Build sem erros TypeScript
