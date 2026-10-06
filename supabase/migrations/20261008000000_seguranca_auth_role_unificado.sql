-- Reforço de segurança 2026 — Tarefa 3: todas as decisões de papel passam por public.auth_role().
--
-- Porquê: o MFA (Tarefa 4, 20261008010000_seguranca_mfa.sql) passa a ser imposto dentro de
-- public.auth_role(). Uma policy ou função que leia profiles.role diretamente para decidir o que
-- o chamador pode fazer contornaria esse controlo. O comportamento para os utilizadores legítimos
-- fica igual: auth_role() devolve o mesmo papel (ou '' sem perfil, que nunca satisfaz uma condição).
--
-- Convertido (definições vigentes via pg_get_functiondef / pg_policies; só muda a verificação):
--   Policies
--     configuracoes_empresa.config_update_admin      (20260611000002_gestor_role.sql)
--     produtos.produtos_delete_admin                 (20260611000004_produto_crud.sql)
--     movimentos_stock.movimentos_insert_admin_gestor(20260611000004_produto_crud.sql)
--     audit_log.audit_log_select_admin               (20260622000001_fix_profiles_privilege_escalation.sql)
--   Funções
--     arquivar_subempreiteiro(uuid)                  (20260924010000_subempreiteiros_soft_delete.sql)
--     promover_role(uuid, role_utilizador)           (20260622000001_fix_profiles_privilege_escalation.sql)
--       só a verificação do chamador; a escrita do papel do alvo fica.
--
-- Não convertido (leem o papel dos utilizadores ALVO, não do chamador; o chamador já é verificado
-- por pode_gerir_obras() → auth_role()): obra_autores_lista, obra_definir_autores.
--
-- CREATE OR REPLACE mantém os GRANT/REVOKE existentes das funções.

-- ── Policies ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "config_update_admin" ON public.configuracoes_empresa;
CREATE POLICY "config_update_admin"
  ON public.configuracoes_empresa FOR UPDATE TO authenticated
  USING (public.auth_role() = 'admin');

DROP POLICY IF EXISTS "produtos_delete_admin" ON public.produtos;
CREATE POLICY "produtos_delete_admin"
  ON public.produtos FOR DELETE TO authenticated
  USING (public.auth_role() = 'admin');

DROP POLICY IF EXISTS "movimentos_insert_admin_gestor" ON public.movimentos_stock;
CREATE POLICY "movimentos_insert_admin_gestor"
  ON public.movimentos_stock FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.auth_role() = 'admin');

-- ── Funções ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.arquivar_subempreiteiro(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Apenas administradores e gestores podem arquivar contratações.';
  END IF;

  UPDATE subempreiteiros SET ativo = false WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratação não encontrada.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promover_role(p_user_id uuid, p_novo_role role_utilizador)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile     public.profiles%ROWTYPE;
BEGIN
  IF public.auth_role() <> 'admin' THEN
    RAISE EXCEPTION 'Autorização negada: apenas administradores podem alterar roles.';
  END IF;

  IF p_user_id = auth.uid() AND p_novo_role != 'admin' THEN
    RAISE EXCEPTION 'Não é permitido despromover a própria conta (evita lockout acidental).';
  END IF;

  UPDATE public.profiles
  SET role = p_novo_role
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado.';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'role_change', p_user_id, jsonb_build_object('novo_role', p_novo_role));

  RETURN v_profile;
END;
$function$;

-- ROLLBACK
-- Repor as definições anteriores: correr de novo os blocos originais das migrations
--   20260611000002_gestor_role.sql                         (policy config_update_admin)
--   20260611000004_produto_crud.sql                        (policies produtos_delete_admin, movimentos_insert_admin_gestor)
--   20260622000001_fix_profiles_privilege_escalation.sql   (policy audit_log_select_admin, função promover_role)
--   20260924010000_subempreiteiros_soft_delete.sql         (função arquivar_subempreiteiro)
-- Ou, diretamente:
-- DROP POLICY IF EXISTS "config_update_admin" ON public.configuracoes_empresa;
-- CREATE POLICY "config_update_admin" ON public.configuracoes_empresa FOR UPDATE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
-- DROP POLICY IF EXISTS "produtos_delete_admin" ON public.produtos;
-- CREATE POLICY "produtos_delete_admin" ON public.produtos FOR DELETE TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
-- DROP POLICY IF EXISTS "movimentos_insert_admin_gestor" ON public.movimentos_stock;
-- CREATE POLICY "movimentos_insert_admin_gestor" ON public.movimentos_stock FOR INSERT TO authenticated
--   WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gestor')));
-- DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
-- CREATE POLICY "audit_log_select_admin" ON public.audit_log FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
-- (funções: recriar com os corpos das migrations acima, onde o chamador é lido de public.profiles)
