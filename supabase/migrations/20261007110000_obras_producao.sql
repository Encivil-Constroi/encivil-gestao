-- Guardas aditivas: não reescrevem autoria ou vínculos históricos.
-- Preflight (só leitura) antes da aplicação: guardar o resultado e reparar os
-- arquivos faltantes antes de voltar a verificar/aprovar/pagar autos antigos.
-- SELECT 'evidencia' AS origem, e.id, 'obras' AS bucket, e.path
--   FROM public.auto_evidencias e
--  WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'obras' AND o.name = e.path)
-- UNION ALL
-- SELECT 'documento', d.id, 'obras-contratos', d.path FROM public.sub_documentos d
--  WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'obras-contratos' AND o.name = d.path)
-- UNION ALL
-- SELECT 'fatura', a.id, 'obras-contratos', a.fatura_path FROM public.autos_medicao a
--  WHERE a.fatura_path IS NOT NULL AND NOT EXISTS
--    (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'obras-contratos' AND o.name = a.fatura_path);
-- Para fotos gerais, executar também (só leitura):
-- WITH fotos AS (
--   SELECT 'galeria' AS origem, f.id, f.path FROM public.obra_fotos f
--   UNION ALL SELECT 'afericao', a.id, f ->> 'path' FROM public.obra_afericoes a CROSS JOIN LATERAL jsonb_array_elements(a.fotos) f
--   UNION ALL SELECT 'relatorio', r.id, f ->> 'path' FROM public.obra_relatorios_diarios r CROSS JOIN LATERAL jsonb_array_elements(r.fotos) f
--   UNION ALL SELECT 'ocorrencia', s.id, f ->> 'path' FROM public.sub_ocorrencias s CROSS JOIN LATERAL jsonb_array_elements(s.fotos) f
--   UNION ALL SELECT 'auto_fotos', a.id, f ->> 'path' FROM public.autos_medicao a CROSS JOIN LATERAL jsonb_array_elements(a.fotos) f
-- ) SELECT origem, id, 'obras' AS bucket, path FROM fotos f WHERE NOT EXISTS
--   (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'obras' AND o.name = f.path);
-- A presença do objeto não certifica hash/GPS enviados pelo browser nem bytes
-- no backend físico. Validar também a API de Storage em staging (upsert/move).

BEGIN;

CREATE OR REPLACE FUNCTION public._obras_exigir_objeto(p_bucket text, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SHARE (não KEY SHARE) impede também alteração de metadados/conteúdo via
  -- UPDATE enquanto se cria o vínculo. O lock dura até ao fim da transação.
  PERFORM o.id FROM storage.objects o
   WHERE o.bucket_id = p_bucket AND o.name = p_path FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficheiro não encontrado no armazenamento da obra (%)', p_bucket;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._trg_obras_autoria_auto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- auth.uid persiste em chamadas SECURITY DEFINER; current_user não identifica o autor.
    IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A autoria do auto não pode ser alterada';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_obras_autoria_auto BEFORE INSERT OR UPDATE ON public.autos_medicao
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_autoria_auto();

CREATE OR REPLACE FUNCTION public._trg_obras_vinculo_objeto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Updates de legenda/datas de um vínculo legado não exigem reparar o arquivo.
  IF TG_OP = 'INSERT' THEN
    PERFORM public._obras_exigir_objeto(TG_ARGV[0], NEW.path);
  ELSIF NEW.path IS DISTINCT FROM OLD.path THEN
    PERFORM public._obras_exigir_objeto(TG_ARGV[0], NEW.path);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_obras_evidencia_objeto BEFORE INSERT OR UPDATE ON public.auto_evidencias
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_vinculo_objeto('obras');
CREATE TRIGGER trg_obras_documento_objeto BEFORE INSERT OR UPDATE ON public.sub_documentos
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_vinculo_objeto('obras-contratos');
CREATE TRIGGER trg_obras_galeria_objeto BEFORE INSERT OR UPDATE ON public.obra_fotos
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_vinculo_objeto('obras');

CREATE OR REPLACE FUNCTION public._trg_obras_fotos_objetos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anteriores jsonb := '[]'::jsonb;
  v_todas boolean := false;
  v_path text;
BEGIN
  -- As constraints/RPCs existentes conservam os erros de forma do array.
  IF jsonb_typeof(NEW.fotos) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_anteriores := OLD.fotos;
    IF TG_TABLE_NAME = 'obra_relatorios_diarios' THEN
      v_todas := NEW.estado = 'submetido' AND NEW.estado IS DISTINCT FROM OLD.estado;
    END IF;
  END IF;
  FOR v_path IN SELECT DISTINCT f ->> 'path' FROM jsonb_array_elements(NEW.fotos) f ORDER BY 1 LOOP
    -- Alterar legenda ou outros campos de legado não obriga a reparar objetos;
    -- uma nova submissão volta a exigir todos os arquivos do relatório.
    IF v_todas OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_anteriores) f
                             WHERE (f ->> 'path') IS NOT DISTINCT FROM v_path) THEN
      PERFORM public._obras_exigir_objeto('obras', v_path);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_obras_fotos_objetos BEFORE INSERT OR UPDATE ON public.obra_afericoes
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_fotos_objetos();
CREATE TRIGGER trg_obras_fotos_objetos BEFORE INSERT OR UPDATE ON public.obra_relatorios_diarios
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_fotos_objetos();
CREATE TRIGGER trg_obras_fotos_objetos BEFORE INSERT OR UPDATE ON public.sub_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_fotos_objetos();
CREATE TRIGGER trg_obras_fotos_objetos BEFORE INSERT OR UPDATE ON public.autos_medicao
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_fotos_objetos();

CREATE OR REPLACE FUNCTION public._trg_obras_auto_objetos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
  v_cfg public.subs_config%ROWTYPE;
  v_aprovar boolean := false;
  v_pagar boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fatura_path IS NOT NULL THEN
      PERFORM public._obras_exigir_objeto('obras-contratos', NEW.fatura_path);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.fatura_path IS NOT NULL AND NEW.fatura_path IS DISTINCT FROM OLD.fatura_path THEN
    PERFORM public._obras_exigir_objeto('obras-contratos', NEW.fatura_path);
  END IF;
  v_aprovar := NEW.workflow = 'validado' AND NEW.workflow IS DISTINCT FROM OLD.workflow;
  v_pagar := NEW.estado_pagamento = 'pago' AND NEW.estado_pagamento IS DISTINCT FROM OLD.estado_pagamento;
  IF (NEW.workflow = 'verificado' AND NEW.workflow IS DISTINCT FROM OLD.workflow)
     OR v_aprovar OR v_pagar THEN
    FOR v_path IN SELECT e.path FROM public.auto_evidencias e WHERE e.auto_id = NEW.id AND e.valida ORDER BY e.path LOOP
      PERFORM public._obras_exigir_objeto('obras', v_path);
    END LOOP;
  END IF;
  IF v_aprovar OR v_pagar THEN
    SELECT * INTO v_cfg FROM public._subs_cfg();
    IF v_pagar AND v_cfg.exigir_fatura_para_pagar THEN
      PERFORM public._obras_exigir_objeto('obras-contratos', NEW.fatura_path);
    END IF;
    IF v_cfg.bloquear_pagamento_sem_docs THEN
      -- Só o documento atual de cada tipo obrigatório conta no workflow;
      -- não bloqueia por versões antigas substituídas ou documentos opcionais.
      FOR v_path IN
        SELECT d.path FROM public._sub_docs_estado(NEW.subempreiteiro_id) s
          JOIN public.sub_documentos d ON d.id = s.doc_id
         WHERE s.obrigatorio AND s.estado IN ('ok', 'a_expirar') ORDER BY d.path
      LOOP
        PERFORM public._obras_exigir_objeto('obras-contratos', v_path);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_obras_auto_objetos BEFORE INSERT OR UPDATE ON public.autos_medicao
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_auto_objetos();

CREATE OR REPLACE FUNCTION public._trg_obras_proteger_objeto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DELETE/UPDATE já detêm o lock da linha. Uma vinculação concorrente segura
  -- FOR SHARE e impede a operação de passar antes de o vínculo estar visível.
  IF (OLD.bucket_id = 'obras' AND (
       EXISTS (SELECT 1 FROM public.auto_evidencias e WHERE e.path = OLD.name)
       OR EXISTS (SELECT 1 FROM public.obra_fotos f WHERE f.path = OLD.name)
       OR EXISTS (SELECT 1 FROM public.obra_afericoes a WHERE a.fotos @> jsonb_build_array(jsonb_build_object('path', OLD.name)))
       OR EXISTS (SELECT 1 FROM public.obra_relatorios_diarios r WHERE r.fotos @> jsonb_build_array(jsonb_build_object('path', OLD.name)))
       OR EXISTS (SELECT 1 FROM public.sub_ocorrencias s WHERE s.fotos @> jsonb_build_array(jsonb_build_object('path', OLD.name)))
       OR EXISTS (SELECT 1 FROM public.autos_medicao a WHERE a.fotos @> jsonb_build_array(jsonb_build_object('path', OLD.name)))))
     OR (OLD.bucket_id = 'obras-contratos' AND (
       EXISTS (SELECT 1 FROM public.sub_documentos d WHERE d.path = OLD.name)
       OR EXISTS (SELECT 1 FROM public.autos_medicao a WHERE a.fatura_path = OLD.name))) THEN
    RAISE EXCEPTION 'Este ficheiro está vinculado a um registo da obra e não pode ser alterado ou apagado';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_obras_proteger_objeto BEFORE DELETE OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public._trg_obras_proteger_objeto();

CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id uuid,
  p_data_ini date DEFAULT '2000-01-01'::date,
  p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_j json;
  v jsonb;
  v_glos numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Sem permissão para consultar custos';
  END IF;
  v_j := public._custos_consolidados_por_obra_impl(p_obra_id, p_data_ini, p_data_fim);
  SELECT COALESCE(sum(am.valor_glosado), 0) INTO v_glos
    FROM public.autos_medicao am
    JOIN public.subempreiteiros s ON s.id = am.subempreiteiro_id
   WHERE s.obra_id = p_obra_id AND am.estado = 'validado' AND am.data_medicao BETWEEN p_data_ini AND p_data_fim;
  IF v_glos = 0 THEN RETURN v_j; END IF;
  v := v_j::jsonb;
  v := jsonb_set(v, '{subempreiteiros}', to_jsonb((v ->> 'subempreiteiros')::numeric - v_glos));
  v := jsonb_set(v, '{total}', to_jsonb((v ->> 'total')::numeric - v_glos));
  RETURN v::json;
END;
$$;

REVOKE ALL ON FUNCTION public._obras_exigir_objeto(text, text), public._trg_obras_autoria_auto(), public._trg_obras_vinculo_objeto(), public._trg_obras_auto_objetos(), public._trg_obras_proteger_objeto(), public._trg_obras_fotos_objetos() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) TO authenticated;

COMMIT;
