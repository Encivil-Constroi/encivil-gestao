# [P2 · MÉDIO] Código de produto gerado com `Date.now()` — colisões possíveis

## Problema
`AddProductModal` usava `formData.code || \`PROD${Date.now()}\`` como fallback.
Colisões possíveis em utilizadores simultâneos.

## Resolução — 2026-06-12

### Frontend — fallback removido
```tsx
// Antes:
code: formData.code || `PROD${Date.now()}`,

// Depois (campo é required — fallback era código morto):
code: formData.code,
```

### Frontend — sugestão automática via RPC
```tsx
useEffect(() => {
  supabase.rpc('gerar_codigo_produto').then(({ data }) => {
    if (data) setFormData(prev => ({ ...prev, code: prev.code || data }));
  });
}, []);
```

O modal sugere `P1001`, `P1002`, etc. ao abrir. O utilizador pode substituir
por um código semântico (ex: `CIM001`) antes de submeter.

### DB — `supabase/migrations/20260612000003_produto_codigo_seq.sql`
- `CREATE SEQUENCE produto_codigo_seq START 1001`
- RPC `gerar_codigo_produto()` → `'P' || LPAD(nextval(...)::TEXT, 4, '0')`
- Verificação e declaração explícita do UNIQUE constraint já existente

**Acção manual necessária:** Correr a migration no Supabase Dashboard → SQL Editor.

**Critérios cumpridos:**
- [x] Fallback `Date.now()` removido do código de produção
- [x] Modal sugere código único via sequência de DB
- [x] Campo continua editável (utilizador pode usar código semântico)
- [x] UNIQUE constraint documentado e verificado na migration
