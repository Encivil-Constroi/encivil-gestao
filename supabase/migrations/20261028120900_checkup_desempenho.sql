-- ================================================================
-- Checkup 2026-10-28 — lote BD-9: desempenho medido na carga (Task 7)
--   1. Índice movimentos_stock (tipo, created_at DESC): as contagens de entradas/saídas
--      de hoje do dashboard faziam Seq Scan à tabela toda (50 % do tempo de BD na carga).
--   2. Policies RLS de public: as funções de sessão sem dependência da linha
--      (auth.uid(), auth.role(), auth_role(), pode_escrever('…'), pode_ler_obras(), …)
--      passam a (SELECT …) — o planner avalia-as uma vez por consulta (initplan) em vez
--      de uma vez por linha. Mesmo resultado, mesmos comandos, papéis e tipo de policy.
--   3. pode_ver_obra(col) nas policies passa a ((SELECT pode_ler_obras()) OR
--      _autor_designado(col)) — é a definição de pode_ver_obra (20261003000000); quem lê
--      obras deixa de pagar uma chamada por linha. Se pode_ver_obra mudar, rever isto
--      (o teste checkup-desempenho falha se a definição mudar).
-- Feito com ALTER POLICY sobre a definição que estiver na base (não recria a policy:
-- mantém nome, comando, papéis e PERMISSIVE/RESTRICTIVE). Só schema public (storage fica).
-- Idempotente: as chamadas já embrulhadas não voltam a ser tocadas.
-- APLICAR: SQL Editor do Supabase Dashboard, depois de 20261028120800.
-- O CREATE INDEX bloqueia escritas em movimentos_stock enquanto corre (segundos).
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_movimentos_stock_tipo_created_at
  ON public.movimentos_stock (tipo, created_at DESC);

DO $$
DECLARE
  -- Chamada sem argumentos de linha, ainda não precedida de "SELECT " nem parte de outro nome
  re_sessao constant text :=
    '(?<!SELECT )(?<![.[:alnum:]_])(auth\.uid\(\)|auth\.role\(\)|(public\.)?(auth_role|pode_ler_obras|pode_gerir_obras|pode_medir_obras|pode_aprovar_combustivel)\(\)|(public\.)?pode_escrever\(''[a-z_]+''::text\))';
  re_ver_obra constant text :=
    '(?<![.[:alnum:]_])(public\.)?pode_ver_obra\(([[:alnum:]_.]+)\)';
  p      record;
  v_qual text;
  v_chk  text;
  n      int := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    v_qual := regexp_replace(regexp_replace(p.qual, re_sessao, '(SELECT \1)', 'g'),
                             re_ver_obra, '((SELECT public.pode_ler_obras()) OR public._autor_designado(\2))', 'g');
    v_chk  := regexp_replace(regexp_replace(p.with_check, re_sessao, '(SELECT \1)', 'g'),
                             re_ver_obra, '((SELECT public.pode_ler_obras()) OR public._autor_designado(\2))', 'g');

    CONTINUE WHEN v_qual IS NOT DISTINCT FROM p.qual AND v_chk IS NOT DISTINCT FROM p.with_check;

    IF v_qual IS NOT NULL AND v_chk IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', p.policyname, p.tablename, v_qual, v_chk);
    ELSIF v_qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, v_qual);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename, v_chk);
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'BD-9: % policies reescritas', n;
END;
$$;

-- ROLLBACK
-- (desfaz só a forma: o resultado das policies é o mesmo nos dois sentidos)
-- DROP INDEX IF EXISTS public.idx_movimentos_stock_tipo_created_at;
-- DO $$
-- DECLARE
--   re_ver_obra constant text := '\(\( SELECT pode_ler_obras\(\) AS pode_ler_obras\) OR _autor_designado\(([[:alnum:]_.]+)\)\)';
--   re_sessao   constant text := '\( SELECT (auth\.uid\(\)|auth\.role\(\)|(public\.)?(auth_role|pode_ler_obras|pode_gerir_obras|pode_medir_obras|pode_aprovar_combustivel)\(\)|(public\.)?pode_escrever\(''[a-z_]+''::text\)) AS [[:alnum:]_]+\)';
--   p record; v_qual text; v_chk text;
-- BEGIN
--   FOR p IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
--     v_qual := regexp_replace(regexp_replace(p.qual, re_ver_obra, 'pode_ver_obra(\1)', 'g'), re_sessao, '\1', 'g');
--     v_chk  := regexp_replace(regexp_replace(p.with_check, re_ver_obra, 'pode_ver_obra(\1)', 'g'), re_sessao, '\1', 'g');
--     CONTINUE WHEN v_qual IS NOT DISTINCT FROM p.qual AND v_chk IS NOT DISTINCT FROM p.with_check;
--     IF v_qual IS NOT NULL AND v_chk IS NOT NULL THEN
--       EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', p.policyname, p.tablename, v_qual, v_chk);
--     ELSIF v_qual IS NOT NULL THEN
--       EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, v_qual);
--     ELSE
--       EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename, v_chk);
--     END IF;
--   END LOOP;
-- END;
-- $$;
