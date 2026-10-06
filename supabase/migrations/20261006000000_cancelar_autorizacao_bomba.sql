-- O motorista pode desistir de "Ligar bomba" enquanto o Shelly ainda não a ligou:
-- limpa a autorização pendente e o pedido volta ao passo "Ligar bomba".
-- Depois de a bomba ligar (pump_activated_at) já não se cancela por aqui.
CREATE OR REPLACE FUNCTION public.cancelar_autorizacao_bomba(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.comb_abastecimentos_pendentes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.solicitante_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v.estado <> 'AUTORIZADO' OR v.tipo_fonte <> 'POLO2' THEN
    RAISE EXCEPTION 'Este pedido não tem bomba por ligar';
  END IF;
  IF v.pump_activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'A bomba já foi ligada para este pedido';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET pump_auth_token      = NULL,
         pump_auth_expires_at = NULL,
         bomba_ligada_em      = NULL
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_autorizacao_bomba(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_autorizacao_bomba(uuid) TO authenticated;
