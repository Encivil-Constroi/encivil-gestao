-- =============================================================
-- ENCIVIL — Quem tem MFA ativo, para a gestão de utilizadores
-- A listagem da Admin API do GoTrue (GET /admin/users) não devolve `factors`
-- (só o GET de um utilizador o faz): sem isto o selo "MFA", a contagem do
-- interruptor e o "Remover MFA" tratavam toda a gente como sem MFA.
-- Só o papel de serviço (Edge Function admin-utilizadores) a executa.
-- APLICAR: SQL Editor do Supabase Dashboard (depois de 20261008060000)
-- =============================================================

CREATE OR REPLACE FUNCTION public.utilizadores_com_mfa()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT f.user_id FROM auth.mfa_factors f WHERE f.status::text = 'verified'
$$;
REVOKE ALL ON FUNCTION public.utilizadores_com_mfa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.utilizadores_com_mfa() TO service_role;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.utilizadores_com_mfa();
