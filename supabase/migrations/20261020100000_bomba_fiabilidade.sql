-- ================================================================
-- ENCIVIL — Bomba Polo 2: fiabilidade da automação
--
-- 1. STOP perdido: relé reportado ligado sem sessão aberta, se a última sessão
--    fechou por TERMINEI / EMERGENCIA / TEMPO / NAO_ARRANCOU há menos de 15 min,
--    recebe "stop" (antes virava sessão MANUAL e a bomba continuava a trabalhar).
-- 2. Confirmação de arranque: pump_sessoes.relay_confirmado_em fica gravado no
--    1.º poll com on=1. Sessão fechada sem confirmação (relé reportado desligado,
--    passados 12 s) = NAO_ARRANCOU: o pedido volta ao passo "Ligar bomba".
-- 3. pump_sessoes.relay_desligado_em: o Shelly reportou o relé desligado depois
--    do fim da sessão. Fica gravado por sessão (o heartbeat só guarda o último
--    estado, que passa a "ligado" quando o motorista seguinte começa).
-- 4. concluir_pedido_abastecimento recusa com o relé ainda ligado (heartbeat
--    < 30 s) ou sem confirmação de arranque.
-- 5. cancelar_pedido_abastecimento recusa depois de a bomba fornecer.
-- 6. ligar_bomba usa o tempo da viatura quando é maior que os 10 min.
-- 7. Quem aprova pode concluir em nome do motorista (foto + leitura final);
--    comb_abastecimentos_pendentes.concluido_por regista quem fechou.
--
-- APLICAR: SQL Editor, depois de publicar o site. Idempotente.
-- Funções copiadas da última versão (pump_poll: 20260928010000; ligar_bomba,
-- concluir, cancelar, get_pend_estado_bomba: 20260930010000) e alteradas.
-- ================================================================

-- ── 1. Colunas novas (as sessões já existentes contam como confirmadas) ──────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'pump_sessoes'
                    AND column_name = 'relay_confirmado_em') THEN
    ALTER TABLE public.pump_sessoes ADD COLUMN relay_confirmado_em timestamptz;
    UPDATE public.pump_sessoes SET relay_confirmado_em = inicio_em;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'pump_sessoes'
                    AND column_name = 'relay_desligado_em') THEN
    ALTER TABLE public.pump_sessoes ADD COLUMN relay_desligado_em timestamptz;
    UPDATE public.pump_sessoes SET relay_desligado_em = fim_em WHERE fim_em IS NOT NULL;
  END IF;
END;
$$;

-- Quem fechou o pedido (o motorista ou quem aprova, em nome dele)
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS concluido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.pump_sessoes DROP CONSTRAINT IF EXISTS pump_sessoes_motivo_fim_check;
ALTER TABLE public.pump_sessoes DROP CONSTRAINT IF EXISTS ck_pump_sessao_motivo_fim;
ALTER TABLE public.pump_sessoes ADD CONSTRAINT ck_pump_sessao_motivo_fim
  CHECK (motivo_fim IN ('TEMPO', 'TERMINEI', 'EMERGENCIA', 'INTERROMPIDO', 'NAO_ARRANCOU'));

-- Sessões fechadas à espera de o Shelly confirmar o relé desligado (poucas)
CREATE INDEX IF NOT EXISTS idx_pump_sessoes_por_desligar
  ON public.pump_sessoes (pump_id) WHERE fim_em IS NOT NULL AND relay_desligado_em IS NULL;

-- ── 2. pump_poll ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pump_poll(p_pump_id text, p_relay_on boolean, p_nivel boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pump       text := upper(p_pump_id);
  v_sessao     public.pump_sessoes%ROWTYPE;
  v_emerg      boolean;
  v_terminei   boolean;
  v_fim        timestamptz;
  v_confirmado timestamptz;
  v_motivo     text;
  v_pedido     record;
  v_segundos   int;
BEGIN
  IF v_pump IS DISTINCT FROM 'POLO2' THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pump_poll:' || v_pump));

  INSERT INTO public.pump_heartbeat (pump_id, last_seen_at, relay_on, nivel_alarme)
  VALUES (v_pump, now(), p_relay_on, p_nivel)
  ON CONFLICT (pump_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at,
        relay_on     = EXCLUDED.relay_on,
        nivel_alarme = EXCLUDED.nivel_alarme;

  -- Relé desligado: confirma a paragem das sessões já fechadas
  IF p_relay_on IS FALSE THEN
    UPDATE public.pump_sessoes
       SET relay_desligado_em = now()
     WHERE pump_id = v_pump AND fim_em IS NOT NULL AND relay_desligado_em IS NULL;
  END IF;

  SELECT * INTO v_sessao
    FROM public.pump_sessoes
   WHERE pump_id = v_pump AND fim_em IS NULL;

  v_confirmado := v_sessao.relay_confirmado_em;
  IF v_sessao.id IS NOT NULL AND v_confirmado IS NULL AND p_relay_on IS TRUE THEN
    v_confirmado := now();
    UPDATE public.pump_sessoes SET relay_confirmado_em = v_confirmado WHERE id = v_sessao.id;
  END IF;

  -- 1. STOP: emergência, ou "Terminei" da sessão ATIVA
  WITH consumidos AS (
    UPDATE public.pump_comandos
       SET consumido_em = now()
     WHERE pump_id = v_pump AND consumido_em IS NULL
    RETURNING pedido_id, criado_em
  )
  SELECT coalesce(bool_or(pedido_id IS NULL), false),
         coalesce(bool_or(pedido_id = v_sessao.pedido_id), false)
    INTO v_emerg, v_terminei
    FROM consumidos
   WHERE criado_em > now() - interval '2 minutes';

  IF v_emerg OR v_terminei THEN
    IF v_sessao.id IS NOT NULL THEN
      v_motivo := CASE
        WHEN v_confirmado IS NULL AND p_relay_on IS FALSE THEN 'NAO_ARRANCOU'
        WHEN v_emerg THEN 'EMERGENCIA'
        ELSE 'TERMINEI' END;
      PERFORM public._pump_fechar_sessao(v_sessao.id, now(), v_motivo, p_relay_on);
    END IF;
    RETURN jsonb_build_object('status', 'stop');
  END IF;

  -- 2. Sessão ativa: ocupada enquanto o relé estiver ligado
  IF v_sessao.id IS NOT NULL THEN
    v_fim := v_sessao.inicio_em + make_interval(secs => v_sessao.segundos_autorizados);

    -- Relé ainda desligado logo depois da autorização: o Shelly pode estar a ligá-lo
    -- (a resposta chegou perto do poll seguinte). Só se conclui NAO_ARRANCOU passados 12 s.
    IF p_relay_on IS TRUE
       OR (p_relay_on IS NULL AND now() < v_fim)
       OR (p_relay_on IS FALSE AND v_confirmado IS NULL AND now() < v_sessao.inicio_em + interval '12 seconds') THEN
      UPDATE public.comb_abastecimentos_pendentes
         SET pump_auth_expires_at = now() + interval '2 minutes'
       WHERE tipo_fonte = v_pump AND estado = 'AUTORIZADO'
         AND pump_activated_at IS NULL
         AND pump_auth_expires_at > now()
         AND pump_auth_expires_at < now() + interval '2 minutes';
      RETURN jsonb_build_object('status', 'idle');
    END IF;

    v_motivo := CASE
      WHEN v_confirmado IS NULL AND p_relay_on IS FALSE THEN 'NAO_ARRANCOU'
      WHEN now() >= v_fim - interval '10 seconds' THEN 'TEMPO'
      ELSE 'INTERROMPIDO' END;
    PERFORM public._pump_fechar_sessao(v_sessao.id, LEAST(now(), v_fim), v_motivo, p_relay_on);
  END IF;

  -- 3. Relé ligado sem sessão
  IF p_relay_on IS TRUE THEN
    -- A sessão acabou há pouco e o relé continua ligado: o "stop" perdeu-se
    -- (ou alguém o voltou a ligar). Insiste no stop em vez de legitimar o uso.
    IF EXISTS (
      SELECT 1 FROM (
        SELECT s.motivo_fim, s.fim_em
          FROM public.pump_sessoes s
         WHERE s.pump_id = v_pump
         ORDER BY s.inicio_em DESC
         LIMIT 1
      ) u
       WHERE u.motivo_fim IN ('TERMINEI', 'EMERGENCIA', 'TEMPO', 'NAO_ARRANCOU')
         AND u.fim_em > now() - interval '15 minutes'
    ) THEN
      RETURN jsonb_build_object('status', 'stop');
    END IF;

    -- Ligado fora da app. Fica registado; nada liga por cima.
    -- 3600s = corte automático configurado no próprio Shelly (auto_off)
    INSERT INTO public.pump_sessoes (pump_id, origem, segundos_autorizados, relay_confirmado_em)
    VALUES (v_pump, 'MANUAL', 3600, now());
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  -- 4. Bloqueada ou fora do horário: pedidos autorizados esperam (e expiram)
  IF public.bomba_bloqueio_motivo(v_pump) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  -- 5. Próximo pedido autorizado, pela ordem de autorização
  SELECT id, veiculo_id, veiculo_nome, funcionario_nome, autorizado_por, pump_max_seconds
    INTO v_pedido
    FROM public.comb_abastecimentos_pendentes
   WHERE tipo_fonte = v_pump AND estado = 'AUTORIZADO'
     AND pump_auth_token IS NOT NULL
     AND pump_activated_at IS NULL
     AND pump_auth_expires_at > now()
   ORDER BY autorizado_em NULLS LAST, criado_em
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'idle');
  END IF;

  v_segundos := LEAST(GREATEST(coalesce(v_pedido.pump_max_seconds, 180), 60), 3600);

  UPDATE public.comb_abastecimentos_pendentes
     SET pump_activated_at = now()
   WHERE id = v_pedido.id;

  INSERT INTO public.pump_sessoes
    (pump_id, pedido_id, veiculo_id, veiculo_nome, funcionario_nome, autorizado_por, segundos_autorizados)
  VALUES
    (v_pump, v_pedido.id, v_pedido.veiculo_id, v_pedido.veiculo_nome,
     v_pedido.funcionario_nome, v_pedido.autorizado_por, v_segundos);

  RETURN jsonb_build_object('status', 'authorized', 'seconds', v_segundos);
END;
$$;

-- Fecha a sessão; NAO_ARRANCOU devolve o pedido ao passo "Ligar bomba"
CREATE OR REPLACE FUNCTION public._pump_fechar_sessao(
  p_sessao uuid, p_fim timestamptz, p_motivo text, p_relay_on boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido uuid;
BEGIN
  UPDATE public.pump_sessoes
     SET fim_em             = p_fim,
         motivo_fim         = p_motivo,
         relay_desligado_em = CASE WHEN p_relay_on IS FALSE THEN now() END
   WHERE id = p_sessao AND fim_em IS NULL
  RETURNING pedido_id INTO v_pedido;

  IF p_motivo = 'NAO_ARRANCOU' AND v_pedido IS NOT NULL THEN
    UPDATE public.comb_abastecimentos_pendentes
       SET pump_activated_at    = NULL,
           pump_auth_token      = NULL,
           pump_auth_expires_at = NULL,
           bomba_ligada_em      = NULL
     WHERE id = v_pedido AND estado = 'AUTORIZADO';
  END IF;
END;
$$;

-- Do cliente nunca: só pump_poll (como dono) a chama
REVOKE ALL ON FUNCTION public._pump_fechar_sessao(uuid, timestamptz, text, boolean) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.pump_poll(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.pump_poll(text, boolean, boolean) TO service_role;

-- ── 3. "Ligar bomba": tempo da viatura, nunca menos de 10 min ────────────────

CREATE OR REPLACE FUNCTION public.ligar_bomba(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v        public.comb_abastecimentos_pendentes%ROWTYPE;
  v_bloq   text;
  v_segs   int;
BEGIN
  SELECT * INTO v FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.solicitante_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v.estado <> 'AUTORIZADO' OR v.tipo_fonte <> 'POLO2' THEN
    RAISE EXCEPTION 'Este pedido não pode ligar a bomba';
  END IF;
  IF v.contador_inicial IS NULL THEN
    RAISE EXCEPTION 'Registe primeiro a leitura inicial do contador';
  END IF;
  IF v.pump_activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'A bomba já foi ligada para este pedido';
  END IF;
  IF v.pump_auth_token IS NOT NULL AND v.pump_auth_expires_at > now() THEN
    RETURN;   -- já pedido, à espera do Shelly
  END IF;

  v_bloq := public.bomba_bloqueio_motivo('POLO2');
  IF v_bloq IS NOT NULL THEN
    RAISE EXCEPTION '%', v_bloq;
  END IF;

  -- comb_veiculos.pump_max_seconds tem 180 por omissão (sem ecrã para o mudar):
  -- só um valor maior, posto de propósito, alarga a janela de 10 min
  SELECT pump_max_seconds INTO v_segs FROM public.comb_veiculos WHERE id = v.veiculo_id;
  v_segs := LEAST(GREATEST(COALESCE(v_segs, 600), 600), 3600);

  UPDATE public.comb_abastecimentos_pendentes
     SET pump_auth_token      = gen_random_uuid(),
         pump_auth_expires_at = now() + interval '5 minutes',
         pump_max_seconds     = v_segs,
         bomba_ligada_em      = now()
   WHERE id = p_id;
END;
$$;

-- ── 4. Concluir: só com a bomba desligada ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.concluir_pedido_abastecimento(
  p_id             uuid,
  p_leitura_final  numeric,
  p_litros         numeric,
  p_custo          numeric,
  p_foto_path      text,
  p_origem         text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v        public.comb_abastecimentos_pendentes%ROWTYPE;
  v_sessao public.pump_sessoes%ROWTYPE;
  v_litros numeric;
  v_preco  numeric;
  v_custo  numeric;
  v_abast  uuid;
  v_recente boolean;
BEGIN
  SELECT * INTO v FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  -- Quem aprova também fecha (motorista que não voltou): mesma leitura final e foto
  IF NOT FOUND OR NOT (v.solicitante_id = auth.uid() OR public.pode_aprovar_combustivel()) THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v.estado <> 'AUTORIZADO' THEN
    RAISE EXCEPTION 'O pedido não está autorizado';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('IA', 'MANUAL') THEN
    RAISE EXCEPTION 'Origem da leitura inválida';
  END IF;
  IF NOT public._foto_do_pedido(p_foto_path, v.veiculo_id, p_id) THEN
    RAISE EXCEPTION 'Tire a foto antes de concluir';
  END IF;

  SELECT preco_litro INTO v_preco FROM public.comb_precos WHERE tipo_combustivel = v.tipo_combustivel;

  IF v.tipo_fonte = 'POLO2' THEN
    IF v.contador_inicial IS NULL THEN
      RAISE EXCEPTION 'Falta a leitura inicial do contador';
    END IF;
    IF v.pump_activated_at IS NULL THEN
      RAISE EXCEPTION 'A bomba não chegou a ligar — não há litros para registar';
    END IF;

    SELECT * INTO v_sessao FROM public.pump_sessoes
     WHERE pedido_id = p_id ORDER BY inicio_em DESC LIMIT 1;
    IF FOUND THEN
      -- Shelly sem contacto há > 30 s: o dead-man do aparelho já cortou; segue (e manda STOP abaixo)
      SELECT COALESCE(bool_or(h.last_seen_at > now() - interval '30 seconds'), false) INTO v_recente
        FROM public.pump_heartbeat h WHERE h.pump_id = 'POLO2';
      IF v_recente AND v_sessao.fim_em IS NULL AND v_sessao.relay_confirmado_em IS NULL THEN
        RAISE EXCEPTION 'A bomba ainda não confirmou que arrancou — aguarde uns segundos';
      END IF;
      -- Relé ligado no último contacto (< 30 s) e ainda sem paragem confirmada desta sessão
      IF (v_sessao.fim_em IS NULL OR v_sessao.relay_desligado_em IS NULL)
         AND EXISTS (SELECT 1 FROM public.pump_heartbeat h
                      WHERE h.pump_id = 'POLO2' AND h.relay_on IS TRUE
                        AND h.last_seen_at > now() - interval '30 seconds') THEN
        RAISE EXCEPTION 'A bomba ainda está ligada: carregue em «Terminei» e aguarde que desligue antes da leitura final';
      END IF;
    END IF;

    IF p_leitura_final IS NULL OR p_leitura_final <= v.contador_inicial THEN
      RAISE EXCEPTION 'A leitura final tem de ser maior que a inicial (%)', v.contador_inicial;
    END IF;
    v_litros := p_leitura_final - v.contador_inicial;
    IF v_litros > 1000 THEN
      RAISE EXCEPTION 'Diferença impossível (% L) — confirme as leituras', v_litros;
    END IF;
    v_custo := COALESCE(round(v_litros * v_preco, 2), 0);

    -- Ainda com sessão aberta (Shelly sem contacto): desligar já
    IF EXISTS (SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_id AND fim_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.pump_comandos WHERE pedido_id = p_id AND consumido_em IS NULL) THEN
      INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
      VALUES ('POLO2', 'STOP', p_id, auth.uid());
    END IF;
  ELSE
    IF p_litros IS NULL OR p_litros <= 0 OR p_litros > 1000 THEN
      RAISE EXCEPTION 'Indique os litros abastecidos';
    END IF;
    v_litros := p_litros;
    IF v.tipo_fonte = 'POSTO_RUA' THEN
      IF p_custo IS NULL OR p_custo < 0 THEN
        RAISE EXCEPTION 'Indique o valor do talão';
      END IF;
      v_custo := round(p_custo, 2);
      v_preco := CASE WHEN v_litros > 0 THEN round(v_custo / v_litros, 4) END;
    ELSE
      v_custo := COALESCE(round(v_litros * v_preco, 2), 0);
    END IF;
  END IF;

  INSERT INTO public.comb_abastecimentos
    (veiculo_id, data, litros, custo_total, contador, local, responsavel, observacoes,
     tipo_fonte, pedido_id, foto_path, tipo_combustivel, preco_litro, solicitante_id, colaborador_id)
  VALUES
    (v.veiculo_id, (now() AT TIME ZONE 'Europe/Lisbon')::date, v_litros, v_custo, v.contador, v.local,
     v.funcionario_nome, v.observacoes, v.tipo_fonte, p_id, p_foto_path, v.tipo_combustivel, v_preco,
     v.solicitante_id, v.colaborador_id)
  RETURNING id INTO v_abast;

  UPDATE public.pump_sessoes SET abastecimento_id = v_abast WHERE pedido_id = p_id;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado                 = 'CONCLUIDO',
         concluido_em           = now(),
         concluido_por          = auth.uid(),
         abastecimento_id       = v_abast,
         litros                 = v_litros,
         custo_total            = v_custo,
         preco_litro            = v_preco,
         contador_final         = CASE WHEN v.tipo_fonte = 'POLO2' THEN p_leitura_final END,
         contador_final_origem  = CASE WHEN v.tipo_fonte = 'POLO2' THEN p_origem END,
         foto_final_path        = p_foto_path   -- contador final (Polo 2), talão ou medidor
   WHERE id = p_id;

  RETURN v_abast;
END;
$$;

-- ── 5. Cancelar: nunca depois de a bomba fornecer ─────────────────────────────

CREATE OR REPLACE FUNCTION public.cancelar_pedido_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.comb_abastecimentos_pendentes%ROWTYPE;
  v_aprovador boolean := public.pode_aprovar_combustivel();
BEGIN
  SELECT * INTO v FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT (v.solicitante_id = auth.uid() OR v_aprovador) THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v.estado NOT IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO') THEN
    RAISE EXCEPTION 'Este pedido já não pode ser cancelado';
  END IF;
  -- Relé confirmado ligado = houve combustível: o registo tem de ficar
  IF v.pump_activated_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pump_sessoes
     WHERE pedido_id = p_id AND relay_confirmado_em IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A bomba já forneceu combustível: conclua o pedido com a leitura final (o motorista ou quem aprova).';
  END IF;
  IF v.pump_activated_at IS NOT NULL AND NOT v_aprovador THEN
    RAISE EXCEPTION 'A bomba já ligou — conclua o abastecimento com a leitura final';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado = 'CANCELADO', cancelado_por = auth.uid(), cancelado_em = now(),
         pump_auth_token = NULL, pump_auth_expires_at = NULL
   WHERE id = p_id;

  IF EXISTS (SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_id AND fim_em IS NULL) THEN
    INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
    VALUES ('POLO2', 'STOP', p_id, auth.uid());
  END IF;
END;
$$;

-- ── 5b. Fotos: quem aprova envia a foto final de um pedido já fornecido ─────
-- Cópia de 20260930010000 + a última condição (para concluir em nome do motorista)
CREATE OR REPLACE FUNCTION public.foto_combustivel_valida(p_nome text)
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
  SELECT COALESCE(auth.uid() IS NOT NULL
     AND m.g IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.comb_veiculos v WHERE v.id = (m.g)[1]::uuid AND v.ativo)
     AND (
       NOT EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes p WHERE p.id = (m.g)[2]::uuid)
       OR EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes p
                   WHERE p.id = (m.g)[2]::uuid AND p.veiculo_id = (m.g)[1]::uuid
                     AND p.solicitante_id = auth.uid() AND p.estado = 'AUTORIZADO')
       OR (public.pode_aprovar_combustivel() AND EXISTS (
             SELECT 1 FROM public.comb_abastecimentos_pendentes p
              WHERE p.id = (m.g)[2]::uuid AND p.veiculo_id = (m.g)[1]::uuid
                AND p.estado = 'AUTORIZADO' AND p.pump_activated_at IS NOT NULL))
     ), false)
    FROM m
$$;

REVOKE ALL     ON FUNCTION public.foto_combustivel_valida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.foto_combustivel_valida(text) TO authenticated;

-- ── 6. Estado do pedido: paragem confirmada por sessão ───────────────────────

CREATE OR REPLACE FUNCTION public.get_pend_estado_bomba(p_id uuid)
RETURNS TABLE(
  estado               text,
  pump_activated_at    timestamptz,
  pump_max_seconds     int,
  bomba_ocupada        boolean,
  bloqueio_motivo      text,
  sessao_ativa         boolean,
  motivo_fim           text,
  desligada_confirmada boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.estado,
         p.pump_activated_at,
         p.pump_max_seconds,
         p.tipo_fonte = 'POLO2' AND p.pump_activated_at IS NULL AND (
           EXISTS (SELECT 1 FROM public.pump_sessoes s0 WHERE s0.pump_id = 'POLO2' AND s0.fim_em IS NULL)
           OR COALESCE(h.relay_on, false)
         ),
         CASE WHEN p.tipo_fonte = 'POLO2' THEN public.bomba_bloqueio_motivo('POLO2') END,
         s.id IS NOT NULL AND s.fim_em IS NULL,
         s.motivo_fim,
         s.fim_em IS NOT NULL AND (
           s.relay_desligado_em IS NOT NULL
           OR (h.relay_on IS FALSE AND h.last_seen_at >= s.fim_em)
         )
    FROM public.comb_abastecimentos_pendentes p
    LEFT JOIN public.pump_heartbeat h ON h.pump_id = 'POLO2'
    LEFT JOIN LATERAL (
      SELECT * FROM public.pump_sessoes s1
       WHERE s1.pedido_id = p.id
       ORDER BY s1.inicio_em DESC
       LIMIT 1
    ) s ON true
   WHERE p.id = p_id
     AND (p.solicitante_id = auth.uid() OR public.pode_escrever('combustivel') OR public.pode_aprovar_combustivel());
$$;

REVOKE ALL ON FUNCTION public.ligar_bomba(uuid)                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.concluir_pedido_abastecimento(uuid, numeric, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_abastecimento(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ligar_bomba(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_pedido_abastecimento(uuid, numeric, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_abastecimento(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid)                      TO authenticated;

-- ROLLBACK
-- Repor as funções: voltar a correr, por esta ordem, as definições de
--   pump_poll                         em 20260928010000_bomba_bloqueio_confirmacao.sql
--   ligar_bomba, concluir_pedido_abastecimento, cancelar_pedido_abastecimento,
--   get_pend_estado_bomba, foto_combustivel_valida em 20260930010000_abastecimento_v2.sql
-- e depois:
-- DROP FUNCTION IF EXISTS public._pump_fechar_sessao(uuid, timestamptz, text, boolean);
-- UPDATE public.pump_sessoes SET motivo_fim = 'INTERROMPIDO' WHERE motivo_fim = 'NAO_ARRANCOU';
-- ALTER TABLE public.pump_sessoes DROP CONSTRAINT IF EXISTS ck_pump_sessao_motivo_fim;
-- ALTER TABLE public.pump_sessoes ADD CONSTRAINT pump_sessoes_motivo_fim_check
--   CHECK (motivo_fim IN ('TEMPO', 'TERMINEI', 'EMERGENCIA', 'INTERROMPIDO'));
-- DROP INDEX IF EXISTS public.idx_pump_sessoes_por_desligar;
-- ALTER TABLE public.pump_sessoes DROP COLUMN IF EXISTS relay_desligado_em;
-- ALTER TABLE public.pump_sessoes DROP COLUMN IF EXISTS relay_confirmado_em;
-- ALTER TABLE public.comb_abastecimentos_pendentes DROP COLUMN IF EXISTS concluido_por;
