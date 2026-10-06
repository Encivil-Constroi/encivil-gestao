-- =============================================================
-- ENCIVIL — MFA (TOTP) obrigatório para admin e gestor
--
-- Imposto em auth_role(): todas as policies e RPCs decidem por ela
-- (garantido pela migration 20261008000000 e pelo teste seguranca-papeis).
-- Admin/gestor com sessão sem 2.º fator (aal1) passam a valer 'leitura'.
-- O interruptor nasce DESLIGADO: o admin liga-o depois de os gestores
-- registarem a app autenticadora — ninguém fica trancado fora.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- =============================================================

CREATE TABLE IF NOT EXISTS public.seguranca_config (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  mfa_obrigatorio boolean NOT NULL DEFAULT false,
  atualizado_por  uuid REFERENCES auth.users(id),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.seguranca_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.seguranca_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seguranca_config_select ON public.seguranca_config;
CREATE POLICY seguranca_config_select ON public.seguranca_config
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.seguranca_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seguranca_config TO authenticated;

CREATE OR REPLACE FUNCTION public.sessao_aal()
RETURNS text LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

CREATE OR REPLACE FUNCTION public.papel_real()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT role::text FROM public.profiles WHERE id = auth.uid()), '') $$;

CREATE OR REPLACE FUNCTION public.mfa_em_falta()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    public.papel_real() IN ('admin', 'gestor')
    AND COALESCE((SELECT mfa_obrigatorio FROM public.seguranca_config WHERE id), false)
    AND public.sessao_aal() <> 'aal2',
  false)
$$;

-- Nunca NULL: verificações `auth_role() NOT IN (...)` deixariam passar um NULL.
-- CREATE OR REPLACE mantém os GRANT/REVOKE que auth_role já tinha.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(CASE WHEN public.mfa_em_falta() THEN 'leitura' ELSE public.papel_real() END, '') $$;

CREATE OR REPLACE FUNCTION public.definir_mfa_obrigatorio(p_ativo boolean)
RETURNS public.seguranca_config
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.seguranca_config;
BEGIN
  IF public.sessao_aal() <> 'aal2' THEN
    RAISE EXCEPTION 'Esta ação exige verificação em dois passos. Volta a entrar.' USING ERRCODE = '42501';
  END IF;
  IF public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar esta definição.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.seguranca_config
     SET mfa_obrigatorio = p_ativo, atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id RETURNING * INTO v_row;
  INSERT INTO public.audit_log (actor_id, action, details)
  VALUES (auth.uid(), 'mfa_obrigatorio', jsonb_build_object('ativo', p_ativo));
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.sessao_aal(), public.papel_real(), public.mfa_em_falta(),
  public.definir_mfa_obrigatorio(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sessao_aal(), public.papel_real(), public.mfa_em_falta(),
  public.definir_mfa_obrigatorio(boolean) TO authenticated;

-- ROLLBACK
-- CREATE OR REPLACE FUNCTION public.auth_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$ SELECT COALESCE((SELECT role::text FROM public.profiles WHERE id = auth.uid()), '') $$;
-- DROP FUNCTION IF EXISTS public.definir_mfa_obrigatorio(boolean);
-- DROP FUNCTION IF EXISTS public.mfa_em_falta();
-- DROP FUNCTION IF EXISTS public.papel_real();
-- DROP FUNCTION IF EXISTS public.sessao_aal();
-- DROP TABLE IF EXISTS public.seguranca_config;
