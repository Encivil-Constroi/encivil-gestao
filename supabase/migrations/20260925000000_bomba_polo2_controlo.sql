-- ================================================================
-- ENCIVIL — Bomba Polo 2: controlo completo (Shelly Pro 3)
--
-- 1. get_pend_estado_bomba passa a devolver pump_max_seconds.
--    A página pública (anon) deixou de ter SELECT na tabela desde
--    20260922100000_secure_anon_poll — todo o polling passa por esta RPC.
-- 2. pump_comandos: fila de comandos STOP (motorista "Terminei" ou
--    corte de emergência pelo chefe). O Shelly consome-a no polling.
-- 3. pump_heartbeat: último contacto do Shelly + estado real do relé.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

-- ── 1. RPC de polling anon (substitui a versão sem pump_max_seconds) ───────────

DROP POLICY IF EXISTS "comb_pend_anon_select_by_id" ON public.comb_abastecimentos_pendentes;
DROP FUNCTION IF EXISTS public.get_pend_estado_bomba(uuid);

CREATE FUNCTION public.get_pend_estado_bomba(p_id uuid)
RETURNS TABLE(estado text, pump_activated_at timestamptz, pump_max_seconds int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT estado, pump_activated_at, pump_max_seconds
    FROM public.comb_abastecimentos_pendentes
   WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) TO anon, authenticated;

-- ── 2. Heartbeat do Shelly ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pump_heartbeat (
  pump_id      TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  relay_on     BOOLEAN,
  -- Entrada S1 do Shelly ligada ao sinal LIVELLO do quadro (true = alarme de nível)
  nivel_alarme BOOLEAN
);

ALTER TABLE public.pump_heartbeat ENABLE ROW LEVEL SECURITY;
-- Sem policies: só a Edge Function (service role) escreve; leitura via RPC abaixo.

CREATE OR REPLACE FUNCTION public.estado_bomba(p_pump_id text DEFAULT 'POLO2')
RETURNS TABLE(last_seen_at timestamptz, segundos_sem_contacto int, relay_on boolean, nivel_alarme boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.last_seen_at,
         EXTRACT(EPOCH FROM (NOW() - h.last_seen_at))::int,
         h.relay_on,
         h.nivel_alarme
    FROM public.pump_heartbeat h
   WHERE h.pump_id = upper(p_pump_id);
$$;

-- anon incluído: a página do motorista avisa se a bomba está offline antes do pedido
GRANT EXECUTE ON FUNCTION public.estado_bomba(text) TO anon, authenticated;

-- ── 3. Fila de comandos STOP ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pump_comandos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_id      TEXT NOT NULL,
  comando      TEXT NOT NULL CHECK (comando IN ('STOP')),
  -- Sem FK: o pedido é apagado quando aprovado; o comando fica como histórico
  pedido_id    UUID,
  criado_por   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pump_comandos_pendentes
  ON public.pump_comandos (pump_id, criado_em)
  WHERE consumido_em IS NULL;

ALTER TABLE public.pump_comandos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pump_comandos_select_combustivel" ON public.pump_comandos;
CREATE POLICY "pump_comandos_select_combustivel" ON public.pump_comandos
  FOR SELECT TO authenticated
  USING (public.pode_escrever('combustivel'));

GRANT SELECT ON public.pump_comandos TO authenticated;

-- p_pedido_id NULL  → corte de emergência (só admin/gestor/armazém autenticados)
-- p_pedido_id <id>  → motorista termina o seu próprio abastecimento (anon, pela página QR)
CREATE OR REPLACE FUNCTION public.parar_bomba(p_pedido_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pedido_id IS NULL THEN
    IF auth.uid() IS NULL OR NOT public.pode_escrever('combustivel') THEN
      RAISE EXCEPTION 'Sem permissão para desligar a bomba';
    END IF;
  ELSE
    -- A janela de tempo impede que um UUID antigo seja usado para parar
    -- o abastecimento de outra pessoa mais tarde
    IF NOT EXISTS (
      SELECT 1 FROM public.comb_abastecimentos_pendentes
       WHERE id = p_pedido_id
         AND tipo_fonte = 'POLO2'
         AND pump_activated_at IS NOT NULL
         AND pump_activated_at > NOW() - make_interval(secs => pump_max_seconds + 120)
    ) THEN
      RAISE EXCEPTION 'Este abastecimento já não está ativo';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.pump_comandos
       WHERE pedido_id = p_pedido_id AND consumido_em IS NULL
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
  VALUES ('POLO2', 'STOP', p_pedido_id, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.parar_bomba(uuid) TO anon, authenticated;
