-- supabase/migrations/20260916120000_fase3_picagens.sql
-- Fase 3 — Picagem de Presenças MVP

CREATE TABLE IF NOT EXISTS public.picagens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id        uuid NOT NULL REFERENCES colaboradores(id),
  obra_id               uuid NOT NULL REFERENCES obras(id),
  tipo                  text NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA','PAUSA_INI','PAUSA_FIM')),
  timestamp_dispositivo timestamptz NOT NULL,
  timestamp_servidor    timestamptz DEFAULT now(),
  desvio_relogio_s      int,
  resultado             text NOT NULL DEFAULT 'PENDENTE_VALIDACAO'
                        CHECK (resultado IN ('PENDENTE_VALIDACAO','AUTORIZADA','RECUSADA')),
  origem                text NOT NULL DEFAULT 'ONLINE'
                        CHECK (origem IN ('ONLINE','OFFLINE','RETROATIVA')),
  hora_original_proposta timestamptz,
  hora_final_validada   timestamptz,
  justificacao          text,
  validada_por          uuid REFERENCES auth.users(id),
  validada_em           timestamptz
);

-- Índices de suporte às consultas mais frequentes
CREATE INDEX IF NOT EXISTS idx_picagens_colab_data ON picagens(colaborador_id, timestamp_dispositivo);
CREATE INDEX IF NOT EXISTS idx_picagens_obra_data  ON picagens(obra_id, timestamp_dispositivo);

ALTER TABLE public.picagens ENABLE ROW LEVEL SECURITY;

-- Colaborador vê as suas próprias picagens; gestor/admin vê todas
DROP POLICY IF EXISTS "picagens_sel"    ON picagens;
DROP POLICY IF EXISTS "picagens_insert" ON picagens;
DROP POLICY IF EXISTS "picagens_update" ON picagens;

CREATE POLICY "picagens_sel" ON picagens FOR SELECT TO authenticated
  USING (
    colaborador_id IN (SELECT id FROM colaboradores WHERE user_id = auth.uid())
    OR public.auth_role() IN ('admin', 'gestor')
  );

-- Qualquer autenticado pode inserir
CREATE POLICY "picagens_insert" ON picagens FOR INSERT TO authenticated
  WITH CHECK (true);

-- Apenas gestor/admin podem atualizar (validação, correção de hora)
CREATE POLICY "picagens_update" ON picagens FOR UPDATE TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT ON TABLE public.picagens TO authenticated;
GRANT UPDATE ON TABLE public.picagens TO authenticated;
