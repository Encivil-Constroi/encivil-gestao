-- Fase 1 — Motor de Alertas e Manutenção Preventiva
-- Depende de: F0 (colaboradores)
-- Backend: pg_cron diário + RPC avaliar_regras_alerta() (SECURITY DEFINER)
-- NOTA: Para o job automático, ativar pg_cron em Dashboard → Database → Extensions.
--       Sem pg_cron, o motor pode ser executado manualmente via "Avaliar agora".

-- ══════════════════════════════════════════════════════════════
-- 1. AMPLIAR comb_veiculos com campos de manutenção
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.comb_veiculos
  ADD COLUMN IF NOT EXISTS proxima_revisao_km      numeric,
  ADD COLUMN IF NOT EXISTS proxima_revisao_data    date,
  ADD COLUMN IF NOT EXISTS intervalo_revisao_km    numeric,
  ADD COLUMN IF NOT EXISTS intervalo_revisao_meses int,
  ADD COLUMN IF NOT EXISTS data_fim_seguro         date,
  ADD COLUMN IF NOT EXISTS data_proxima_ipo        date;

-- ══════════════════════════════════════════════════════════════
-- 2. REGRAS DE ALERTA (motor genérico)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.regras_alerta (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text        NOT NULL,
  -- 'REVISAO_KM' | 'REVISAO_DATA' | 'SEGURO' | 'IPO'
  -- 'SUPLEMENTAR' | 'VALIDADE_DOC' | 'EPI_VALIDADE' | 'FORMACAO_VALIDADE'
  entidade_alvo  text        NOT NULL,  -- 'viatura' | 'colaborador' | 'subempreiteiro'
  entidade_id    uuid,                  -- NULL = aplica a todos da entidade_alvo
  campo_ref      text        NOT NULL,  -- campo/cálculo de referência (documentação)
  limiar_atencao numeric,               -- valor/dias a partir do qual gera ATENCAO
  limiar_urgente numeric,               -- valor/dias a partir do qual gera URGENTE
  destinatarios  text[]      NOT NULL DEFAULT ARRAY['admin','gestor'],
  canais         text[]      NOT NULL DEFAULT ARRAY['app'],
  ativa          boolean     NOT NULL DEFAULT true,
  criada_em      timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- 3. ALERTAS (instâncias geradas pelo motor)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.alertas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id         uuid        NOT NULL REFERENCES public.regras_alerta(id) ON DELETE CASCADE,
  entidade_id      uuid        NOT NULL,
  estado           text        NOT NULL DEFAULT 'ATIVO',
  -- 'ATIVO' | 'RECONHECIDO' | 'RESOLVIDO'
  severidade       text        NOT NULL,
  -- 'ATENCAO' | 'URGENTE'
  valor_atual      numeric,    -- km atual, dias restantes, etc.
  valor_limiar     numeric,    -- proxima_revisao_km, data de validade, etc.
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  reconhecido_por  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reconhecido_em   timestamptz,
  resolvido_por    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em     timestamptz
);

CREATE INDEX IF NOT EXISTS alertas_estado_idx      ON public.alertas (estado);
CREATE INDEX IF NOT EXISTS alertas_regra_idx       ON public.alertas (regra_id);
CREATE INDEX IF NOT EXISTS alertas_entidade_idx    ON public.alertas (entidade_id);
CREATE INDEX IF NOT EXISTS alertas_severidade_idx  ON public.alertas (severidade);

-- ══════════════════════════════════════════════════════════════
-- 4. VIEW alertas_detalhados (JOIN com entidades)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.alertas_detalhados AS
SELECT
  a.id,
  a.regra_id,
  a.entidade_id,
  a.estado,
  a.severidade,
  a.valor_atual,
  a.valor_limiar,
  a.criado_em,
  a.atualizado_em,
  a.reconhecido_por,
  a.reconhecido_em,
  a.resolvido_por,
  a.resolvido_em,
  r.tipo         AS regra_tipo,
  r.entidade_alvo,
  r.campo_ref,
  r.limiar_atencao,
  r.limiar_urgente,
  -- nome da entidade (extensível: adicionar outros casos em fases futuras)
  CASE r.entidade_alvo
    WHEN 'viatura'       THEN v.nome
    WHEN 'colaborador'   THEN c.nome
    ELSE NULL
  END AS entidade_nome,
  CASE r.entidade_alvo
    WHEN 'viatura'       THEN v.identificacao
    ELSE NULL
  END AS entidade_detalhe
FROM public.alertas a
JOIN public.regras_alerta r ON r.id = a.regra_id
LEFT JOIN public.comb_veiculos v
  ON v.id = a.entidade_id AND r.entidade_alvo = 'viatura'
LEFT JOIN public.colaboradores c
  ON c.id = a.entidade_id AND r.entidade_alvo = 'colaborador';

-- ══════════════════════════════════════════════════════════════
-- 5. RPC AUXILIAR _upsert_alerta (privada, SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._upsert_alerta(
  p_regra_id    uuid,
  p_entidade_id uuid,
  p_severidade  text,     -- NULL = condição resolvida
  p_valor_atual numeric,
  p_valor_limiar numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_severidade IS NOT NULL THEN
    -- Alerta ativo já existe?
    SELECT id INTO v_id
    FROM public.alertas
    WHERE regra_id = p_regra_id AND entidade_id = p_entidade_id AND estado = 'ATIVO'
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      -- Atualizar severidade e valor atual se mudaram
      UPDATE public.alertas SET
        severidade    = p_severidade,
        valor_atual   = p_valor_atual,
        atualizado_em = now()
      WHERE id = v_id
        AND (severidade != p_severidade OR valor_atual IS DISTINCT FROM p_valor_atual);
    ELSE
      -- Criar novo alerta
      INSERT INTO public.alertas (regra_id, entidade_id, severidade, valor_atual, valor_limiar)
      VALUES (p_regra_id, p_entidade_id, p_severidade, p_valor_atual, p_valor_limiar);
    END IF;

  ELSE
    -- Condição resolvida → fechar alertas ativos (RECONHECIDO mantém-se: gestor viu)
    UPDATE public.alertas SET
      estado       = 'RESOLVIDO',
      resolvido_em = now()
    WHERE regra_id = p_regra_id AND entidade_id = p_entidade_id AND estado = 'ATIVO';
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. RPC PRINCIPAL avaliar_regras_alerta() — corre diariamente via pg_cron
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.avaliar_regras_alerta()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r          RECORD;  -- regra
  v          RECORD;  -- viatura
  faltam     numeric;
  sev        text;
  criados    int := 0;
BEGIN
  -- Chamadas de sessão autenticada: verificar papel
  -- (auth.uid() IS NULL → pg_cron ou service key → permitir)
  IF auth.uid() IS NOT NULL AND public.auth_role() NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão para avaliar regras de alerta';
  END IF;

  FOR r IN SELECT * FROM public.regras_alerta WHERE ativa = true LOOP

    -- ── REVISAO_KM: km atual vs proxima_revisao_km ─────────────
    IF r.tipo = 'REVISAO_KM' THEN
      FOR v IN
        SELECT
          cv.id,
          cv.proxima_revisao_km,
          MAX(ca.contador) AS km_atual
        FROM public.comb_veiculos cv
        LEFT JOIN public.comb_abastecimentos ca
          ON ca.veiculo_id = cv.id AND ca.contador IS NOT NULL
        WHERE cv.ativo = true
          AND cv.proxima_revisao_km IS NOT NULL
          AND (r.entidade_id IS NULL OR cv.id = r.entidade_id)
        GROUP BY cv.id, cv.proxima_revisao_km
      LOOP
        IF v.km_atual IS NULL THEN CONTINUE; END IF;

        faltam := v.proxima_revisao_km - v.km_atual;

        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;

        PERFORM public._upsert_alerta(r.id, v.id, sev, v.km_atual, v.proxima_revisao_km);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── REVISAO_DATA: data próxima revisão ─────────────────────
    ELSIF r.tipo = 'REVISAO_DATA' THEN
      FOR v IN
        SELECT id, proxima_revisao_data
        FROM public.comb_veiculos
        WHERE ativo = true AND proxima_revisao_data IS NOT NULL
          AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.proxima_revisao_data - CURRENT_DATE;

        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;

        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── SEGURO: validade do seguro ──────────────────────────────
    ELSIF r.tipo = 'SEGURO' THEN
      FOR v IN
        SELECT id, data_fim_seguro
        FROM public.comb_veiculos
        WHERE ativo = true AND data_fim_seguro IS NOT NULL
          AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.data_fim_seguro - CURRENT_DATE;

        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;

        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    -- ── IPO: próxima inspeção ───────────────────────────────────
    ELSIF r.tipo = 'IPO' THEN
      FOR v IN
        SELECT id, data_proxima_ipo
        FROM public.comb_veiculos
        WHERE ativo = true AND data_proxima_ipo IS NOT NULL
          AND (r.entidade_id IS NULL OR id = r.entidade_id)
      LOOP
        faltam := v.data_proxima_ipo - CURRENT_DATE;

        IF   r.limiar_urgente IS NOT NULL AND faltam <= r.limiar_urgente THEN sev := 'URGENTE';
        ELSIF r.limiar_atencao IS NOT NULL AND faltam <= r.limiar_atencao THEN sev := 'ATENCAO';
        ELSE sev := NULL;
        END IF;

        PERFORM public._upsert_alerta(r.id, v.id, sev, faltam, r.limiar_atencao);
        IF sev IS NOT NULL THEN criados := criados + 1; END IF;
      END LOOP;

    END IF;
  END LOOP;

  RETURN criados;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. RLS
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.regras_alerta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas        ENABLE ROW LEVEL SECURITY;

-- Regras: leitura para todos; escrita só admin/gestor
DROP POLICY IF EXISTS "regras_select" ON public.regras_alerta;
CREATE POLICY "regras_select" ON public.regras_alerta
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "regras_write" ON public.regras_alerta;
CREATE POLICY "regras_write" ON public.regras_alerta
  FOR ALL TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

-- Alertas: leitura para todos; reconhecer/resolver gestor+admin; INSERT bloqueado (só RPC)
DROP POLICY IF EXISTS "alertas_select" ON public.alertas;
CREATE POLICY "alertas_select" ON public.alertas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "alertas_update" ON public.alertas;
CREATE POLICY "alertas_update" ON public.alertas
  FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

-- ══════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ══════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON TABLE public.regras_alerta TO authenticated;
GRANT SELECT, UPDATE         ON TABLE public.alertas         TO authenticated;
GRANT SELECT                 ON public.alertas_detalhados     TO authenticated;
GRANT EXECUTE ON FUNCTION public.avaliar_regras_alerta()     TO authenticated;
-- _upsert_alerta é interna — sem GRANT público

-- ══════════════════════════════════════════════════════════════
-- 9. SEED — regras padrão (idempotente via INSERT ... ON CONFLICT DO NOTHING)
-- ══════════════════════════════════════════════════════════════

INSERT INTO public.regras_alerta (tipo, entidade_alvo, campo_ref, limiar_atencao, limiar_urgente)
VALUES
  ('REVISAO_KM',   'viatura', 'proxima_revisao_km - MAX(contador)',     2000, 500),
  ('REVISAO_DATA', 'viatura', 'proxima_revisao_data - CURRENT_DATE',    30,   7),
  ('SEGURO',       'viatura', 'data_fim_seguro - CURRENT_DATE',         30,   7),
  ('IPO',          'viatura', 'data_proxima_ipo - CURRENT_DATE',        45,  14)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 10. pg_cron — job diário às 06:00 UTC
-- Se pg_cron não estiver ativo, este bloco emite um NOTICE e continua.
-- Para ativar: Dashboard → Database → Extensions → pg_cron → Enable
-- Após ativar, correr apenas este bloco novamente.
-- ══════════════════════════════════════════════════════════════

DO $outer$
BEGIN
  PERFORM cron.schedule(
    'avaliar-alertas-diarios',
    '0 6 * * *',
    $job$SELECT public.avaliar_regras_alerta()$job$
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron não disponível — ativar em Dashboard → Database → Extensions e re-correr este bloco.';
END;
$outer$;
