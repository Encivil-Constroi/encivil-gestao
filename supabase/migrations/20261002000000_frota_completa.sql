-- ================================================================
-- ENCIVIL — Frota completa (2026-10-02)
--
--  1. Viaturas e máquinas: marca/modelo, estado (Livre / Em uso / Oficina),
--     obra atual, última revisão, estado à chegada (km/horas de registo),
--     fotos do seguro e da IPO (consulta rápida se parado pela GNR).
--  2. Entrega e devolução de viatura: condutor, obra (opcional), data, km/horas,
--     combustível, líquidos, pneus, limpeza, inventário de segurança e mapa de
--     danos — tudo atómico (entregar_viatura / devolver_viatura).
--  3. Estado Oficina (definir_estado_viatura): uma viatura na oficina não se entrega.
--  4. Manutenção: edição com histórico (editar_manutencao) e última revisão
--     da viatura sempre atualizada.
--  5. Linha do tempo de cada viatura (desde o registo) e histórico de
--     manutenções com quem registou (frota_linha_tempo / frota_historico_manutencoes).
--  6. Bucket "frota-docs" para as fotos do seguro e da IPO.
--
-- APLICAR: SQL Editor. Idempotente.
-- ================================================================

-- ── 1. Viaturas e máquinas ───────────────────────────────────────────────────
ALTER TABLE public.comb_veiculos
  ADD COLUMN IF NOT EXISTS marca               text,
  ADD COLUMN IF NOT EXISTS modelo              text,
  ADD COLUMN IF NOT EXISTS estado_operacional  text    NOT NULL DEFAULT 'LIVRE',
  ADD COLUMN IF NOT EXISTS obra_atual_id       uuid    REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_ultima_revisao date,
  ADD COLUMN IF NOT EXISTS km_ultima_revisao   numeric,
  ADD COLUMN IF NOT EXISTS km_registo          numeric,
  ADD COLUMN IF NOT EXISTS seguro_foto_path    text,
  ADD COLUMN IF NOT EXISTS ipo_foto_path       text;

ALTER TABLE public.comb_veiculos DROP CONSTRAINT IF EXISTS ck_veiculo_estado_operacional;
ALTER TABLE public.comb_veiculos ADD CONSTRAINT ck_veiculo_estado_operacional
  CHECK (estado_operacional IN ('LIVRE', 'EM_USO', 'OFICINA'));
ALTER TABLE public.comb_veiculos DROP CONSTRAINT IF EXISTS ck_veiculo_leituras;
ALTER TABLE public.comb_veiculos ADD CONSTRAINT ck_veiculo_leituras
  CHECK ((km_ultima_revisao IS NULL OR km_ultima_revisao >= 0) AND (km_registo IS NULL OR km_registo >= 0));

-- Quem já tem condutor atribuído passa a "Em uso"
UPDATE public.comb_veiculos v SET estado_operacional = 'EM_USO'
 WHERE v.estado_operacional = 'LIVRE'
   AND EXISTS (SELECT 1 FROM public.veiculo_atribuicoes a WHERE a.veiculo_id = v.id AND a.ate IS NULL);

-- Atribuição aberta ⇒ Em uso; sem atribuição ⇒ deixa de estar Em uso (a Oficina nunca é mexida aqui)
CREATE OR REPLACE FUNCTION public._sincronizar_estado_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ate IS NULL THEN
    UPDATE public.comb_veiculos SET estado_operacional = 'EM_USO'
     WHERE id = NEW.veiculo_id AND estado_operacional = 'LIVRE';
  ELSIF NOT EXISTS (SELECT 1 FROM public.veiculo_atribuicoes WHERE veiculo_id = NEW.veiculo_id AND ate IS NULL) THEN
    UPDATE public.comb_veiculos SET estado_operacional = 'LIVRE', obra_atual_id = NULL
     WHERE id = NEW.veiculo_id AND estado_operacional = 'EM_USO';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._sincronizar_estado_viatura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sincronizar_estado_viatura ON public.veiculo_atribuicoes;
CREATE TRIGGER trg_sincronizar_estado_viatura
  AFTER INSERT OR UPDATE OF ate ON public.veiculo_atribuicoes
  FOR EACH ROW EXECUTE FUNCTION public._sincronizar_estado_viatura();

-- Nome de quem fez um registo (os perfis só são legíveis por cada um e pelo admin)
CREATE OR REPLACE FUNCTION public._nome_utilizador(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(nome), ''), 'Utilizador') FROM public.profiles WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION public._nome_utilizador(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Entregas e devoluções ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.veiculo_entregas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id     uuid        NOT NULL REFERENCES public.comb_veiculos(id),
  tipo           text        NOT NULL,
  colaborador_id uuid        NOT NULL REFERENCES public.colaboradores(id),
  obra_id        uuid        REFERENCES public.obras(id) ON DELETE SET NULL,
  data           date        NOT NULL DEFAULT CURRENT_DATE,
  km             numeric     NOT NULL,
  combustivel    text        NOT NULL,
  adblue         text        NOT NULL DEFAULT 'NA',
  oleo           text        NOT NULL DEFAULT 'NA',
  refrigeracao   text        NOT NULL DEFAULT 'NA',
  pneus          text        NOT NULL DEFAULT 'NA',
  limpeza        text        NOT NULL DEFAULT 'NA',
  inventario     jsonb       NOT NULL DEFAULT '{}',
  danos          jsonb       NOT NULL DEFAULT '[]',
  observacoes    text,
  entrega_ref    uuid        REFERENCES public.veiculo_entregas(id),
  para_oficina   boolean     NOT NULL DEFAULT false,
  criado_por     uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  criado_em      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_entrega_tipo         CHECK (tipo IN ('ENTREGA', 'DEVOLUCAO')),
  CONSTRAINT ck_entrega_km           CHECK (km >= 0),
  CONSTRAINT ck_entrega_combustivel  CHECK (combustivel IN ('RESERVA', 'QUARTO', 'METADE', 'TRES_QUARTOS', 'CHEIO')),
  CONSTRAINT ck_entrega_adblue       CHECK (adblue       IN ('NA', 'VAZIO', 'BAIXO', 'OK')),
  CONSTRAINT ck_entrega_oleo         CHECK (oleo         IN ('NA', 'BAIXO', 'OK')),
  CONSTRAINT ck_entrega_refrigeracao CHECK (refrigeracao IN ('NA', 'BAIXO', 'OK')),
  CONSTRAINT ck_entrega_pneus        CHECK (pneus        IN ('NA', 'GASTOS', 'BAIXO', 'OK')),
  CONSTRAINT ck_entrega_limpeza      CHECK (limpeza      IN ('NA', 'LIMPAR', 'OK')),
  CONSTRAINT ck_entrega_inventario   CHECK (jsonb_typeof(inventario) = 'object'),
  CONSTRAINT ck_entrega_danos        CHECK (jsonb_typeof(danos) = 'array' AND jsonb_array_length(danos) <= 60),
  CONSTRAINT ck_entrega_devolucao_ref CHECK ((tipo = 'DEVOLUCAO') = (entrega_ref IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_entregas_veiculo ON public.veiculo_entregas (veiculo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_entregas_colab   ON public.veiculo_entregas (colaborador_id, criado_em DESC);
-- Cada entrega tem no máximo uma devolução
CREATE UNIQUE INDEX IF NOT EXISTS ux_entrega_uma_devolucao ON public.veiculo_entregas (entrega_ref) WHERE entrega_ref IS NOT NULL;

ALTER TABLE public.veiculo_entregas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "frota_entregas_select" ON public.veiculo_entregas;
CREATE POLICY "frota_entregas_select" ON public.veiculo_entregas
  FOR SELECT TO authenticated USING (public.auth_role() <> 'motorista');
GRANT SELECT ON TABLE public.veiculo_entregas TO authenticated;
REVOKE ALL ON TABLE public.veiculo_entregas FROM anon;

-- Os km/horas de entregas e devoluções também contam como leitura atual
CREATE OR REPLACE FUNCTION public.km_atual_veiculo(p_veiculo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    (SELECT MAX(contador)     FROM public.comb_abastecimentos WHERE veiculo_id = p_veiculo_id),
    (SELECT MAX(km_na_altura) FROM public.veiculo_manutencoes WHERE veiculo_id = p_veiculo_id),
    (SELECT MAX(km_na_altura) FROM public.veiculo_checklists  WHERE veiculo_id = p_veiculo_id),
    (SELECT MAX(km)           FROM public.veiculo_entregas    WHERE veiculo_id = p_veiculo_id),
    (SELECT km_registo        FROM public.comb_veiculos       WHERE id = p_veiculo_id)
  )
$$;

REVOKE ALL     ON FUNCTION public.km_atual_veiculo(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.km_atual_veiculo(uuid) TO authenticated;

-- Entregar uma viatura LIVRE a um colaborador
CREATE OR REPLACE FUNCTION public.entregar_viatura(
  p_veiculo_id     uuid,
  p_colaborador_id uuid,
  p_obra_id        uuid,
  p_data           date,
  p_km             numeric,
  p_combustivel    text,
  p_adblue         text,
  p_oleo           text,
  p_refrigeracao   text,
  p_pneus          text,
  p_limpeza        text,
  p_inventario     jsonb,
  p_danos          jsonb,
  p_observacoes    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v      public.comb_veiculos%ROWTYPE;
  v_c      public.colaboradores%ROWTYPE;
  v_atual  numeric;
  v_quem   text;
  v_id     uuid;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para entregar viaturas';
  END IF;

  SELECT * INTO v_v FROM public.comb_veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura não encontrada ou arquivada';
  END IF;
  IF v_v.estado_operacional = 'OFICINA' THEN
    RAISE EXCEPTION '"%" está na oficina — não pode ser entregue', v_v.nome;
  ELSIF v_v.estado_operacional = 'EM_USO' THEN
    SELECT c.nome INTO v_quem FROM public.veiculo_atribuicoes a JOIN public.colaboradores c ON c.id = a.colaborador_id
     WHERE a.veiculo_id = p_veiculo_id AND a.ate IS NULL;
    RAISE EXCEPTION '"%" já está em uso por % — registe a devolução primeiro', v_v.nome, COALESCE(v_quem, 'outro colaborador');
  END IF;

  SELECT * INTO v_c FROM public.colaboradores WHERE id = p_colaborador_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escolha o colaborador que vai conduzir';
  END IF;
  IF p_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.obras WHERE id = p_obra_id AND estado = 'ativa') THEN
    RAISE EXCEPTION 'A obra escolhida não está em execução';
  END IF;
  IF p_data IS NULL OR p_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da entrega não pode ser futura';
  END IF;
  IF p_km IS NULL OR p_km < 0 THEN
    RAISE EXCEPTION 'Indique os % atuais', CASE WHEN v_v.unidade_contador = 'horas' THEN 'horas' ELSE 'km' END;
  END IF;
  v_atual := public.km_atual_veiculo(p_veiculo_id);
  IF v_atual IS NOT NULL AND p_km < v_atual THEN
    RAISE EXCEPTION 'Os valores não podem ser inferiores ao último registado (%)', v_atual;
  END IF;

  INSERT INTO public.veiculo_entregas
    (veiculo_id, tipo, colaborador_id, obra_id, data, km, combustivel, adblue, oleo, refrigeracao, pneus, limpeza,
     inventario, danos, observacoes)
  VALUES
    (p_veiculo_id, 'ENTREGA', p_colaborador_id, p_obra_id, p_data, p_km, p_combustivel,
     COALESCE(p_adblue, 'NA'), COALESCE(p_oleo, 'NA'), COALESCE(p_refrigeracao, 'NA'), COALESCE(p_pneus, 'NA'), COALESCE(p_limpeza, 'NA'),
     COALESCE(p_inventario, '{}'), COALESCE(p_danos, '[]'), NULLIF(btrim(p_observacoes), ''))
  RETURNING id INTO v_id;

  PERFORM public.atribuir_condutor(p_veiculo_id, p_colaborador_id, p_data);
  UPDATE public.comb_veiculos SET estado_operacional = 'EM_USO', obra_atual_id = p_obra_id WHERE id = p_veiculo_id;

  RETURN v_id;
END;
$$;

-- Devolver uma viatura EM USO (opcionalmente já a mandar para a oficina)
CREATE OR REPLACE FUNCTION public.devolver_viatura(
  p_veiculo_id   uuid,
  p_data         date,
  p_km           numeric,
  p_combustivel  text,
  p_adblue       text,
  p_oleo         text,
  p_refrigeracao text,
  p_pneus        text,
  p_limpeza      text,
  p_inventario   jsonb,
  p_danos        jsonb,
  p_observacoes  text    DEFAULT NULL,
  p_para_oficina boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v       public.comb_veiculos%ROWTYPE;
  v_atrib   public.veiculo_atribuicoes%ROWTYPE;
  v_entrega public.veiculo_entregas%ROWTYPE;
  v_atual   numeric;
  v_id      uuid;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para registar devoluções';
  END IF;

  SELECT * INTO v_v FROM public.comb_veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura não encontrada ou arquivada';
  END IF;
  IF v_v.estado_operacional <> 'EM_USO' THEN
    RAISE EXCEPTION '"%" não está entregue a ninguém', v_v.nome;
  END IF;

  SELECT * INTO v_atrib FROM public.veiculo_atribuicoes WHERE veiculo_id = p_veiculo_id AND ate IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '"%" não tem condutor atribuído', v_v.nome;
  END IF;
  SELECT e.* INTO v_entrega FROM public.veiculo_entregas e
   WHERE e.veiculo_id = p_veiculo_id AND e.tipo = 'ENTREGA'
     AND NOT EXISTS (SELECT 1 FROM public.veiculo_entregas d WHERE d.entrega_ref = e.id)
   ORDER BY e.criado_em DESC LIMIT 1;

  IF p_data IS NULL OR p_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da devolução não pode ser futura';
  END IF;
  IF p_data < v_atrib.desde THEN
    RAISE EXCEPTION 'A devolução não pode ser anterior à entrega (%)', to_char(v_atrib.desde, 'DD/MM/YYYY');
  END IF;
  IF p_km IS NULL OR p_km < 0 THEN
    RAISE EXCEPTION 'Indique os % atuais', CASE WHEN v_v.unidade_contador = 'horas' THEN 'horas' ELSE 'km' END;
  END IF;
  v_atual := public.km_atual_veiculo(p_veiculo_id);
  IF v_atual IS NOT NULL AND p_km < v_atual THEN
    RAISE EXCEPTION 'Os valores não podem ser inferiores ao último registado (%)', v_atual;
  END IF;

  -- Entregas anteriores ao módulo novo podem não ter registo: a devolução aponta para a última entrega
  IF v_entrega.id IS NULL THEN
    INSERT INTO public.veiculo_entregas
      (veiculo_id, tipo, colaborador_id, data, km, combustivel, observacoes, criado_em)
    VALUES (p_veiculo_id, 'ENTREGA', v_atrib.colaborador_id, v_atrib.desde, LEAST(p_km, COALESCE(v_atual, p_km)), 'METADE',
            'Entrega anterior ao registo digital', v_atrib.desde::timestamptz)
    RETURNING * INTO v_entrega;
  END IF;

  INSERT INTO public.veiculo_entregas
    (veiculo_id, tipo, colaborador_id, obra_id, data, km, combustivel, adblue, oleo, refrigeracao, pneus, limpeza,
     inventario, danos, observacoes, entrega_ref, para_oficina)
  VALUES
    (p_veiculo_id, 'DEVOLUCAO', v_atrib.colaborador_id, v_v.obra_atual_id, p_data, p_km, p_combustivel,
     COALESCE(p_adblue, 'NA'), COALESCE(p_oleo, 'NA'), COALESCE(p_refrigeracao, 'NA'), COALESCE(p_pneus, 'NA'), COALESCE(p_limpeza, 'NA'),
     COALESCE(p_inventario, '{}'), COALESCE(p_danos, '[]'), NULLIF(btrim(p_observacoes), ''), v_entrega.id, COALESCE(p_para_oficina, false))
  RETURNING id INTO v_id;

  PERFORM public.atribuir_condutor(p_veiculo_id, NULL, p_data);
  UPDATE public.comb_veiculos
     SET estado_operacional = CASE WHEN COALESCE(p_para_oficina, false) THEN 'OFICINA' ELSE 'LIVRE' END,
         obra_atual_id = NULL
   WHERE id = p_veiculo_id;

  RETURN v_id;
END;
$$;

-- ── 3. Oficina ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.definir_estado_viatura(p_veiculo_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v public.comb_veiculos%ROWTYPE;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para alterar o estado da viatura';
  END IF;
  IF p_estado NOT IN ('LIVRE', 'OFICINA') THEN
    RAISE EXCEPTION 'Estado inválido: use a entrega para pôr uma viatura em uso';
  END IF;
  SELECT * INTO v_v FROM public.comb_veiculos WHERE id = p_veiculo_id AND ativo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura não encontrada ou arquivada';
  END IF;
  IF v_v.estado_operacional = 'EM_USO' THEN
    RAISE EXCEPTION '"%" está em uso — registe primeiro a devolução', v_v.nome;
  END IF;
  UPDATE public.comb_veiculos SET estado_operacional = p_estado WHERE id = p_veiculo_id;
END;
$$;

-- ── 4. Viaturas: registar, atualizar e arquivar ─────────────────────────────
CREATE OR REPLACE FUNCTION public.frota_guardar_viatura(
  p_id                 uuid,
  p_marca              text,
  p_modelo             text,
  p_tipo               text,
  p_identificacao      text,
  p_unidade_contador   text,
  p_tipo_combustivel   text,
  p_km_atual           numeric,
  p_data_ultima_revisao date,
  p_km_ultima_revisao  numeric,
  p_data_fim_seguro    date,
  p_seguro_foto_path   text,
  p_data_proxima_ipo   date,
  p_ipo_foto_path      text,
  p_observacoes        text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid := COALESCE(p_id, gen_random_uuid());
  v_nome  text;
  v_marca text := NULLIF(btrim(p_marca), '');
  v_mod   text := NULLIF(btrim(p_modelo), '');
  v_mat   text := NULLIF(btrim(p_identificacao), '');
  v_existe boolean;
BEGIN
  IF NOT (public.pode_escrever('frota') OR public.pode_escrever('combustivel')) THEN
    RAISE EXCEPTION 'Sem permissão para registar viaturas';
  END IF;
  IF v_marca IS NULL AND v_mod IS NULL THEN
    RAISE EXCEPTION 'Indique a marca e o modelo';
  END IF;
  IF p_unidade_contador NOT IN ('km', 'horas') THEN
    RAISE EXCEPTION 'Escolha km ou horas';
  END IF;
  IF p_km_atual IS NULL OR p_km_atual < 0 THEN
    RAISE EXCEPTION 'Indique os % atuais', CASE WHEN p_unidade_contador = 'horas' THEN 'horas' ELSE 'km' END;
  END IF;
  IF p_data_ultima_revisao IS NOT NULL AND p_data_ultima_revisao > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da última revisão não pode ser futura';
  END IF;
  IF p_km_ultima_revisao IS NOT NULL AND p_km_ultima_revisao > p_km_atual THEN
    RAISE EXCEPTION 'A leitura da última revisão não pode ser superior à atual';
  END IF;
  IF v_mat IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.comb_veiculos WHERE lower(btrim(identificacao)) = lower(v_mat) AND id <> v_id) THEN
    RAISE EXCEPTION 'Já existe uma viatura com a matrícula/identificação %', v_mat;
  END IF;

  v_nome := btrim(COALESCE(v_marca, '') || ' ' || COALESCE(v_mod, ''));
  SELECT EXISTS (SELECT 1 FROM public.comb_veiculos WHERE id = v_id) INTO v_existe;

  IF v_existe THEN
    UPDATE public.comb_veiculos SET
      nome = v_nome, marca = v_marca, modelo = v_mod, tipo = p_tipo, identificacao = v_mat,
      unidade_contador = p_unidade_contador, tipo_combustivel = p_tipo_combustivel,
      data_ultima_revisao = p_data_ultima_revisao, km_ultima_revisao = p_km_ultima_revisao,
      data_fim_seguro = p_data_fim_seguro, seguro_foto_path = p_seguro_foto_path,
      data_proxima_ipo = p_data_proxima_ipo, ipo_foto_path = p_ipo_foto_path,
      observacoes = NULLIF(btrim(p_observacoes), '')
     WHERE id = v_id;
  ELSE
    INSERT INTO public.comb_veiculos
      (id, nome, marca, modelo, tipo, identificacao, unidade_contador, tipo_combustivel, km_registo,
       data_ultima_revisao, km_ultima_revisao, data_fim_seguro, seguro_foto_path, data_proxima_ipo, ipo_foto_path, observacoes)
    VALUES
      (v_id, v_nome, v_marca, v_mod, p_tipo, v_mat, p_unidade_contador, p_tipo_combustivel, p_km_atual,
       p_data_ultima_revisao, p_km_ultima_revisao, p_data_fim_seguro, p_seguro_foto_path, p_data_proxima_ipo, p_ipo_foto_path,
       NULLIF(btrim(p_observacoes), ''));
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.frota_arquivar_viatura(p_veiculo_id uuid, p_arquivar boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v public.comb_veiculos%ROWTYPE;
BEGIN
  IF NOT (public.pode_escrever('frota') OR public.pode_escrever('combustivel')) THEN
    RAISE EXCEPTION 'Sem permissão para arquivar viaturas';
  END IF;
  SELECT * INTO v_v FROM public.comb_veiculos WHERE id = p_veiculo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura não encontrada';
  END IF;
  IF p_arquivar AND v_v.estado_operacional = 'EM_USO' THEN
    RAISE EXCEPTION '"%" está em uso — registe primeiro a devolução', v_v.nome;
  END IF;
  UPDATE public.comb_veiculos SET ativo = NOT p_arquivar WHERE id = p_veiculo_id;
END;
$$;

-- ── 5. Manutenção: edição com histórico ─────────────────────────────────────
ALTER TABLE public.veiculo_manutencoes
  ADD COLUMN IF NOT EXISTS editado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS editado_em  timestamptz;

CREATE TABLE IF NOT EXISTS public.veiculo_manutencao_edicoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  manutencao_id  uuid        NOT NULL REFERENCES public.veiculo_manutencoes(id) ON DELETE CASCADE,
  antes          jsonb       NOT NULL,
  depois         jsonb       NOT NULL,
  editado_por    uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  editado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manut_edicoes ON public.veiculo_manutencao_edicoes (manutencao_id, editado_em DESC);

ALTER TABLE public.veiculo_manutencao_edicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "frota_manut_edicoes_select" ON public.veiculo_manutencao_edicoes;
CREATE POLICY "frota_manut_edicoes_select" ON public.veiculo_manutencao_edicoes
  FOR SELECT TO authenticated USING (public.auth_role() <> 'motorista');
GRANT SELECT ON TABLE public.veiculo_manutencao_edicoes TO authenticated;
REVOKE ALL ON TABLE public.veiculo_manutencao_edicoes FROM anon;

-- Recalcula o último/próximo prazo de um item com base na manutenção mais recente
CREATE OR REPLACE FUNCTION public._recalcular_item_manutencao(p_veiculo_id uuid, p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m         public.veiculo_manutencoes%ROWTYPE;
  v_int_km    numeric;
  v_int_meses integer;
  v_fvi       uuid;
BEGIN
  IF p_item_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_m FROM public.veiculo_manutencoes
   WHERE veiculo_id = p_veiculo_id AND item_id = p_item_id AND atualiza_proxima
   ORDER BY data DESC, criado_em DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(fvi.intervalo_km, c.intervalo_km_padrao), COALESCE(fvi.intervalo_meses, c.intervalo_meses_padrao)
    INTO v_int_km, v_int_meses
    FROM public.frota_itens_catalogo c
    LEFT JOIN public.frota_veiculo_itens fvi ON fvi.item_id = c.id AND fvi.veiculo_id = p_veiculo_id
   WHERE c.id = p_item_id;

  UPDATE public.frota_veiculo_itens SET
    ultima_km    = v_m.km_na_altura,
    ultima_data  = v_m.data,
    proxima_km   = COALESCE(CASE WHEN v_int_km IS NOT NULL AND v_m.km_na_altura IS NOT NULL THEN v_m.km_na_altura + v_int_km END, proxima_km),
    proxima_data = COALESCE(CASE WHEN v_int_meses IS NOT NULL THEN (v_m.data + make_interval(months => v_int_meses))::date END, proxima_data),
    atualizado_por = auth.uid(), atualizado_em = now()
   WHERE veiculo_id = p_veiculo_id AND item_id = p_item_id
  RETURNING id INTO v_fvi;

  IF v_fvi IS NOT NULL THEN
    PERFORM public._avaliar_frota_item(v_fvi);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._recalcular_item_manutencao(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Última revisão da viatura = a manutenção mais recente de um item de revisão periódica
CREATE OR REPLACE FUNCTION public._atualizar_ultima_revisao(p_veiculo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.comb_veiculos v SET
    data_ultima_revisao = r.data,
    km_ultima_revisao   = COALESCE(r.km_na_altura, v.km_ultima_revisao)
   FROM (
     SELECT m.data, m.km_na_altura
       FROM public.veiculo_manutencoes m
       JOIN public.frota_itens_catalogo c ON c.id = m.item_id AND c.categoria = 'REVISAO_PERIODICA'
      WHERE m.veiculo_id = p_veiculo_id
      ORDER BY m.data DESC, m.criado_em DESC LIMIT 1
   ) r
  WHERE v.id = p_veiculo_id
$$;

REVOKE ALL ON FUNCTION public._atualizar_ultima_revisao(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._trg_manutencao_revisao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._atualizar_ultima_revisao(NEW.veiculo_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._trg_manutencao_revisao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_manutencao_revisao ON public.veiculo_manutencoes;
CREATE TRIGGER trg_manutencao_revisao
  AFTER INSERT OR UPDATE ON public.veiculo_manutencoes
  FOR EACH ROW EXECUTE FUNCTION public._trg_manutencao_revisao();

CREATE OR REPLACE FUNCTION public.editar_manutencao(
  p_id          uuid,
  p_item_id     uuid,
  p_descricao   text,
  p_data        date,
  p_km          numeric,
  p_custo       numeric,
  p_oficina     text,
  p_observacoes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes public.veiculo_manutencoes%ROWTYPE;
  v_depois public.veiculo_manutencoes%ROWTYPE;
BEGIN
  IF NOT public.pode_escrever('frota') THEN
    RAISE EXCEPTION 'Sem permissão para editar manutenções';
  END IF;
  SELECT * INTO v_antes FROM public.veiculo_manutencoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manutenção não encontrada';
  END IF;
  IF p_data IS NULL OR p_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da manutenção não pode ser futura';
  END IF;
  IF p_item_id IS NULL AND length(btrim(COALESCE(p_descricao, ''))) = 0 THEN
    RAISE EXCEPTION 'Escolha o tipo de manutenção ou descreva o trabalho';
  END IF;
  IF p_km IS NOT NULL AND p_km < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;
  IF p_custo IS NOT NULL AND p_custo < 0 THEN
    RAISE EXCEPTION 'Custo inválido';
  END IF;

  UPDATE public.veiculo_manutencoes SET
    item_id = p_item_id, descricao = NULLIF(btrim(p_descricao), ''), data = p_data, km_na_altura = p_km,
    custo = p_custo, oficina = NULLIF(btrim(p_oficina), ''), observacoes = NULLIF(btrim(p_observacoes), ''),
    editado_por = auth.uid(), editado_em = now()
   WHERE id = p_id
  RETURNING * INTO v_depois;

  INSERT INTO public.veiculo_manutencao_edicoes (manutencao_id, antes, depois)
  VALUES (p_id, to_jsonb(v_antes) - 'editado_por' - 'editado_em', to_jsonb(v_depois) - 'editado_por' - 'editado_em');

  PERFORM public._recalcular_item_manutencao(v_depois.veiculo_id, v_depois.item_id);
  IF v_antes.item_id IS DISTINCT FROM v_depois.item_id THEN
    PERFORM public._recalcular_item_manutencao(v_antes.veiculo_id, v_antes.item_id);
  END IF;
  PERFORM public._atualizar_ultima_revisao(v_depois.veiculo_id);
END;
$$;

-- ── 6. Lista, linha do tempo e histórico ────────────────────────────────────
DROP FUNCTION IF EXISTS public.frota_resumo_viaturas();

CREATE OR REPLACE FUNCTION public.frota_resumo_viaturas()
RETURNS TABLE (
  id uuid, codigo text, nome text, marca text, modelo text, identificacao text, tipo text, unidade_contador text,
  estado_operacional text, obra_id uuid, obra_nome text,
  km_atual numeric, condutor_id uuid, condutor_nome text, condutor_desde date,
  data_fim_seguro date, data_proxima_ipo date, data_ultima_revisao date,
  alertas_urgentes integer, alertas_atencao integer,
  ultimo_checklist_data date, ultimo_checklist_estado text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.id, v.codigo, v.nome, v.marca, v.modelo, v.identificacao, v.tipo, v.unidade_contador,
         v.estado_operacional, v.obra_atual_id, o.nome,
         public.km_atual_veiculo(v.id),
         at.colaborador_id, c.nome, at.desde,
         v.data_fim_seguro, v.data_proxima_ipo, v.data_ultima_revisao,
         COALESCE(al.urgentes, 0), COALESCE(al.atencao, 0),
         ck.data, ck.estado_geral
    FROM public.comb_veiculos v
    LEFT JOIN public.obras o ON o.id = v.obra_atual_id
    LEFT JOIN public.veiculo_atribuicoes at ON at.veiculo_id = v.id AND at.ate IS NULL
    LEFT JOIN public.colaboradores c ON c.id = at.colaborador_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE a.severidade = 'URGENTE')::int AS urgentes,
             count(*) FILTER (WHERE a.severidade = 'ATENCAO')::int AS atencao
        FROM public.alertas a
        JOIN public.regras_alerta r       ON r.id = a.regra_id AND r.tipo = 'FROTA_ITEM'
        JOIN public.frota_veiculo_itens f ON f.id = a.entidade_id
       WHERE f.veiculo_id = v.id AND a.estado IN ('ATIVO', 'RECONHECIDO')
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT data, estado_geral FROM public.veiculo_checklists
       WHERE veiculo_id = v.id ORDER BY data DESC, criado_em DESC LIMIT 1
    ) ck ON true
   WHERE v.ativo
   ORDER BY v.nome
$$;

REVOKE ALL     ON FUNCTION public.frota_resumo_viaturas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.frota_resumo_viaturas() TO authenticated;

-- Tudo o que aconteceu a uma viatura, do mais recente para o mais antigo
CREATE OR REPLACE FUNCTION public.frota_linha_tempo(p_veiculo_id uuid, p_limite integer DEFAULT 300)
RETURNS TABLE (quando timestamptz, tipo text, titulo text, detalhe text, leitura numeric, utilizador text, ref_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT v.created_at, 'REGISTO', 'Viatura registada',
           concat_ws(' · ', v.marca || ' ' || v.modelo, v.identificacao), v.km_registo, public._nome_utilizador(v.created_by), v.id
      FROM public.comb_veiculos v WHERE v.id = p_veiculo_id
    UNION ALL
    SELECT e.criado_em, e.tipo,
           CASE e.tipo WHEN 'ENTREGA' THEN 'Entregue a ' ELSE 'Devolvida por ' END || c.nome,
           concat_ws(' · ', o.nome, CASE WHEN e.para_oficina THEN 'seguiu para a oficina' END,
                     CASE WHEN jsonb_array_length(e.danos) > 0 THEN jsonb_array_length(e.danos) || ' dano(s) marcado(s)' END),
           e.km, public._nome_utilizador(e.criado_por), e.id
      FROM public.veiculo_entregas e
      JOIN public.colaboradores c ON c.id = e.colaborador_id
      LEFT JOIN public.obras o ON o.id = e.obra_id
     WHERE e.veiculo_id = p_veiculo_id
    UNION ALL
    SELECT m.criado_em, 'MANUTENCAO', COALESCE(i.rotulo, m.descricao),
           concat_ws(' · ', m.oficina, CASE WHEN m.custo IS NOT NULL THEN m.custo::text || ' €' END, m.observacoes),
           m.km_na_altura, public._nome_utilizador(m.criado_por), m.id
      FROM public.veiculo_manutencoes m
      LEFT JOIN public.frota_itens_catalogo i ON i.id = m.item_id
     WHERE m.veiculo_id = p_veiculo_id
    UNION ALL
    SELECT d.editado_em, 'EDICAO', 'Manutenção corrigida', NULL, NULL, public._nome_utilizador(d.editado_por), d.manutencao_id
      FROM public.veiculo_manutencao_edicoes d
      JOIN public.veiculo_manutencoes m ON m.id = d.manutencao_id
     WHERE m.veiculo_id = p_veiculo_id
    UNION ALL
    SELECT k.criado_em, 'CHECKLIST', 'Checklist — estado ' || k.estado_geral, k.observacoes, k.km_na_altura,
           public._nome_utilizador(k.criado_por), k.id
      FROM public.veiculo_checklists k WHERE k.veiculo_id = p_veiculo_id
    UNION ALL
    SELECT a.created_at, 'ABASTECIMENTO', 'Abastecimento ' || a.litros::text || ' L',
           concat_ws(' · ', a.custo_total::text || ' €', a.responsavel), a.contador, public._nome_utilizador(a.solicitante_id), a.id
      FROM public.comb_abastecimentos a WHERE a.veiculo_id = p_veiculo_id
  ) t(quando, tipo, titulo, detalhe, leitura, utilizador, ref_id)
  WHERE public.auth_role() <> 'motorista'
  ORDER BY quando DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 300), 1), 1000)
$$;

REVOKE ALL     ON FUNCTION public.frota_linha_tempo(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.frota_linha_tempo(uuid, integer) TO authenticated;

-- Histórico de manutenções de toda a frota, com quem registou e quem corrigiu
CREATE OR REPLACE FUNCTION public.frota_historico_manutencoes(
  p_veiculo_id uuid DEFAULT NULL, p_desde date DEFAULT NULL, p_ate date DEFAULT NULL, p_limite integer DEFAULT 500
) RETURNS TABLE (
  id uuid, veiculo_id uuid, veiculo_nome text, identificacao text, unidade_contador text,
  item_id uuid, item_rotulo text, descricao text, data date, km_na_altura numeric, custo numeric,
  oficina text, observacoes text, condutor_nome text,
  registado_por text, registado_em timestamptz, editado_por text, editado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.veiculo_id, v.nome, v.identificacao, v.unidade_contador,
         m.item_id, i.rotulo, m.descricao, m.data, m.km_na_altura, m.custo,
         m.oficina, m.observacoes, c.nome,
         public._nome_utilizador(m.criado_por), m.criado_em,
         CASE WHEN m.editado_em IS NOT NULL THEN public._nome_utilizador(m.editado_por) END, m.editado_em
    FROM public.veiculo_manutencoes m
    JOIN public.comb_veiculos v ON v.id = m.veiculo_id
    LEFT JOIN public.frota_itens_catalogo i ON i.id = m.item_id
    LEFT JOIN public.colaboradores c ON c.id = m.condutor_id
   WHERE public.auth_role() <> 'motorista'
     AND (p_veiculo_id IS NULL OR m.veiculo_id = p_veiculo_id)
     AND (p_desde IS NULL OR m.data >= p_desde)
     AND (p_ate   IS NULL OR m.data <= p_ate)
   ORDER BY m.data DESC, m.criado_em DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 500), 1), 2000)
$$;

REVOKE ALL     ON FUNCTION public.frota_historico_manutencoes(uuid, date, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.frota_historico_manutencoes(uuid, date, date, integer) TO authenticated;

-- Entregas e devoluções com os nomes (para a lista e o detalhe)
CREATE OR REPLACE FUNCTION public.frota_listar_entregas(p_veiculo_id uuid DEFAULT NULL, p_limite integer DEFAULT 300)
RETURNS TABLE (
  id uuid, veiculo_id uuid, veiculo_nome text, identificacao text, tipo text, colaborador_id uuid, colaborador_nome text,
  obra_id uuid, obra_nome text, data date, km numeric, combustivel text, adblue text, oleo text, refrigeracao text,
  pneus text, limpeza text, inventario jsonb, danos jsonb, observacoes text, entrega_ref uuid, para_oficina boolean,
  registado_por text, criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.veiculo_id, v.nome, v.identificacao, e.tipo, e.colaborador_id, c.nome,
         e.obra_id, o.nome, e.data, e.km, e.combustivel, e.adblue, e.oleo, e.refrigeracao,
         e.pneus, e.limpeza, e.inventario, e.danos, e.observacoes, e.entrega_ref, e.para_oficina,
         public._nome_utilizador(e.criado_por), e.criado_em
    FROM public.veiculo_entregas e
    JOIN public.comb_veiculos v ON v.id = e.veiculo_id
    JOIN public.colaboradores c ON c.id = e.colaborador_id
    LEFT JOIN public.obras o ON o.id = e.obra_id
   WHERE public.auth_role() <> 'motorista'
     AND (p_veiculo_id IS NULL OR e.veiculo_id = p_veiculo_id)
   ORDER BY e.criado_em DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 300), 1), 1000)
$$;

REVOKE ALL     ON FUNCTION public.frota_listar_entregas(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.frota_listar_entregas(uuid, integer) TO authenticated;

-- ── 7. Fotos do seguro e da IPO ─────────────────────────────────────────────
-- Caminho: viaturas/<viatura>/<seguro_|ipo_><n>.<ext>  (a viatura pode ainda não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('frota-docs', 'frota-docs', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.foto_frota_doc_valida(p_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.pode_escrever('frota') OR public.pode_escrever('combustivel'))
     AND p_nome ~ '^viaturas/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(seguro_|ipo_)[0-9]{1,16}\.(jpg|png|webp|heic|heif)$'
$$;

REVOKE ALL     ON FUNCTION public.foto_frota_doc_valida(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.foto_frota_doc_valida(text) TO authenticated;

DROP POLICY IF EXISTS "frota_docs_upload" ON storage.objects;
CREATE POLICY "frota_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frota-docs' AND public.foto_frota_doc_valida(name));

-- ── GRANTs das funções novas ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.entregar_viatura(uuid, uuid, uuid, date, numeric, text, text, text, text, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.devolver_viatura(uuid, date, numeric, text, text, text, text, text, text, jsonb, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_estado_viatura(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.frota_guardar_viatura(uuid, text, text, text, text, text, text, numeric, date, numeric, date, text, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.frota_arquivar_viatura(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.editar_manutencao(uuid, uuid, text, date, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_viatura(uuid, uuid, uuid, date, numeric, text, text, text, text, text, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_viatura(uuid, date, numeric, text, text, text, text, text, text, jsonb, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_estado_viatura(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frota_guardar_viatura(uuid, text, text, text, text, text, text, numeric, date, numeric, date, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frota_arquivar_viatura(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_manutencao(uuid, uuid, text, date, numeric, numeric, text, text) TO authenticated;
