-- supabase/migrations/20260916200000_fase5_geofence.sql
-- Fase 5 — Picagem com Validação por Geofence (PostGIS)
-- Requer: F0 (colaboradores + obras), F3 (picagens)

-- ── Activar PostGIS (já disponível no Supabase) ───────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Geofence nas obras ─────────────────────────────────────────────────────

ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS geofence_tipo     text
    CHECK (geofence_tipo IN ('RAIO', 'POLIGONO')),
  ADD COLUMN IF NOT EXISTS geofence_centro   geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS geofence_raio_m   int,
  ADD COLUMN IF NOT EXISTS geofence_poligono geography(Polygon, 4326);

-- ── Localização nas picagens ───────────────────────────────────────────────

ALTER TABLE public.picagens
  ADD COLUMN IF NOT EXISTS posicao               geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS precisao_m            int,
  ADD COLUMN IF NOT EXISTS distancia_geofence_m  int,
  ADD COLUMN IF NOT EXISTS mock_location_detetada boolean DEFAULT false;

-- ── Índices espaciais ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_obras_geofence_centro
  ON public.obras USING gist(geofence_centro);

CREATE INDEX IF NOT EXISTS idx_obras_geofence_poligono
  ON public.obras USING gist(geofence_poligono);

CREATE INDEX IF NOT EXISTS idx_picagens_posicao
  ON public.picagens USING gist(posicao);

-- ── RPC: registar picagem com validação geofence ───────────────────────────
-- Retorna JSON: { id, resultado, distancia_m }
-- resultado = 'AUTORIZADA'          se dentro do geofence E precisao_m ≤ 50
-- resultado = 'PENDENTE_VALIDACAO'  caso contrário (sem geofence, fora, GPS fraco)

CREATE OR REPLACE FUNCTION public.registar_picagem_geofence(
  p_colaborador_id  uuid,
  p_obra_id         uuid,
  p_tipo            text,
  p_lat             float8,
  p_lon             float8,
  p_precisao_m      int,
  p_timestamp_disp  timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obra       public.obras%rowtype;
  pt         geography;
  distancia  float8;
  resultado  text;
  nova_id    uuid;
BEGIN
  SELECT * INTO obra FROM public.obras WHERE id = p_obra_id;
  pt := ST_MakePoint(p_lon, p_lat)::geography;

  IF obra.geofence_tipo = 'RAIO' AND obra.geofence_centro IS NOT NULL THEN
    distancia := ST_Distance(pt, obra.geofence_centro);
    resultado := CASE
      WHEN distancia <= obra.geofence_raio_m THEN 'AUTORIZADA'
      ELSE 'PENDENTE_VALIDACAO'
    END;

  ELSIF obra.geofence_tipo = 'POLIGONO' AND obra.geofence_poligono IS NOT NULL THEN
    resultado := CASE
      WHEN ST_Within(pt::geometry, obra.geofence_poligono::geometry) THEN 'AUTORIZADA'
      ELSE 'PENDENTE_VALIDACAO'
    END;
    distancia := ST_Distance(pt, obra.geofence_poligono);

  ELSE
    resultado  := 'PENDENTE_VALIDACAO';
    distancia  := NULL;
  END IF;

  -- GPS com precisão fraca → nunca autorizar automaticamente
  IF p_precisao_m > 50 THEN resultado := 'PENDENTE_VALIDACAO'; END IF;

  INSERT INTO public.picagens (
    colaborador_id, obra_id, tipo,
    timestamp_dispositivo, posicao, precisao_m,
    distancia_geofence_m, resultado, origem
  ) VALUES (
    p_colaborador_id, p_obra_id, p_tipo,
    p_timestamp_disp, pt, p_precisao_m,
    CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END,
    resultado, 'ONLINE'
  ) RETURNING id INTO nova_id;

  RETURN json_build_object(
    'id',          nova_id,
    'resultado',   resultado,
    'distancia_m', CASE WHEN distancia IS NOT NULL THEN distancia::int ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registar_picagem_geofence(
  uuid, uuid, text, float8, float8, int, timestamptz
) TO authenticated;
