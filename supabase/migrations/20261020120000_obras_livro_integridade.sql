-- Obras: livro de obra e guias de transporte só escritos por quem gere obras; numeração de autos única;
-- linhas do auto substituídas numa só transação.
-- Aplicar depois de 20261008100000_obras_concorrencia_mfa.sql. Não altera dados.
BEGIN;

-- As secções 1 e 2 só correm se 20260917180000_fase8_livro_obra.sql já estiver aplicada
-- (em produção pode não estar); se não estiver, saltam com NOTICE e o resto aplica-se.

-- ── 1. Guias de transporte: leitura aberta, escrita por admin/gestor/armazem/medicoes ─
DO $guias$
BEGIN
  IF to_regclass('public.guias_transporte') IS NULL THEN
    RAISE NOTICE 'guias_transporte não existe (fase8 por aplicar): secção 1 ignorada';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "guias_all" ON public.guias_transporte;
  DROP POLICY IF EXISTS "guias_sel" ON public.guias_transporte;
  DROP POLICY IF EXISTS "guias_ins" ON public.guias_transporte;
  DROP POLICY IF EXISTS "guias_upd" ON public.guias_transporte;

  CREATE POLICY "guias_sel" ON public.guias_transporte
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "guias_ins" ON public.guias_transporte
    FOR INSERT TO authenticated WITH CHECK (public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes'));
  CREATE POLICY "guias_upd" ON public.guias_transporte
    FOR UPDATE TO authenticated
    USING (public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes'))
    WITH CHECK (public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes'));

END $guias$;

-- A RPC é SECURITY DEFINER (ignora a RLS): tem de aplicar a mesma regra. Criá-la sem a tabela é
-- seguro: o plpgsql só resolve guias_transporte quando a função é chamada.
CREATE OR REPLACE FUNCTION public.criar_guia_transporte(
  p_obra_id     uuid,
  p_motorista   uuid,
  p_origem      text,
  p_destino     text,
  p_data_carga  date,
  p_linhas      jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_numero text;
  v_seq    int;
  v_id     uuid;
BEGIN
  IF NOT COALESCE(public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes'), false) THEN
    RAISE EXCEPTION 'Sem permissão para emitir guias de transporte';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('guia_' || p_obra_id::text));

  SELECT COALESCE(MAX(CAST(split_part(numero, '-', 2) AS int)), 0) + 1
    INTO v_seq
    FROM guias_transporte
   WHERE obra_id = p_obra_id;

  v_numero := 'GT-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO guias_transporte (numero, obra_id, motorista_id, origem, destino, data_carga, linhas)
  VALUES (v_numero, p_obra_id, p_motorista, p_origem, p_destino, p_data_carga, p_linhas)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_guia_transporte(uuid, uuid, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_guia_transporte(uuid, uuid, text, text, date, jsonb) TO authenticated;

-- ── 2. Registos do livro de obra: só quem escreve em obras, e em nome próprio ─
DO $registos$
BEGIN
  IF to_regclass('public.registos_obra') IS NULL THEN
    RAISE NOTICE 'registos_obra não existe (fase8 por aplicar): secção 2 ignorada';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "reg_obra_ins" ON public.registos_obra;
  CREATE POLICY "reg_obra_ins" ON public.registos_obra
    FOR INSERT TO authenticated
    WITH CHECK (public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes') AND autor_id = auth.uid());

  DROP POLICY IF EXISTS "reg_obra_upd" ON public.registos_obra;
  CREATE POLICY "reg_obra_upd" ON public.registos_obra
    FOR UPDATE TO authenticated
    USING (public.auth_role() IN ('admin', 'gestor') OR (autor_id = auth.uid() AND public.auth_role() IN ('admin', 'gestor', 'armazem', 'medicoes')))
    WITH CHECK (public.auth_role() IN ('admin', 'gestor') OR (autor_id = auth.uid() AND public.auth_role() IN ('armazem', 'medicoes')));
END $registos$;

-- ── 3. Autos: numeração única por subempreiteiro ─────────────────────────────
DO $$
DECLARE
  v_dup int;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT 1 FROM public.autos_medicao GROUP BY subempreiteiro_id, numero HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE NOTICE 'autos_medicao tem % pares (subempreiteiro, numero) duplicados: índice único NÃO criado; corrigir à mão e reaplicar', v_dup;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_autos_medicao_sub_numero
      ON public.autos_medicao (subempreiteiro_id, numero);
  END IF;
END $$;

ALTER FUNCTION public.criar_auto_rpc(uuid, date, numeric, numeric, text) SET search_path = public;

-- ── 4. Substituição atómica das linhas de um auto ────────────────────────────
-- SECURITY INVOKER: a RLS e o gatilho de imutabilidade continuam a aplicar-se.
CREATE OR REPLACE FUNCTION public.substituir_linhas_auto(p_auto_id uuid, p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF jsonb_typeof(COALESCE(p_linhas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'As linhas têm de ser uma lista';
  END IF;

  PERFORM 1 FROM public.autos_medicao WHERE id = p_auto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auto não encontrado';
  END IF;

  DELETE FROM public.auto_linhas WHERE auto_id = p_auto_id;

  INSERT INTO public.auto_linhas (auto_id, artigo_id, descricao, unidade, preco_unitario, quantidade, is_extra, qtd_pedida, justificacao)
  SELECT p_auto_id, x.artigo_id, x.descricao, x.unidade, x.preco_unitario, x.quantidade,
         COALESCE(x.is_extra, false), x.qtd_pedida, x.justificacao
    FROM jsonb_to_recordset(COALESCE(p_linhas, '[]'::jsonb)) AS x(
      artigo_id uuid, descricao text, unidade text, preco_unitario numeric, quantidade numeric,
      is_extra boolean, qtd_pedida numeric, justificacao text);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL     ON FUNCTION public.substituir_linhas_auto(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.substituir_linhas_auto(uuid, jsonb) TO authenticated;

COMMIT;

-- ROLLBACK (desfaz esta migration; correr à mão se necessário):
-- DROP FUNCTION IF EXISTS public.substituir_linhas_auto(uuid, jsonb);
-- ALTER FUNCTION public.criar_auto_rpc(uuid, date, numeric, numeric, text) RESET search_path;
-- DROP INDEX IF EXISTS public.uq_autos_medicao_sub_numero;
-- DROP POLICY IF EXISTS "reg_obra_ins" ON public.registos_obra;
-- CREATE POLICY "reg_obra_ins" ON public.registos_obra FOR INSERT TO authenticated WITH CHECK (true);
-- DROP POLICY IF EXISTS "reg_obra_upd" ON public.registos_obra;
-- CREATE POLICY "reg_obra_upd" ON public.registos_obra FOR UPDATE TO authenticated
--   USING (public.auth_role() IN ('admin', 'gestor') OR autor_id = auth.uid());
-- DROP POLICY IF EXISTS "guias_sel" ON public.guias_transporte;
-- DROP POLICY IF EXISTS "guias_ins" ON public.guias_transporte;
-- DROP POLICY IF EXISTS "guias_upd" ON public.guias_transporte;
-- CREATE POLICY "guias_all" ON public.guias_transporte FOR ALL TO authenticated USING (true);
-- (criar_guia_transporte: repor a definição de 20260917180000_fase8_livro_obra.sql com SET search_path = public)
