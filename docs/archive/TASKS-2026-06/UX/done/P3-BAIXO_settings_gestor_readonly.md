# [P3 · BAIXO] SettingsPage mostra formulário editável para Encarregado

## Resolução — resolvido pelas tasks de SEGURANÇA (2026-06-12)

Resolvido como parte do `RoleGuard` + defesa em profundidade no `SettingsPage`.

1. `RoleGuard require="admin"` em `routes.tsx` — redireciona gestores para `/` antes de chegar à página
2. No `SettingsPage` (belt-and-suspenders):
   - Banner amber de aviso para `!isAdmin`
   - `<fieldset disabled={!isAdmin}>` desactiva todos os inputs
   - Botão submit `disabled={!isAdmin}` com `cursor-not-allowed`

**Critérios cumpridos:**
- [x] Gestor que navega para `/configuracoes` é redirecionado para `/`
- [x] Se chegar (edge case), vê banner + formulário desactivado
