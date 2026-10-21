-- Obras: serializar linhas com a submissão e impedir escrita por autor com MFA em falta.
-- Aplicar depois de 20261008090000_eventos_recuperacao.sql; não altera dados nem assinaturas das RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public._trg_auto_linha_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rpc boolean := COALESCE(current_setting('app.auto_rpc', true), '') = 'on'
                   AND current_user NOT IN ('authenticated', 'anon', 'service' || '_role');
  v_api boolean := current_user IN ('authenticated', 'anon', 'service' || '_role');
  v_wf text;
  v_pais uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pais := ARRAY[NEW.auto_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_pais := ARRAY[OLD.auto_id];
  ELSE
    v_pais := ARRAY[OLD.auto_id, NEW.auto_id];
  END IF;
  

  -- A submissão bloqueia o pai antes de ler linhas. A guarda espera pelo mesmo
  -- lock antes de ler workflow; UUIDs ordenados evitam ciclos ao trocar de pai.
  PERFORM a.id FROM public.autos_medicao a
    WHERE a.id = ANY (v_pais)
    ORDER BY a.id
    FOR UPDATE;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = OLD.auto_id;
    -- Sem auto-pai: conserva a cascata privilegiada; pela API continua recusado.
    IF NOT FOUND AND v_api THEN
      RAISE EXCEPTION 'Auto não encontrado';
    END IF;
    IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
      RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = NEW.auto_id;
    IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
      RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_relatar_obra(p_obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.mfa_em_falta()
    AND (public.pode_medir_obras() OR public._autor_designado(p_obra_id))
$$;

REVOKE ALL ON FUNCTION public._trg_auto_linha_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pode_relatar_obra(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_relatar_obra(uuid) TO authenticated;

COMMIT;

-- ROLLBACK
-- Reabre a corrida e o bypass de MFA: preferir uma correção progressiva. Não apagar dados.
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public._trg_auto_linha_imutavel()
-- RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
-- DECLARE
--   v_rpc boolean := COALESCE(current_setting('app.auto_rpc', true), '') = 'on'
--                    AND current_user NOT IN ('authenticated', 'anon', 'service' || '_role');
--   v_api boolean := current_user IN ('authenticated', 'anon', 'service' || '_role');
--   v_wf text;
-- BEGIN
--   IF TG_OP IN ('UPDATE', 'DELETE') THEN
--     SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = OLD.auto_id;
--     IF NOT FOUND AND v_api THEN RAISE EXCEPTION 'Auto não encontrado'; END IF;
--     IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
--       RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
--     END IF;
--   END IF;
--   IF TG_OP IN ('INSERT', 'UPDATE') THEN
--     SELECT a.workflow INTO v_wf FROM public.autos_medicao a WHERE a.id = NEW.auto_id;
--     IF FOUND AND v_wf <> 'rascunho' AND NOT v_rpc THEN
--       RAISE EXCEPTION 'Este auto já foi submetido: as linhas só mudam pelo fluxo de aprovação';
--     END IF;
--   END IF;
--   IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
--   RETURN NEW;
-- END;
-- $$;
-- CREATE OR REPLACE FUNCTION public.pode_relatar_obra(p_obra_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$ SELECT public.pode_medir_obras() OR public._autor_designado(p_obra_id) $$;
-- REVOKE ALL ON FUNCTION public._trg_auto_linha_imutavel() FROM PUBLIC, anon, authenticated, service_role;
-- REVOKE ALL ON FUNCTION public.pode_relatar_obra(uuid) FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.pode_relatar_obra(uuid) TO authenticated;
-- COMMIT;
