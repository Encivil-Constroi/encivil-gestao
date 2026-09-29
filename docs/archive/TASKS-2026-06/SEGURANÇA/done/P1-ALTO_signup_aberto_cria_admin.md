# [P1 · ALTO] Signup público cria administradores por defeito

## Problema
`handle_new_user()` inseria `role = 'admin'` para qualquer utilizador criado via Supabase Auth.

## Resolução — 2026-06-12

**Migration criada:** `supabase/migrations/20260612000001_default_role_gestor.sql`

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    'gestor'   -- mínimo privilégio — promover para 'admin' manualmente
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Acção manual necessária:** Correr a migration no Supabase Dashboard → SQL Editor.

**Critérios cumpridos:**
- [x] Migration documentada e versionada
- [x] Role padrão alterado para `'gestor'` (mínimo privilégio)
- [x] Admins existentes não são afectados
- [x] Novos utilizadores devem ser promovidos manualmente para `'admin'`
