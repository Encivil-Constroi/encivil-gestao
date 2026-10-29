-- =============================================================
-- ENCIVIL — Checkup 2026-10-28, lote BD-6: endurecimento
--   A1-05  spatial_ref_sys (PostGIS) gravável por anon/authenticated: apagar o SRID 4326
--          parte o geofence das picagens. Trigger de instrução que recusa escrita da app.
--   A1-07, A4-18, A3-13  promover_role, contabilidade_mapa_assiduidade e
--          custos_materiais_por_obra executáveis por anon (privilégios por omissão do Supabase).
--   A1-09  conta nova nascia `gestor`; passa a nascer `leitura` (a Edge Function
--          admin-utilizadores define sempre o papel pedido logo a seguir).
--   Revisão BD-1: anon sem SELECT em colaboradores.
-- Idempotente; tolera a ausência do PostGIS e de cada função.
-- =============================================================

-- ── 1. spatial_ref_sys só de leitura para a app (A1-05) ──────────────────────
-- A tabela pertence à extensão (dono supabase_admin): o REVOKE pode não ter efeito,
-- mas o postgres tem o privilégio TRIGGER e o trigger trava a escrita na mesma.
CREATE OR REPLACE FUNCTION public._spatial_ref_sys_so_leitura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'spatial_ref_sys é só de leitura.' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._spatial_ref_sys_so_leitura() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_tabela regclass;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY[
    to_regclass('public.spatial_ref_sys'), to_regclass('extensions.spatial_ref_sys')
  ] LOOP
    CONTINUE WHEN v_tabela IS NULL;
    BEGIN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM anon, authenticated', v_tabela);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Sem permissão para REVOKE em %; fica só o trigger.', v_tabela;
    END;
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS spatial_ref_sys_so_leitura ON %s', v_tabela);
      EXECUTE format(
        'CREATE TRIGGER spatial_ref_sys_so_leitura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s '
        'FOR EACH STATEMENT EXECUTE FUNCTION public._spatial_ref_sys_so_leitura()', v_tabela);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'Sem privilégio TRIGGER em %: A1-05 continua por corrigir (ver docs/auditorias/2026-10-28).', v_tabela;
    END;
  END LOOP;
END $$;

-- ── 2. EXECUTE só para authenticated (A1-07, A4-18, A3-13) ──────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.promover_role(uuid, role_utilizador)',
    'public.contabilidade_mapa_assiduidade(date, date)',
    'public.custos_materiais_por_obra()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
  END LOOP;
END $$;

-- ── 3. anon sem SELECT em colaboradores (revisão BD-1) ───────────────────────
-- O REVOKE ao nível da tabela também retira os GRANT de coluna do mesmo privilégio.
REVOKE SELECT ON public.colaboradores FROM anon;

-- ── 4. Conta nova nasce `leitura` (A1-09) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    'leitura'
  );
  RETURN NEW;
END;
$$;

-- O default 'admin' vinha do esquema inicial; nenhum caminho o usa, mas não pode ser o fallback.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'leitura';

-- ROLLBACK
-- ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'admin';
-- -- handle_new_user: repor o corpo de 20260612000001_default_role_gestor.sql ('gestor'),
-- --   com SECURITY DEFINER SET search_path = public.
-- GRANT SELECT ON public.colaboradores TO anon;  -- só se existia antes (privilégio por omissão do Supabase)
-- GRANT EXECUTE ON FUNCTION public.promover_role(uuid, role_utilizador), public.contabilidade_mapa_assiduidade(date, date), public.custos_materiais_por_obra() TO anon;
-- DROP TRIGGER IF EXISTS spatial_ref_sys_so_leitura ON public.spatial_ref_sys;  -- ou extensions.spatial_ref_sys
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys TO anon, authenticated;
-- DROP FUNCTION IF EXISTS public._spatial_ref_sys_so_leitura();
