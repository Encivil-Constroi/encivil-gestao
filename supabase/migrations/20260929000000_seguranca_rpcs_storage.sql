-- ================================================================
-- ENCIVIL — Segurança: RPCs sem guarda, storage de fotos, push
--
-- Auditoria 2026-09-29 (confirmada em produção com a chave pública):
-- funções SECURITY DEFINER sem verificação de permissão executáveis por anon.
-- Por omissão o Postgres dá EXECUTE a PUBLIC — um GRANT a authenticated não
-- restringe nada; é preciso REVOKE explícito.
--
-- Técnica: a função original é renomeada para _<nome>_impl (sem EXECUTE para
-- ninguém) e uma função com a MESMA assinatura verifica a permissão e chama-a.
-- O corpo original não é reescrito — o comportamento não muda.
--
-- Cada guarda espelha a regra já existente (RLS ou rota), para não retirar
-- acesso a quem o tem hoje. A produção diverge do repositório em alguns
-- objetos: tudo o que é opcional só atua se existir.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── 1. Renomear as originais (idempotente) ───────────────────────────────────

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('custos_consolidados_por_obra', 'uuid, date, date'),
    ('lancar_fatura',                'uuid, text'),
    ('classificar_e_aprender',       'uuid, jsonb'),
    ('registar_picagem_geofence',    'uuid, uuid, text, double precision, double precision, integer, timestamp with time zone')
  ) AS t(nome, args)
  LOOP
    IF to_regprocedure(format('public.%I(%s)', f.nome, f.args)) IS NOT NULL
       AND to_regprocedure(format('public.%I(%s)', '_' || f.nome || '_impl', f.args)) IS NULL THEN
      EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', f.nome, f.args, '_' || f.nome || '_impl');
    END IF;
    IF to_regprocedure(format('public.%I(%s)', '_' || f.nome || '_impl', f.args)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                     '_' || f.nome || '_impl', f.args);
    END IF;
  END LOOP;
END $$;

-- ── 2. Wrappers com guarda ───────────────────────────────────────────────────

-- Custos: a rota /obras/:id/custos está aberta a qualquer utilizador autenticado
CREATE OR REPLACE FUNCTION public.custos_consolidados_por_obra(
  p_obra_id  uuid,
  p_data_ini date DEFAULT '2000-01-01'::date,
  p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para consultar custos';
  END IF;
  RETURN public._custos_consolidados_por_obra_impl(p_obra_id, p_data_ini, p_data_fim);
END;
$$;

-- Faturas: RLS faturas_update / linhas_* permite só admin e gestor
CREATE OR REPLACE FUNCTION public.lancar_fatura(p_fatura_id uuid, p_responsavel text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para lançar faturas';
  END IF;
  PERFORM public._lancar_fatura_impl(p_fatura_id, p_responsavel);
END;
$$;

CREATE OR REPLACE FUNCTION public.classificar_e_aprender(p_fatura_id uuid, p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para classificar faturas';
  END IF;
  PERFORM public._classificar_e_aprender_impl(p_fatura_id, p_linhas);
END;
$$;

-- Picagens: RLS picagens_sel — o próprio colaborador, ou admin/gestor
CREATE OR REPLACE FUNCTION public.registar_picagem_geofence(
  p_colaborador_id uuid,
  p_obra_id        uuid,
  p_tipo           text,
  p_lat            double precision,
  p_lon            double precision,
  p_precisao_m     integer,
  p_timestamp_disp timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.auth_role() IN ('admin', 'gestor')
    OR EXISTS (SELECT 1 FROM public.colaboradores c
                WHERE c.id = p_colaborador_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registar picagens deste colaborador';
  END IF;
  RETURN public._registar_picagem_geofence_impl(
    p_colaborador_id, p_obra_id, p_tipo, p_lat, p_lon, p_precisao_m, p_timestamp_disp);
END;
$$;

REVOKE ALL     ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL     ON FUNCTION public.lancar_fatura(uuid, text)                       FROM PUBLIC, anon;
REVOKE ALL     ON FUNCTION public.classificar_e_aprender(uuid, jsonb)             FROM PUBLIC, anon;
REVOKE ALL     ON FUNCTION public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.custos_consolidados_por_obra(uuid, date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.lancar_fatura(uuid, text)                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.classificar_e_aprender(uuid, jsonb)             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.registar_picagem_geofence(uuid, uuid, text, double precision, double precision, integer, timestamp with time zone) TO authenticated;

-- ── 3. Funções internas / agendadas ──────────────────────────────────────────

DO $$ BEGIN
  -- Só chamada por avaliar_regras_alerta (SECURITY DEFINER, corre como dono)
  IF to_regprocedure('public._upsert_alerta(uuid, uuid, text, numeric, numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public._upsert_alerta(uuid, uuid, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
  END IF;

  -- Só pg_cron (corre como postgres); o site não a chama
  IF to_regprocedure('public.calcular_resumo_dia(date)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.calcular_resumo_dia(date) FROM PUBLIC, anon, authenticated;
  END IF;

  -- A guarda interna deixa passar pedidos sem login (pensada para o cron):
  -- fechar a anon aqui; o site (admin/gestor) e o papel de serviço continuam
  IF to_regprocedure('public.avaliar_regras_alerta()') IS NOT NULL THEN
    REVOKE ALL     ON FUNCTION public.avaliar_regras_alerta() FROM PUBLIC, anon;
    GRANT  EXECUTE ON FUNCTION public.avaliar_regras_alerta() TO authenticated, service_role;
  END IF;
END $$;

-- Sem uso anónimo legítimo (defesa em profundidade; várias já têm guarda própria).
-- criar_guia_transporte não tem guarda: a RLS de guias_transporte já é aberta a
-- authenticated, mas anon nunca devia chegar-lhe.
DO $$
DECLARE
  assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.criar_guia_transporte(uuid, uuid, text, text, date, jsonb)',
    'public.validar_auto(uuid)',
    'public.validar_subempreiteiro(uuid)',
    'public.rejeitar_abastecimento_pendente(uuid)',
    'public.gerar_codigo_ferramenta()',
    'public.gerar_codigo_produto()',
    'public.gerar_codigo_veiculo()'
  ] LOOP
    IF to_regprocedure(assinatura) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', assinatura);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated', assinatura);
    END IF;
  END LOOP;
END $$;

-- ── 4. search_path fixo nas SECURITY DEFINER que não o tinham ───────────────

DO $$
DECLARE
  assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.audit_delete()',
    'public.criar_guia_transporte(uuid, uuid, text, text, date, jsonb)',
    'public.gerar_codigo_ferramenta()',
    'public.gerar_codigo_produto()',
    'public.gerar_codigo_veiculo()',
    'public.handle_new_user()',
    'public.validar_auto(uuid)'
  ] LOOP
    IF to_regprocedure(assinatura) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', assinatura);
    END IF;
  END LOOP;
END $$;

-- ── 5. Fotos dos abastecimentos (bucket combustivel-taloes) ─────────────────

-- Só aceita <viatura>/<AAAA-MM-DD>_<pedido>_<n>.<ext> de um pedido AUTORIZADO
-- dessa viatura. SECURITY DEFINER: anon não tem SELECT na tabela de pedidos.
CREATE OR REPLACE FUNCTION public.foto_abastecimento_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT regexp_match(
      p_nome,
      '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
      || '[0-9]{4}-[0-9]{2}-[0-9]{2}_'
      || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_'
      || '[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
    ) AS g
  )
  SELECT EXISTS (
    SELECT 1
      FROM m
      JOIN public.comb_abastecimentos_pendentes p
        ON p.id = (m.g)[2]::uuid
       AND p.veiculo_id = (m.g)[1]::uuid
     WHERE m.g IS NOT NULL
       AND p.estado = 'AUTORIZADO'
  );
$$;

REVOKE ALL     ON FUNCTION public.foto_abastecimento_valida(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.foto_abastecimento_valida(text) TO anon, authenticated;

DROP POLICY IF EXISTS "anon_upload_taloes" ON storage.objects;
CREATE POLICY "anon_upload_taloes" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'combustivel-taloes' AND public.foto_abastecimento_valida(name));

-- Sem esta política o bucket deixa de ser listável; como é público, o URL
-- /object/public/… de cada foto continua a funcionar (não passa pelo RLS)
DROP POLICY IF EXISTS "public_read_taloes" ON storage.objects;

-- ── 6. send-push notifica cada pedido uma só vez ─────────────────────────────

ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS push_notificado_em TIMESTAMPTZ;
