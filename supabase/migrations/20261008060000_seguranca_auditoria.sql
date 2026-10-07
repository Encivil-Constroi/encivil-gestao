-- =============================================================
-- ENCIVIL — Auditoria genérica das tabelas sensíveis + audit_log imutável
-- action = '<tabela>.<insert|update|delete>'; details = linha (insert/delete)
-- ou só as colunas alteradas {col: {antes, depois}} (update).
-- A tabela de faturas é public.faturas_fornecedor (não existe public.faturas).
-- APLICAR: SQL Editor do Supabase Dashboard
-- =============================================================

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS tabela   text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS operacao text;
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela ON public.audit_log (tabela, created_at DESC);

CREATE OR REPLACE FUNCTION public.auditar_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antes  jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_depois jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_det    jsonb;
  v_id     text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(k, jsonb_build_object('antes', v_antes -> k, 'depois', v_depois -> k))
      INTO v_det
      FROM jsonb_object_keys(v_depois) AS k
     WHERE (v_antes -> k) IS DISTINCT FROM (v_depois -> k)
       AND k NOT IN ('updated_at', 'atualizado_em');
    -- Só carimbos de data mudaram: não é uma alteração que valha registo
    IF v_det IS NULL THEN RETURN NEW; END IF;
  ELSE
    v_det := coalesce(v_depois, v_antes);
  END IF;
  v_id := coalesce(v_depois ->> 'id', v_antes ->> 'id');
  INSERT INTO public.audit_log (actor_id, action, target_id, details, tabela, operacao)
  VALUES (auth.uid(), TG_TABLE_NAME || '.' || lower(TG_OP),
          CASE WHEN v_id ~* '^[0-9a-f-]{36}$' THEN v_id::uuid END, v_det, TG_TABLE_NAME, TG_OP);
  RETURN coalesce(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.auditar_alteracao() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','colaboradores','faturas_fornecedor','comb_aprovadores','configuracoes_empresa','seguranca_config','obras'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS auditar_alteracao ON public.%I', t);
      EXECUTE format('CREATE TRIGGER auditar_alteracao AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.auditar_alteracao()', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._audit_log_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'O registo de auditoria é imutável.'; END $$;
REVOKE ALL ON FUNCTION public._audit_log_imutavel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_log_imutavel ON public.audit_log;
CREATE TRIGGER audit_log_imutavel BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public._audit_log_imutavel();
DROP TRIGGER IF EXISTS audit_log_sem_truncate ON public.audit_log;
CREATE TRIGGER audit_log_sem_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public._audit_log_imutavel();

-- ROLLBACK
-- DROP TRIGGER IF EXISTS audit_log_sem_truncate ON public.audit_log;
-- DROP TRIGGER IF EXISTS audit_log_imutavel ON public.audit_log;
-- DROP FUNCTION IF EXISTS public._audit_log_imutavel();
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.profiles;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.colaboradores;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.faturas_fornecedor;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.comb_aprovadores;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.configuracoes_empresa;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.seguranca_config;
-- DROP TRIGGER IF EXISTS auditar_alteracao ON public.obras;
-- DROP FUNCTION IF EXISTS public.auditar_alteracao();
-- DROP INDEX IF EXISTS public.idx_audit_log_tabela;
-- ALTER TABLE public.audit_log DROP COLUMN IF EXISTS operacao, DROP COLUMN IF EXISTS tabela;
