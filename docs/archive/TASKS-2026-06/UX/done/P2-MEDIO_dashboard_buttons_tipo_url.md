# [P2 · MÉDIO] Botões de acção rápida no Dashboard — `<button>` → `<Link>`

## Resolução — 2026-06-12

Substituídos todos os `<button onClick={() => navigate(...)}>` por `<Link to="...">` em `DashboardPage.tsx`.

**Melhorias adicionais:**
1. Query params pré-preenchidos: `?tipo=saida` / `?tipo=entrada` — o `NewMovementPage` já os lê e pré-selecciona o tipo correcto
2. Botões mostrados para `isAdmin || isGestor` (antes eram só admin)
3. Cards de stock baixo: `<div onClick={() => navigate(...)}>` → `<Link to="/produtos/${id}">`
4. "Ver todo o histórico" e "Ver todos os produtos": `<button>` → `<Link>`
5. `useNavigate` removido completamente do componente

```tsx
<Link to="/novo-movimento?tipo=saida" className="...bg-destructive...">
  <ArrowUpCircle /> Registar Saída
</Link>
<Link to="/novo-movimento?tipo=entrada" className="...bg-success...">
  <ArrowDownCircle /> Registar Entrada
</Link>
```

**Critérios cumpridos:**
- [x] Ctrl+Click abre em nova aba
- [x] Hover mostra URL na barra de status do browser
- [x] Pré-selecciona o tipo correcto no formulário
- [x] Gestores também vêem os botões de acção rápida
