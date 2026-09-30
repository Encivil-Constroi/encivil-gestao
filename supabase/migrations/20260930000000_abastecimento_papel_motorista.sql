-- ================================================================
-- ENCIVIL — Abastecimento v2 (1/2): papel 'motorista'
--
-- Ficheiro próprio porque um valor novo de enum só pode ser usado depois
-- de a transação que o cria terminar — aplicar ANTES de 20260930010000.
-- O motorista não escreve em nenhum módulo; pede abastecimentos para si
-- próprio (regra na migration seguinte) e o site só lhe mostra isso.
--
-- APLICAR: SQL Editor do Supabase Dashboard (1.º de 2)
-- ================================================================

ALTER TYPE public.role_utilizador ADD VALUE IF NOT EXISTS 'motorista';
