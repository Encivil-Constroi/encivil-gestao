-- ================================================================
-- ENCIVIL — Rejeitar também na aprovação final
--
-- rejeitar_abastecimento só aceitava AGUARDA_AUTORIZACAO / AUTORIZADO: um
-- registo em AGUARDA_APROVACAO (motorista já enviou foto e litros) dava
-- "Pedido não encontrado ou já processado" e não havia forma de o recusar.
-- O registo fica REJEITADO (não entra em comb_abastecimentos) — mantém-se
-- como histórico, tal como nas outras rejeições.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

CREATE OR REPLACE FUNCTION public.rejeitar_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_escrever('combustivel') THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar abastecimentos';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado = 'REJEITADO'
   WHERE id = p_id
     AND estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO', 'AGUARDA_APROVACAO');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_id AND fim_em IS NULL) THEN
    INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
    VALUES ('POLO2', 'STOP', NULL, auth.uid());
  END IF;
END;
$$;
