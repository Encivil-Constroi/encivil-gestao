# [P1 · MÉDIO] RPC `registar_movimento` sem verificação de role interna

## Problema
`registar_movimento()` usava `SECURITY DEFINER` sem verificar o role do chamador.
Qualquer utilizador autenticado sem role podia chamar a RPC directamente via HTTP.

## Resolução — 2026-06-12

**Migration criada:** `supabase/migrations/20260612000002_secure_registar_movimento.sql`

```sql
-- Verificação no início da função (antes de qualquer lógica de negócio)
SELECT role INTO v_user_role
FROM public.profiles
WHERE id = auth.uid();

IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'gestor') THEN
  RAISE EXCEPTION 'Autorização negada: role "%" não pode registar movimentos.',
    COALESCE(v_user_role, 'sem role');
END IF;
```

Adicionalmente:
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`
  — garante que apenas utilizadores com JWT válido chegam sequer à função.

**Acção manual necessária:** Correr a migration no Supabase Dashboard → SQL Editor.

**Critérios cumpridos:**
- [x] Utilizador sem role recebe EXCEPTION clara
- [x] Admin e gestor continuam a funcionar normalmente
- [x] REVOKE/GRANT correcto na função
- [x] Lógica de negócio (stock, movimentos) inalterada
