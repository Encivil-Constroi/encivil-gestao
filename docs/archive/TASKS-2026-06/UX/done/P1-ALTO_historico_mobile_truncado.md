# [P1 · ALTO] Histórico de movimentos — tabela truncada em mobile

## Resolução — já implementado em sessão anterior

O `HistoryPage.tsx` já tinha o padrão responsivo correcto implementado:

```tsx
{/* Mobile: cards simplificados */}
<div className="md:hidden divide-y divide-border">
  {movements.map(m => (
    <div key={m.id} className="p-4">
      <MovementTypeBadge /> + produto + data
      quantidade · stock · responsável · destino
    </div>
  ))}
</div>

{/* Desktop: tabela completa */}
<div className="hidden md:block overflow-x-auto">
  <table>...</table>
</div>
```

**Critérios cumpridos:**
- [x] Mobile (< 768px): cards legíveis sem scroll horizontal
- [x] Desktop (≥ 768px): tabela completa mantida
