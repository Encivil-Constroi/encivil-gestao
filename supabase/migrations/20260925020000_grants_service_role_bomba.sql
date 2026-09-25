-- ================================================================
-- ENCIVIL — GRANTs do papel de serviço nas tabelas da bomba Polo 2
--
-- "Automatically expose new tables" está OFF: o papel de serviço usado
-- pelas Edge Functions ignora RLS mas continua a precisar de privilégios.
-- Sem isto a Edge Function pump-status não grava o heartbeat nem lê
-- comandos e responde sempre "stop" (falha segura) — a bomba nunca ligaria.
--
-- APLICAR: SQL Editor do Supabase Dashboard
-- ================================================================

GRANT SELECT, INSERT, UPDATE ON TABLE public.pump_heartbeat TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pump_comandos  TO service_role;
-- Leitura da autorização + marcação de pump_activated_at (idempotente se já existir)
GRANT SELECT, UPDATE ON TABLE public.comb_abastecimentos_pendentes TO service_role;
