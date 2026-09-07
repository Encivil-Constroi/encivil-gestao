-- Fase 0 — Módulo de Colaboradores
-- Pré-requisito de todas as fases HR (horários, picagens, faltas, EPIs, formações).

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome         text        NOT NULL,
  numero_mecan text        UNIQUE NOT NULL,
  nif          text,
  cargo        text        NOT NULL,
  obra_id      uuid        REFERENCES public.obras(id) ON DELETE SET NULL,
  user_id      uuid        REFERENCES auth.users(id)  ON DELETE SET NULL,
  ativo        boolean     NOT NULL DEFAULT true,
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer utilizador autenticado
DROP POLICY IF EXISTS "colab_select" ON public.colaboradores;
CREATE POLICY "colab_select" ON public.colaboradores
  FOR SELECT TO authenticated
  USING (true);

-- Escrita: admin e gestor — usa auth_role() (SECURITY DEFINER) em vez de auth.jwt() ->> 'role'
-- que retorna sempre 'authenticated' (papel Supabase interno, não o papel da app).
DROP POLICY IF EXISTS "colab_write" ON public.colaboradores;
CREATE POLICY "colab_write" ON public.colaboradores
  FOR ALL TO authenticated
  USING (public.auth_role() IN ('admin', 'gestor'))
  WITH CHECK (public.auth_role() IN ('admin', 'gestor'));

GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores TO authenticated;

-- Índices de pesquisa frequente
CREATE INDEX IF NOT EXISTS colaboradores_numero_mecan_idx ON public.colaboradores (numero_mecan);
CREATE INDEX IF NOT EXISTS colaboradores_ativo_idx        ON public.colaboradores (ativo);
CREATE INDEX IF NOT EXISTS colaboradores_obra_id_idx      ON public.colaboradores (obra_id);
