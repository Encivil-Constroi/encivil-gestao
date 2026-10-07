-- Contabilidade/RH: dados laborais (RGPD: só admin/gestor), campos fiscais das faturas
-- e mapa mensal de assiduidade para processamento salarial (CT art. 268.º).

CREATE TABLE IF NOT EXISTS public.colaboradores_dados_laborais (
  colaborador_id         uuid PRIMARY KEY REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  niss                   text CHECK (niss IS NULL OR niss ~ '^\d{11}$'),
  iban                   text CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$'),
  data_admissao          date,
  tipo_contrato          text CHECK (tipo_contrato IS NULL OR tipo_contrato IN
                           ('SEM_TERMO','TERMO_CERTO','TERMO_INCERTO','TEMPORARIO','ESTAGIO','OUTRO')),
  data_fim_contrato      date,
  categoria_profissional text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dados_laborais_datas CHECK (data_fim_contrato IS NULL OR data_admissao IS NULL OR data_fim_contrato >= data_admissao)
);
ALTER TABLE public.colaboradores_dados_laborais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dados_laborais_sel" ON public.colaboradores_dados_laborais;
DROP POLICY IF EXISTS "dados_laborais_ins" ON public.colaboradores_dados_laborais;
DROP POLICY IF EXISTS "dados_laborais_upd" ON public.colaboradores_dados_laborais;
CREATE POLICY "dados_laborais_sel" ON public.colaboradores_dados_laborais FOR SELECT TO authenticated
  USING (public.auth_role() IN ('admin','gestor'));
CREATE POLICY "dados_laborais_ins" ON public.colaboradores_dados_laborais FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() IN ('admin','gestor'));
CREATE POLICY "dados_laborais_upd" ON public.colaboradores_dados_laborais FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin','gestor')) WITH CHECK (public.auth_role() IN ('admin','gestor'));
GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores_dados_laborais TO authenticated;

ALTER TABLE public.faturas_fornecedor
  ADD COLUMN IF NOT EXISTS nif_fornecedor  text CHECK (nif_fornecedor IS NULL OR nif_fornecedor ~ '^\d{9}$'),
  ADD COLUMN IF NOT EXISTS base_tributavel numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_iva       numeric(12,2);

CREATE OR REPLACE FUNCTION public.contabilidade_mapa_assiduidade(p_inicio date, p_fim date)
RETURNS TABLE (
  colaborador_id uuid, numero_mecan text, nome text, nif text, niss text, cargo text,
  dias_trabalhados int, horas_normais numeric, horas_extra_util_25 numeric, horas_extra_util_375 numeric,
  horas_extra_descanso_50 numeric, horas_extra_total numeric, dias_subsidio_alimentacao int,
  faltas_justificadas_dias numeric, faltas_injustificadas_dias numeric, faltas_descontaveis_dias numeric,
  faltas_detalhe jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF COALESCE(public.auth_role()::text, '') NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Sem permissão para o mapa de assiduidade' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Período inválido';
  END IF;

  RETURN QUERY
  WITH dia AS (
    SELECT r.colaborador_id AS cid, COALESCE(r.horas_previstas,0) AS prev,
           COALESCE(r.horas_efetivas,0) AS efe, COALESCE(r.horas_supl_validadas,0) AS supl
    FROM public.resumo_assiduidade_dia r WHERE r.data BETWEEN p_inicio AND p_fim
  ), ag AS (
    SELECT cid,
      count(*) FILTER (WHERE efe > 0)::int                                       AS d_trab,
      sum(CASE WHEN prev > 0 THEN LEAST(efe, prev) ELSE 0 END)                   AS h_norm,
      sum(CASE WHEN prev > 0 THEN LEAST(supl, 1) ELSE 0 END)                     AS x25,
      sum(CASE WHEN prev > 0 THEN GREATEST(supl - 1, 0) ELSE 0 END)              AS x375,
      sum(CASE WHEN prev = 0 THEN supl ELSE 0 END)                               AS x50,
      count(*) FILTER (WHERE (prev > 0 AND efe >= 0.5 * prev) OR (prev = 0 AND efe > 0))::int AS d_sub
    FROM dia GROUP BY cid
  ), uteis AS (
    SELECT g::date AS d FROM generate_series(p_inicio, p_fim, interval '1 day') g
    WHERE extract(isodow FROM g) < 6
      -- feriados e pontes (descanso da empresa) não são dias de trabalho
      AND NOT EXISTS (SELECT 1 FROM public.feriados_excecoes fe WHERE fe.data = g::date AND fe.tipo IN ('FERIADO','PONTE'))
  ), fd AS (
    SELECT f.colaborador_id AS cid, u.d AS dia, f.estado, COALESCE(tf.designacao, 'Sem tipo') AS tipo,
           COALESCE(tf.descontavel, true) AS descontavel,
           CASE f.periodo WHEN 'MANHA' THEN 0.5 WHEN 'TARDE' THEN 0.5 WHEN 'HORAS' THEN 0 ELSE 1 END::numeric AS peso
    FROM public.faltas f
    LEFT JOIN public.tipos_falta tf ON tf.id = f.tipo_falta_id
    JOIN uteis u ON u.d BETWEEN f.data_inicio AND f.data_fim
  ), fdia0 AS (
    -- Faltas sobrepostas no mesmo dia não duplicam: cada dia pesa no máximo 1.
    -- Injustificada tem precedência; a justificada preenche o que sobra do dia
    -- (MANHA injustificada + TARDE justificada = 0,5 + 0,5). Pendentes não contam.
    SELECT cid, dia,
      -- LEAST ignora NULL: o COALESCE tem de ficar por dentro
      LEAST(COALESCE(sum(peso) FILTER (WHERE estado = 'INJUSTIFICADA'), 0), 1) AS i,
      COALESCE(sum(peso) FILTER (WHERE estado = 'JUSTIFICADA'), 0)                 AS sj,
      COALESCE(sum(peso) FILTER (WHERE estado = 'JUSTIFICADA' AND descontavel), 0) AS sjd
    FROM fd GROUP BY cid, dia
  ), fdia AS (
    SELECT cid, dia, i, LEAST(sj, 1 - i) AS j, LEAST(sjd, LEAST(sj, 1 - i)) AS jd FROM fdia0
  ), fa AS (
    SELECT cid, sum(j) AS fj, sum(i) AS fi, sum(i + jd) AS fdesc
    FROM fdia GROUP BY cid
  ), fdet AS (
    SELECT cid, jsonb_agg(jsonb_build_object('tipo', tipo, 'estado', estado, 'dias', dias) ORDER BY tipo, estado) AS det
    FROM (SELECT cid, tipo, estado, sum(peso) AS dias FROM fd GROUP BY cid, tipo, estado) x GROUP BY cid
  )
  SELECT c.id, c.numero_mecan, c.nome, c.nif, dl.niss, c.cargo,
    COALESCE(ag.d_trab, 0), round(COALESCE(ag.h_norm, 0), 2), round(COALESCE(ag.x25, 0), 2),
    round(COALESCE(ag.x375, 0), 2), round(COALESCE(ag.x50, 0), 2),
    round(COALESCE(ag.x25, 0) + COALESCE(ag.x375, 0) + COALESCE(ag.x50, 0), 2),
    COALESCE(ag.d_sub, 0), COALESCE(fa.fj, 0), COALESCE(fa.fi, 0), COALESCE(fa.fdesc, 0),
    COALESCE(fdet.det, '[]'::jsonb)
  FROM public.colaboradores c
  LEFT JOIN ag   ON ag.cid = c.id
  LEFT JOIN fa   ON fa.cid = c.id
  LEFT JOIN fdet ON fdet.cid = c.id
  LEFT JOIN public.colaboradores_dados_laborais dl ON dl.colaborador_id = c.id
  WHERE c.ativo OR ag.cid IS NOT NULL OR fa.cid IS NOT NULL
  ORDER BY c.nome;
END $$;
REVOKE ALL ON FUNCTION public.contabilidade_mapa_assiduidade(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contabilidade_mapa_assiduidade(date, date) TO authenticated;
