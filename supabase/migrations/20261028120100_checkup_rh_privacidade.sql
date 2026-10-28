-- =============================================================
-- ENCIVIL — Checkup 2026-10-28, lote BD-1: privacidade de RH (RGPD)
-- A1-01: faltas (justificações, dado_saude, comprovativos) e resumo de assiduidade eram
--        legíveis por qualquer conta. Agora: admin, gestor e o próprio colaborador.
-- A1-12: apaga as policies gémeas da primeira migration da fase 2 (eram OR com as novas;
--        corrigir uma e esquecer a outra deixava o furo aberto).
-- A1-02: telemovel, email e notas saem do SELECT de authenticated (mesmo padrão do NIF,
--        20261008030000); admin/gestor/o próprio leem-nos por colaboradores_contactos().
--        A escrita mantém-se pela policy colab_write (admin/gestor).
-- Publicar DEPOIS do site com FE-1 (o site antigo pede estas colunas em todos os ecrãs de RH
-- e receberia 42501).
-- Quem acrescentar colunas a colaboradores: GRANT SELECT (nova_coluna) … TO authenticated.
-- =============================================================

-- ── A1-01 · faltas e resumo de assiduidade ──────────────────────────────────
DROP POLICY IF EXISTS "faltas_sel" ON public.faltas;
CREATE POLICY "faltas_sel" ON public.faltas FOR SELECT TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor')
         OR colaborador_id IN (SELECT c.id FROM public.colaboradores c WHERE c.user_id = auth.uid()));

DROP POLICY IF EXISTS "resumo_sel" ON public.resumo_assiduidade_dia;
CREATE POLICY "resumo_sel" ON public.resumo_assiduidade_dia FOR SELECT TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor')
         OR colaborador_id IN (SELECT c.id FROM public.colaboradores c WHERE c.user_id = auth.uid()));

-- ── A1-12 · policies duplicadas ─────────────────────────────────────────────
DROP POLICY IF EXISTS "assiduidade_sel"   ON public.resumo_assiduidade_dia;
DROP POLICY IF EXISTS "assiduidade_write" ON public.resumo_assiduidade_dia;
DROP POLICY IF EXISTS "hcolab_sel"        ON public.horario_colaborador;
DROP POLICY IF EXISTS "hcolab_write"      ON public.horario_colaborador;
DROP POLICY IF EXISTS "tfalta_sel"        ON public.tipos_falta;
DROP POLICY IF EXISTS "tfalta_write"      ON public.tipos_falta;

-- ── A1-02 · contactos e notas dos colaboradores ─────────────────────────────
-- Reconstrói o GRANT de colunas (em vez de só REVOKE das 3) para funcionar também se o SELECT
-- de tabela tiver sido reposto (ex.: rollback de 20261008030000): um REVOKE de coluna não
-- retira um SELECT de tabela.
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'colaboradores'
     AND column_name NOT IN ('nif', 'telemovel', 'email', 'notas');
  EXECUTE 'REVOKE SELECT ON public.colaboradores FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.colaboradores TO authenticated', v_cols);
END $$;

CREATE OR REPLACE FUNCTION public.colaboradores_contactos()
RETURNS TABLE(id uuid, telemovel text, email text, notas text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.telemovel, c.email, c.notas
    FROM public.colaboradores c
   WHERE public.auth_role() IN ('admin', 'gestor') OR c.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.colaboradores_contactos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colaboradores_contactos() TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.colaboradores_contactos();
-- GRANT SELECT (telemovel, email, notas) ON public.colaboradores TO authenticated;
-- DROP POLICY IF EXISTS "faltas_sel" ON public.faltas;
-- CREATE POLICY "faltas_sel" ON public.faltas FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "resumo_sel" ON public.resumo_assiduidade_dia;
-- CREATE POLICY "resumo_sel" ON public.resumo_assiduidade_dia FOR SELECT TO authenticated USING (true);
-- (as policies gémeas apagadas de A1-12 eram equivalentes às que ficam; não se recriam)
