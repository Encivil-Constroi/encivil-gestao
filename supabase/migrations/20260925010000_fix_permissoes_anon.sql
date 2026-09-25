-- ================================================================
-- ENCIVIL — SEGURANÇA: verificações de papel ignoradas sem login
--
-- Sem sessão, auth_role() devolvia NULL. Em plpgsql:
--   IF NOT public.pode_escrever('combustivel')  →  IF NOT NULL  →  não dispara
--   IF public.auth_role() NOT IN (...)          →  IF NULL      →  não dispara
-- Qualquer pessoa com a chave pública podia autorizar abastecimentos
-- (e ligar a bomba do Polo 2), aprová-los, ou marcar autos como pagos.
--
-- Correção na raiz: auth_role() nunca devolve NULL e pode_escrever()
-- devolve sempre true/false. Segunda barreira: anon deixa de poder
-- executar as RPCs que só fazem sentido para utilizadores autenticados
-- (por omissão o Postgres dá EXECUTE a PUBLIC, o GRANT a authenticated
-- não restringia nada).
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role::text FROM public.profiles WHERE id = auth.uid()), '')
$$;

CREATE OR REPLACE FUNCTION public.pode_escrever(modulo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(CASE modulo
    WHEN 'armazem'        THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'ferramentas'    THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'combustivel'    THEN public.auth_role() IN ('admin', 'gestor', 'armazem')
    WHEN 'obras'          THEN public.auth_role() IN ('admin', 'gestor')
    WHEN 'subempreitadas' THEN public.auth_role() IN ('admin', 'gestor', 'medicoes')
    ELSE false
  END, false)
$$;

REVOKE EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rejeitar_abastecimento(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.aprovar_abastecimento_pendente(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_auto_pago(uuid, text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_auto_em_atraso(uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.arquivar_subempreiteiro(uuid)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_abastecimento(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_abastecimento_pendente(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_auto_pago(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_auto_em_atraso(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_subempreiteiro(uuid)         TO authenticated;
