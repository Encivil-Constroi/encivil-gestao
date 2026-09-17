-- supabase/migrations/20260917180000_fase8_livro_obra.sql
-- F8 — Livro de Obra Digital e Guias de Transporte

-- ── Livro de Obra ─────────────────────────────────────────────────────────────

CREATE TABLE public.registos_obra (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id    uuid        NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data       date        NOT NULL,
  categoria  text        NOT NULL,
  -- 'OCORRENCIA' | 'VISITA' | 'CONDICOES_METEO' | 'PESSOAL' | 'EQUIPAMENTO'
  descricao  text        NOT NULL,
  foto_keys  text[]      NOT NULL DEFAULT '{}',
  autor_id   uuid        NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registos_obra_obra_data_idx ON registos_obra (obra_id, data DESC);

ALTER TABLE public.registos_obra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reg_obra_sel" ON registos_obra
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "reg_obra_ins" ON registos_obra
  FOR INSERT TO authenticated WITH CHECK (true);

-- Autor ou gestor/admin podem editar
CREATE POLICY "reg_obra_upd" ON registos_obra
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'gestor') OR autor_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON TABLE public.registos_obra TO authenticated;

-- ── Guias de Transporte ───────────────────────────────────────────────────────

CREATE TABLE public.guias_transporte (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero       text        UNIQUE NOT NULL,
  obra_id      uuid        REFERENCES obras(id),
  viatura_id   uuid,
  motorista_id uuid        REFERENCES colaboradores(id),
  origem       text,
  destino      text,
  data_carga   date,
  estado       text        NOT NULL DEFAULT 'EMITIDA',
  -- 'EMITIDA' | 'ENTREGUE' | 'ANULADA'
  linhas       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- [{ descricao, quantidade, unidade }]
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guias_transporte_obra_idx ON guias_transporte (obra_id, created_at DESC);

ALTER TABLE public.guias_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guias_all" ON guias_transporte
  FOR ALL TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.guias_transporte TO authenticated;

-- ── Numeração sequencial por obra (advisory lock — sem race condition) ────────

CREATE OR REPLACE FUNCTION public.criar_guia_transporte(
  p_obra_id     uuid,
  p_motorista   uuid,
  p_origem      text,
  p_destino     text,
  p_data_carga  date,
  p_linhas      jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_numero text;
  v_seq    int;
  v_id     uuid;
BEGIN
  -- Advisory lock por obra para serializar a numeração
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

GRANT EXECUTE ON FUNCTION public.criar_guia_transporte(uuid, uuid, text, text, date, jsonb) TO authenticated;
