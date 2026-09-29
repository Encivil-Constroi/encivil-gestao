-- ================================================================
-- ENCIVIL — Fase 9 (1/2): papel 'mecanico'
--
-- Ficheiro próprio porque um valor novo de enum só pode ser usado depois
-- de a transação que o cria terminar — aplicar ANTES de 20260929030000.
-- O papel só escreve no módulo 'frota' (ver pode_escrever na migration seguinte).
--
-- APLICAR: SQL Editor do Supabase Dashboard (1.º de 2)
-- ================================================================

ALTER TYPE public.role_utilizador ADD VALUE IF NOT EXISTS 'mecanico';
