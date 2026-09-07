-- ================================================================
-- B5: Restringir avaliar_regras_alerta() a admin/gestor
--
-- A função estava com GRANT TO authenticated, permitindo que qualquer
-- utilizador autenticado (incl. operador) a chamasse via REST.
-- Fix: verificar auth_role() dentro da função. Chamadas de servidor
-- (pg_cron, service key) têm auth.uid() = NULL e são sempre permitidas.
-- ================================================================

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
