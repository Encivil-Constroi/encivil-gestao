# [P2 · MÉDIO] MobileBottomNav mostra espaço vazio para Encarregado

## Resolução — 2026-06-12

**Problema real encontrado:** O item primário (`+`) verificava `!isAdmin` para esconder o botão,
deixando um `<div className="w-14" />` vazio no centro da nav para gestores.
Mas gestores têm permissão para registar movimentos (via `registar_movimento` RPC).

**Fix em `MobileBottomNav.tsx`:**
```tsx
const { isAdmin, isGestor } = useRole();
const canRegisterMovement = isAdmin || isGestor;

// Antes: if (!isAdmin) return <div className="w-14" />;
// Depois:
if (!canRegisterMovement) return <div key={item.path} className="w-14" />;
```

**Critérios cumpridos:**
- [x] Gestor vê o botão `+` centralizado e funcional
- [x] Utilizadores sem role não vêem o botão (espaço vazio mantém layout)
- [x] Admin continua com comportamento idêntico
