-- A viatura volta a ficar livre assim que o pedido é autorizado: só um pedido
-- AGUARDA_AUTORIZACAO a bloqueia. Antes, AUTORIZADO também bloqueava e o
-- motorista via "Esta viatura já tem um pedido em curso" sem ter nenhum.
-- O limite de um pedido em curso por motorista mantém-se.
CREATE OR REPLACE FUNCTION public.criar_pedido_abastecimento(
  p_id               uuid,
  p_veiculo_id       uuid,
  p_tipo_fonte       text,
  p_tipo_combustivel text,
  p_km               numeric,
  p_foto_km_path     text,
  p_observacoes      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab    uuid;
  v_nome     text;
  v_veiculo  text;
  v_bloqueio text;
  v_km_ant   numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  SELECT q.colaborador_id, q.nome INTO v_colab, v_nome FROM public._quem_pede() q;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A sua conta não tem nome — peça ao administrador para o completar';
  END IF;

  IF p_tipo_fonte IS NULL OR p_tipo_fonte NOT IN ('POLO2', 'CARRINHA', 'POSTO_RUA') THEN
    RAISE EXCEPTION 'Escolha onde vai abastecer';
  END IF;
  IF p_tipo_combustivel IS NULL OR p_tipo_combustivel NOT IN ('gasoleo', 'gasolina') THEN
    RAISE EXCEPTION 'Escolha gasóleo ou gasolina';
  END IF;
  IF p_km IS NULL OR p_km < 0 OR p_km >= 10000000 THEN
    RAISE EXCEPTION 'Indique os km atuais da viatura';
  END IF;

  SELECT nome INTO v_veiculo FROM public.comb_veiculos WHERE id = p_veiculo_id AND ativo;
  IF v_veiculo IS NULL THEN
    RAISE EXCEPTION 'Viatura não encontrada ou inativa';
  END IF;

  -- Por motorista: um pedido em curso. Por viatura: um só a aguardar autorização
  PERFORM pg_advisory_xact_lock(hashtext('abast_pedido:' || p_veiculo_id::text));
  IF EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes
              WHERE solicitante_id = auth.uid() AND estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO')) THEN
    RAISE EXCEPTION 'Já tem um pedido em curso — conclua-o ou cancele-o primeiro';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes
              WHERE veiculo_id = p_veiculo_id AND estado = 'AGUARDA_AUTORIZACAO') THEN
    RAISE EXCEPTION 'Esta viatura já tem um pedido em curso';
  END IF;

  IF p_tipo_fonte = 'POLO2' THEN
    v_bloqueio := public.bomba_bloqueio_motivo('POLO2');
    IF v_bloqueio IS NOT NULL THEN
      RAISE EXCEPTION '%', v_bloqueio;
    END IF;
  END IF;

  IF NOT public._foto_do_pedido(p_foto_km_path, p_veiculo_id, p_id) THEN
    RAISE EXCEPTION 'Tire a foto do conta-quilómetros antes de pedir';
  END IF;

  -- Km abaixo do último conhecido ou salto impossível num depósito: fica
  -- marcado para quem aprova (não bloqueia — o conta-km pode ter sido trocado)
  v_km_ant := public.km_atual_veiculo(p_veiculo_id);

  INSERT INTO public.comb_abastecimentos_pendentes
    (id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, tipo_combustivel, estado,
     contador, km_anterior, km_suspeito, foto_km_path, observacoes, solicitante_id, colaborador_id, local)
  VALUES
    (p_id, p_veiculo_id, v_veiculo, v_nome, (now() AT TIME ZONE 'Europe/Lisbon')::date,
     p_tipo_fonte, p_tipo_combustivel, 'AGUARDA_AUTORIZACAO',
     p_km, v_km_ant, v_km_ant IS NOT NULL AND (p_km < v_km_ant OR p_km > v_km_ant + 3000),
     p_foto_km_path, NULLIF(btrim(p_observacoes), ''), auth.uid(), v_colab,
     CASE p_tipo_fonte WHEN 'POLO2' THEN 'Polo 2' WHEN 'CARRINHA' THEN 'Carrinha' ELSE 'Posto' END);

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pedido_abastecimento(uuid, uuid, text, text, numeric, text, text) TO authenticated;
