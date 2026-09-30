-- ================================================================
-- ENCIVIL — Abastecimento v2 (2/2): pedido com sessão iniciada, aprovação
-- só por quem o CEO designar, bomba ligada pelo motorista, contador lido
-- antes e depois, notificação imediata.
--
-- Fluxo:
--   1. Motorista com sessão iniciada pede: viatura e nome preenchidos,
--      escolhe gasóleo/gasolina, indica os km e fotografa o conta-quilómetros.
--   2. O banco notifica logo os aprovadores (trigger + pg_net → Edge Function
--      notificar-abastecimento). Só aprova quem está em comb_aprovadores
--      (o CEO e quem ele designar); sem ninguém na lista, aprovam os admin.
--   3. Aprovado → o motorista é notificado. Polo 2: fotografa o contador da
--      bomba (leitura por IA ou escrita), carrega em "Ligar bomba" (janela
--      máxima de 10 min, o Shelly liga no próximo contacto), abastece,
--      fotografa o contador final. Litros = final − inicial. Posto de rua /
--      carrinha: foto do talão ou medidor.
--   4. Conclusão entra logo em comb_abastecimentos, com o custo pelo preço
--      por litro em vigor (Polo 2/carrinha) ou pelo talão (posto de rua).
--      O pedido fica guardado com todo o histórico (antes era apagado).
--
-- Deixa de haver pedido sem sessão: acabam o INSERT anónimo, as RPCs e o
-- upload de fotos para anónimos. O QR das viaturas continua a servir —
-- abre o pedido com a viatura escolhida (depois de entrar).
--
-- O Shelly e a Edge Function pump-status não mudam: o pump_poll continua a
-- ligar o primeiro pedido com token; o token passa a ser criado no "Ligar
-- bomba" em vez de na autorização.
--
-- APLICAR: SQL Editor, DEPOIS de 20260930000000_abastecimento_papel_motorista.sql.
-- Idempotente.
-- ================================================================

-- ── 1. Quem aprova ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comb_aprovadores (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_por uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comb_aprovadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comb_aprovadores_select" ON public.comb_aprovadores;
CREATE POLICY "comb_aprovadores_select" ON public.comb_aprovadores
  FOR SELECT TO authenticated USING (true);
GRANT  SELECT ON TABLE public.comb_aprovadores TO authenticated;
REVOKE ALL    ON TABLE public.comb_aprovadores FROM anon;

-- Aprovador designado; sem nenhum designado, os admin (nunca fica sem ninguém)
CREATE OR REPLACE FUNCTION public.pode_aprovar_combustivel()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.comb_aprovadores WHERE user_id = auth.uid())
    OR (NOT EXISTS (SELECT 1 FROM public.comb_aprovadores) AND public.auth_role() = 'admin')
  ), false)
$$;

REVOKE ALL     ON FUNCTION public.pode_aprovar_combustivel() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pode_aprovar_combustivel() TO authenticated;

-- O CEO (ou quem já aprova) designa outros; um admin também pode, para o 1.º
CREATE OR REPLACE FUNCTION public.definir_aprovador_combustivel(p_user_id uuid, p_aprova boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.pode_aprovar_combustivel() OR public.auth_role() = 'admin') THEN
    RAISE EXCEPTION 'Só quem aprova abastecimentos pode designar aprovadores';
  END IF;
  IF p_aprova THEN
    INSERT INTO public.comb_aprovadores (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.comb_aprovadores WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.definir_aprovador_combustivel(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.definir_aprovador_combustivel(uuid, boolean) TO authenticated;

-- ── 2. Preço por litro do combustível próprio (Polo 2 / carrinha) ───────────
CREATE TABLE IF NOT EXISTS public.comb_precos (
  tipo_combustivel text          PRIMARY KEY CHECK (tipo_combustivel IN ('gasoleo', 'gasolina')),
  preco_litro      numeric(8,4)  NOT NULL CHECK (preco_litro > 0 AND preco_litro < 10),
  atualizado_por   uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em    timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.comb_precos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comb_precos_select" ON public.comb_precos;
CREATE POLICY "comb_precos_select" ON public.comb_precos FOR SELECT TO authenticated USING (true);
GRANT  SELECT ON TABLE public.comb_precos TO authenticated;
REVOKE ALL    ON TABLE public.comb_precos FROM anon;

CREATE OR REPLACE FUNCTION public.definir_preco_combustivel(p_tipo text, p_preco numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.pode_aprovar_combustivel() OR public.auth_role() = 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para alterar o preço do combustível';
  END IF;
  INSERT INTO public.comb_precos (tipo_combustivel, preco_litro, atualizado_por, atualizado_em)
  VALUES (p_tipo, p_preco, auth.uid(), now())
  ON CONFLICT (tipo_combustivel) DO UPDATE
    SET preco_litro = EXCLUDED.preco_litro, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
END;
$$;

REVOKE ALL     ON FUNCTION public.definir_preco_combustivel(text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.definir_preco_combustivel(text, numeric) TO authenticated;

-- ── 3. Pedido: novas colunas e estados ──────────────────────────────────────
ALTER TABLE public.comb_abastecimentos_pendentes
  ADD COLUMN IF NOT EXISTS solicitante_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colaborador_id             uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_combustivel           text,
  ADD COLUMN IF NOT EXISTS foto_km_path               text,
  ADD COLUMN IF NOT EXISTS km_anterior                numeric,
  ADD COLUMN IF NOT EXISTS km_suspeito                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contador_inicial           numeric,
  ADD COLUMN IF NOT EXISTS contador_inicial_origem    text,
  ADD COLUMN IF NOT EXISTS foto_contador_inicial_path text,
  ADD COLUMN IF NOT EXISTS contador_final             numeric,
  ADD COLUMN IF NOT EXISTS contador_final_origem      text,
  ADD COLUMN IF NOT EXISTS foto_final_path            text,
  ADD COLUMN IF NOT EXISTS preco_litro                numeric(8,4),
  ADD COLUMN IF NOT EXISTS decisao_por                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decisao_em                 timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa              text,
  ADD COLUMN IF NOT EXISTS bomba_ligada_em            timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em               timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em               timestamptz,
  ADD COLUMN IF NOT EXISTS notificado_decisao_em      timestamptz,
  ADD COLUMN IF NOT EXISTS abastecimento_id           uuid REFERENCES public.comb_abastecimentos(id) ON DELETE SET NULL;

ALTER TABLE public.comb_abastecimentos_pendentes DROP CONSTRAINT IF EXISTS ck_pend_estado;
ALTER TABLE public.comb_abastecimentos_pendentes ADD CONSTRAINT ck_pend_estado CHECK (estado IN (
  'AGUARDA_AUTORIZACAO', 'AUTORIZADO', 'AGUARDA_APROVACAO', 'REJEITADO', 'CONCLUIDO', 'CANCELADO'));

ALTER TABLE public.comb_abastecimentos_pendentes DROP CONSTRAINT IF EXISTS ck_pend_tipo_combustivel;
ALTER TABLE public.comb_abastecimentos_pendentes ADD CONSTRAINT ck_pend_tipo_combustivel
  CHECK (tipo_combustivel IS NULL OR tipo_combustivel IN ('gasoleo', 'gasolina'));
ALTER TABLE public.comb_abastecimentos_pendentes DROP CONSTRAINT IF EXISTS ck_pend_origens;
ALTER TABLE public.comb_abastecimentos_pendentes ADD CONSTRAINT ck_pend_origens CHECK (
  (contador_inicial_origem IS NULL OR contador_inicial_origem IN ('IA', 'MANUAL')) AND
  (contador_final_origem   IS NULL OR contador_final_origem   IN ('IA', 'MANUAL')));
ALTER TABLE public.comb_abastecimentos_pendentes DROP CONSTRAINT IF EXISTS ck_pend_contadores;
ALTER TABLE public.comb_abastecimentos_pendentes ADD CONSTRAINT ck_pend_contadores CHECK (
  (contador_inicial IS NULL OR contador_inicial >= 0) AND
  (contador_final   IS NULL OR contador_final   >= 0));

CREATE INDEX IF NOT EXISTS idx_pend_solicitante   ON public.comb_abastecimentos_pendentes (solicitante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pend_estado_criado ON public.comb_abastecimentos_pendentes (estado, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pend_veiculo       ON public.comb_abastecimentos_pendentes (veiculo_id);

-- ── 4. Abastecimento final: ligação ao pedido e ao preço ────────────────────
ALTER TABLE public.comb_abastecimentos
  ADD COLUMN IF NOT EXISTS pedido_id        uuid REFERENCES public.comb_abastecimentos_pendentes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foto_path        text,
  ADD COLUMN IF NOT EXISTS tipo_combustivel text,
  ADD COLUMN IF NOT EXISTS preco_litro      numeric(8,4),
  ADD COLUMN IF NOT EXISTS solicitante_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colaborador_id   uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comb_abast_data   ON public.comb_abastecimentos (data DESC);
-- Um pedido gera no máximo um abastecimento. O anti-duplicados antigo
-- (20260902080000: viatura + dia + litros + custo) fica só para os registos
-- manuais: com pedido, dois abastecimentos iguais no mesmo dia são legítimos
-- (ex.: gerador cheio duas vezes) e o duplo clique já é travado pelo pedido.
DROP INDEX IF EXISTS public.idx_comb_abast_pedido;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comb_abast_pedido
  ON public.comb_abastecimentos (pedido_id) WHERE pedido_id IS NOT NULL;
DROP INDEX IF EXISTS public.comb_abastecimentos_dedup_idx;
CREATE UNIQUE INDEX comb_abastecimentos_dedup_idx
  ON public.comb_abastecimentos (veiculo_id, data, litros, custo_total) WHERE pedido_id IS NULL;

-- ── 5. Leitura: quem já via continua a ver; o motorista só vê o seu ────────
DROP POLICY IF EXISTS "pend_auth_select" ON public.comb_abastecimentos_pendentes;
CREATE POLICY "pend_auth_select" ON public.comb_abastecimentos_pendentes
  FOR SELECT TO authenticated
  USING (public.auth_role() <> 'motorista' OR solicitante_id = auth.uid());

DROP POLICY IF EXISTS "comb_abast_select_auth" ON public.comb_abastecimentos;
CREATE POLICY "comb_abast_select_auth" ON public.comb_abastecimentos
  FOR SELECT TO authenticated
  USING (public.auth_role() <> 'motorista' OR solicitante_id = auth.uid());

-- O CEO aprovador vê o histórico da bomba mesmo sem papel de combustível
DROP POLICY IF EXISTS "pump_sessoes_select_combustivel" ON public.pump_sessoes;
CREATE POLICY "pump_sessoes_select_combustivel" ON public.pump_sessoes
  FOR SELECT TO authenticated
  USING (public.pode_escrever('combustivel') OR public.pode_aprovar_combustivel());

-- ── 6. Fim do pedido anónimo ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "pend_anon_insert" ON public.comb_abastecimentos_pendentes;
REVOKE ALL ON TABLE public.comb_abastecimentos_pendentes FROM anon;

REVOKE EXECUTE ON FUNCTION public.check_pend_rate_limit(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.concluir_abastecimento(uuid, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estado_bomba(text)                                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estado_bomba(text)                                   TO authenticated;

DROP POLICY IF EXISTS "anon_upload_taloes" ON storage.objects;
REVOKE EXECUTE ON FUNCTION public.foto_abastecimento_valida(text) FROM PUBLIC, anon, authenticated;

-- ── 7. Identidade de quem pede ───────────────────────────────────────────────
-- Colaborador ligado à conta (se houver) e nome a usar; senão o nome do perfil
CREATE OR REPLACE FUNCTION public._quem_pede(OUT colaborador_id uuid, OUT nome text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.id, c.nome INTO colaborador_id, nome
    FROM public.colaboradores c
   WHERE c.user_id = auth.uid() AND c.ativo
   ORDER BY c.created_at
   LIMIT 1;
  IF nome IS NULL THEN
    SELECT NULLIF(btrim(p.nome), '') INTO nome FROM public.profiles p WHERE p.id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._quem_pede() FROM PUBLIC, anon, authenticated;

-- Dados para preencher o pedido sozinho (nome, viatura atribuída, km, pedido em curso)
CREATE OR REPLACE FUNCTION public.meu_contexto_abastecimento()
RETURNS TABLE (
  nome text, colaborador_id uuid,
  veiculo_id uuid, veiculo_nome text, veiculo_identificacao text, tipo_combustivel text, km_atual numeric,
  pedido_aberto_id uuid, pode_aprovar boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab uuid;
  v_nome  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;
  SELECT q.colaborador_id, q.nome INTO v_colab, v_nome FROM public._quem_pede() q;

  RETURN QUERY
  SELECT v_nome, v_colab,
         v.id, v.nome, v.identificacao, v.tipo_combustivel, public.km_atual_veiculo(v.id),
         (SELECT p.id FROM public.comb_abastecimentos_pendentes p
           WHERE p.solicitante_id = auth.uid() AND p.estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO')
           ORDER BY p.criado_em DESC LIMIT 1),
         public.pode_aprovar_combustivel()
    FROM (SELECT 1) um
    LEFT JOIN public.veiculo_atribuicoes a ON v_colab IS NOT NULL AND a.colaborador_id = v_colab AND a.ate IS NULL
    LEFT JOIN public.comb_veiculos v ON v.id = a.veiculo_id AND v.ativo
   LIMIT 1;
END;
$$;

REVOKE ALL     ON FUNCTION public.meu_contexto_abastecimento() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.meu_contexto_abastecimento() TO authenticated;

-- ── 8. Fotos: só com sessão, só para o próprio pedido ───────────────────────
-- Caminho: <viatura>/<AAAA-MM-DD>_<pedido>_<n>.<ext> (o mesmo que a Edge
-- Function ler-foto-abastecimento aceita). A foto dos km tira-se antes de o
-- pedido existir (pedido ainda inexistente); as do contador/talão só com o
-- pedido AUTORIZADO do próprio motorista.
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
     ), false)
    FROM m
$$;

REVOKE ALL     ON FUNCTION public.foto_combustivel_valida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.foto_combustivel_valida(text) TO authenticated;

DROP POLICY IF EXISTS "abast_upload_fotos" ON storage.objects;
CREATE POLICY "abast_upload_fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'combustivel-taloes' AND public.foto_combustivel_valida(name));

-- Foto já enviada, no formato do pedido
CREATE OR REPLACE FUNCTION public._foto_do_pedido(p_path text, p_veiculo uuid, p_pedido uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_path IS NOT NULL
     AND p_path ~ ('^' || p_veiculo::text || '/[0-9]{4}-[0-9]{2}-[0-9]{2}_' || p_pedido::text || '_[0-9]{1,16}\.(jpg|png|webp|heic|heif)$')
     AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'combustivel-taloes' AND o.name = p_path)
$$;

REVOKE ALL ON FUNCTION public._foto_do_pedido(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 9. Pedido ────────────────────────────────────────────────────────────────
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

  -- Um pedido em curso de cada vez: por motorista e por viatura
  PERFORM pg_advisory_xact_lock(hashtext('abast_pedido:' || p_veiculo_id::text));
  IF EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes
              WHERE solicitante_id = auth.uid() AND estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO')) THEN
    RAISE EXCEPTION 'Já tem um pedido em curso — conclua-o ou cancele-o primeiro';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comb_abastecimentos_pendentes
              WHERE veiculo_id = p_veiculo_id AND estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO')) THEN
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

-- ── 10. Decisão (só aprovadores) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.autorizar_abastecimento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_fonte text;
  v_bloqueio   text;
BEGIN
  IF NOT public.pode_aprovar_combustivel() THEN
    RAISE EXCEPTION 'Só quem aprova abastecimentos pode autorizar';
  END IF;

  SELECT tipo_fonte INTO v_tipo_fonte
    FROM public.comb_abastecimentos_pendentes
   WHERE id = p_id AND estado = 'AGUARDA_AUTORIZACAO'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já processado: %', p_id;
  END IF;

  IF v_tipo_fonte = 'POLO2' THEN
    v_bloqueio := public.bomba_bloqueio_motivo('POLO2');
    IF v_bloqueio IS NOT NULL THEN
      RAISE EXCEPTION '%', v_bloqueio;
    END IF;
  END IF;

  -- Sem token: a bomba só liga quando o motorista carregar em "Ligar bomba"
  UPDATE public.comb_abastecimentos_pendentes
     SET estado           = 'AUTORIZADO',
         autorizado_por   = auth.uid(),
         autorizado_em    = now(),
         decisao_por      = auth.uid(),
         decisao_em       = now(),
         pump_auth_token  = NULL,
         pump_auth_expires_at = NULL,
         pump_max_seconds = 600
   WHERE id = p_id;
END;
$$;

-- O parâmetro novo tem valor por omissão: chamadas antigas (só p_id) continuam a funcionar
DROP FUNCTION IF EXISTS public.rejeitar_abastecimento(uuid);
CREATE OR REPLACE FUNCTION public.rejeitar_abastecimento(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_aprovar_combustivel() THEN
    RAISE EXCEPTION 'Só quem aprova abastecimentos pode recusar';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET estado        = 'REJEITADO',
         decisao_por   = auth.uid(),
         decisao_em    = now(),
         motivo_recusa = NULLIF(btrim(p_motivo), '')
   WHERE id = p_id
     AND (
       estado = 'AGUARDA_APROVACAO'   -- fluxo anterior: recusa na aprovação final (20260929010000)
       OR (estado IN ('AGUARDA_AUTORIZACAO', 'AUTORIZADO') AND pump_activated_at IS NULL)
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado, já processado, ou a bomba já foi usada (cancele em vez de recusar): %', p_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_id AND fim_em IS NULL) THEN
    INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
    VALUES ('POLO2', 'STOP', NULL, auth.uid());
  END IF;
END;
$$;

-- Aprovação final: só para pedidos antigos (fluxo anterior, AGUARDA_APROVACAO)
CREATE OR REPLACE FUNCTION public.aprovar_abastecimento_pendente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pend     public.comb_abastecimentos_pendentes%ROWTYPE;
  v_abast_id uuid;
BEGIN
  IF NOT public.pode_aprovar_combustivel() THEN
    RAISE EXCEPTION 'Só quem aprova abastecimentos pode aprovar';
  END IF;

  SELECT * INTO v_pend FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_pend.estado <> 'AGUARDA_APROVACAO' THEN
    RAISE EXCEPTION 'Registo em estado inválido para aprovação: %', p_id;
  END IF;

  INSERT INTO public.comb_abastecimentos
    (veiculo_id, data, litros, custo_total, contador, local, responsavel, observacoes, foto_url, tipo_fonte, pedido_id)
  VALUES (
    v_pend.veiculo_id, v_pend.data,
    COALESCE(v_pend.litros, v_pend.litros_gemini, 0),
    COALESCE(v_pend.custo_total, v_pend.custo_gemini, 0),
    v_pend.contador, v_pend.local, v_pend.funcionario_nome, v_pend.observacoes,
    COALESCE(v_pend.foto_medidor_url, v_pend.foto_url), v_pend.tipo_fonte, v_pend.id
  )
  RETURNING id INTO v_abast_id;

  UPDATE public.pump_sessoes SET abastecimento_id = v_abast_id WHERE pedido_id = p_id;
  UPDATE public.comb_abastecimentos_pendentes
     SET estado = 'CONCLUIDO', concluido_em = now(), abastecimento_id = v_abast_id,
         decisao_por = COALESCE(decisao_por, auth.uid()), decisao_em = COALESCE(decisao_em, now())
   WHERE id = p_id;
END;
$$;

-- ── 11. Execução (só o próprio motorista) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registar_contador_inicial(
  p_id uuid, p_leitura numeric, p_foto_path text, p_origem text
) RETURNS void
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
  IF v.estado <> 'AUTORIZADO' THEN
    RAISE EXCEPTION 'O pedido não está autorizado';
  END IF;
  IF v.tipo_fonte <> 'POLO2' THEN
    RAISE EXCEPTION 'A leitura do contador só se aplica à bomba Polo 2';
  END IF;
  IF v.pump_activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'A bomba já ligou — a leitura inicial já não pode mudar';
  END IF;
  IF p_leitura IS NULL OR p_leitura < 0 OR p_leitura >= 100000000 THEN
    RAISE EXCEPTION 'Leitura do contador inválida';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('IA', 'MANUAL') THEN
    RAISE EXCEPTION 'Origem da leitura inválida';
  END IF;
  IF NOT public._foto_do_pedido(p_foto_path, v.veiculo_id, p_id) THEN
    RAISE EXCEPTION 'Tire a foto do contador da bomba';
  END IF;

  UPDATE public.comb_abastecimentos_pendentes
     SET contador_inicial = p_leitura, contador_inicial_origem = p_origem, foto_contador_inicial_path = p_foto_path
   WHERE id = p_id;
END;
$$;

-- "Ligar bomba": cria o token que o pump_poll consome no próximo contacto do
-- Shelly (≤ 5 s). Janela fixa de 10 min. Pode repetir-se se o Shelly não
-- chegou a ligar (token expirado sem ativação).
CREATE OR REPLACE FUNCTION public.ligar_bomba(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v        public.comb_abastecimentos_pendentes%ROWTYPE;
  v_bloq   text;
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

  UPDATE public.comb_abastecimentos_pendentes
     SET pump_auth_token      = gen_random_uuid(),
         pump_auth_expires_at = now() + interval '5 minutes',
         pump_max_seconds     = 600,
         bomba_ligada_em      = now()
   WHERE id = p_id;
END;
$$;

-- Concluir: Polo 2 = litros pela diferença das leituras; posto de rua =
-- litros e custo do talão; carrinha = litros do medidor. Entra logo em
-- comb_abastecimentos; o pedido fica guardado como CONCLUIDO.
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
  v_litros numeric;
  v_preco  numeric;
  v_custo  numeric;
  v_abast  uuid;
BEGIN
  SELECT * INTO v FROM public.comb_abastecimentos_pendentes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.solicitante_id IS DISTINCT FROM auth.uid() THEN
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
    IF p_leitura_final IS NULL OR p_leitura_final <= v.contador_inicial THEN
      RAISE EXCEPTION 'A leitura final tem de ser maior que a inicial (%)', v.contador_inicial;
    END IF;
    v_litros := p_leitura_final - v.contador_inicial;
    IF v_litros > 1000 THEN
      RAISE EXCEPTION 'Diferença impossível (% L) — confirme as leituras', v_litros;
    END IF;
    v_custo := COALESCE(round(v_litros * v_preco, 2), 0);

    -- Ainda a bombear: desligar já
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

-- Cancelar: o motorista antes de a bomba ligar; quem aprova, a qualquer
-- momento antes de concluir (fica registado quem cancelou)
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

-- "Terminei" / corte de emergência: sem anónimo
CREATE OR REPLACE FUNCTION public.parar_bomba(p_pedido_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para desligar a bomba';
  END IF;
  IF p_pedido_id IS NULL THEN
    IF NOT (public.pode_escrever('combustivel') OR public.pode_aprovar_combustivel()) THEN
      RAISE EXCEPTION 'Sem permissão para desligar a bomba';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.comb_abastecimentos_pendentes
       WHERE id = p_pedido_id
         AND (solicitante_id = auth.uid() OR public.pode_escrever('combustivel') OR public.pode_aprovar_combustivel())
    ) THEN
      RAISE EXCEPTION 'Sem permissão para desligar a bomba';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pump_sessoes WHERE pedido_id = p_pedido_id AND fim_em IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.pump_comandos WHERE pedido_id = p_pedido_id AND consumido_em IS NULL
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.pump_comandos (pump_id, comando, pedido_id, criado_por)
  VALUES ('POLO2', 'STOP', p_pedido_id, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.parar_bomba(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.parar_bomba(uuid) TO authenticated;

-- Estado do pedido + bomba: só o próprio, quem aprova ou quem gere combustível
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
         s.fim_em IS NOT NULL AND h.relay_on IS FALSE AND h.last_seen_at >= s.fim_em
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

REVOKE EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pend_estado_bomba(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_pedido_abastecimento(uuid, uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.autorizar_abastecimento(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rejeitar_abastecimento(uuid, text)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aprovar_abastecimento_pendente(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registar_contador_inicial(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ligar_bomba(uuid)                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.concluir_pedido_abastecimento(uuid, numeric, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_abastecimento(uuid)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido_abastecimento(uuid, uuid, text, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.autorizar_abastecimento(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_abastecimento(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_abastecimento_pendente(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.registar_contador_inicial(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_bomba(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_pedido_abastecimento(uuid, numeric, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_abastecimento(uuid)              TO authenticated;

-- ── 12. Notificação imediata (trigger → pg_net → notificar-abastecimento) ───
CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS privado.segredos (
  nome  text PRIMARY KEY,
  valor text NOT NULL CHECK (length(valor) >= 32)
);
REVOKE ALL ON TABLE privado.segredos FROM PUBLIC, anon, authenticated;
ALTER TABLE privado.segredos ENABLE ROW LEVEL SECURITY;

INSERT INTO privado.segredos (nome, valor)
VALUES ('abastecimento_push', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.abastecimento_push_autorizado(p_segredo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM privado.segredos
     WHERE nome = 'abastecimento_push' AND p_segredo IS NOT NULL
       AND length(p_segredo) >= 32 AND valor = p_segredo
  )
$$;

REVOKE ALL     ON FUNCTION public.abastecimento_push_autorizado(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.abastecimento_push_autorizado(text) TO service_role;

-- Nunca pode impedir o pedido nem a decisão: qualquer falha fica só como aviso
CREATE OR REPLACE FUNCTION public._notificar_abastecimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento text;
BEGIN
  IF NEW.solicitante_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.estado = 'AGUARDA_AUTORIZACAO' THEN
    v_evento := 'NOVO';
  ELSIF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('AUTORIZADO', 'REJEITADO') THEN
    v_evento := 'DECISAO';
  ELSE
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/notificar-abastecimento',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey',       'sb_publishable_b2Zjbv0hhxxORNxjemsGZA_bMtFaDJa',
        'x-segredo',    (SELECT valor FROM privado.segredos WHERE nome = 'abastecimento_push')
      ),
      body    := jsonb_build_object('evento', v_evento, 'pedido_id', NEW.id),
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'abastecimento: notificação não enviada: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._notificar_abastecimento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notificar_abastecimento ON public.comb_abastecimentos_pendentes;
CREATE TRIGGER trg_notificar_abastecimento
  AFTER INSERT OR UPDATE OF estado ON public.comb_abastecimentos_pendentes
  FOR EACH ROW EXECUTE FUNCTION public._notificar_abastecimento();

-- Edge Function notificar-abastecimento (papel de serviço)
GRANT SELECT, UPDATE ON TABLE public.comb_abastecimentos_pendentes TO service_role;
GRANT SELECT ON TABLE public.comb_aprovadores, public.comb_veiculos, public.profiles, public.push_subscriptions TO service_role;
GRANT DELETE ON TABLE public.push_subscriptions TO service_role;
