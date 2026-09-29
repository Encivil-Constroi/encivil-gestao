-- ================================================================
-- ENCIVIL — Fase 9 (3/3): envio diário dos alertas da frota
--
-- Tudo por SQL, sem copiar segredos entre o Dashboard e o código:
--   • o segredo que autoriza a chamada é gerado aqui e fica numa tabela
--     de um schema que a API não expõe (privado);
--   • a Edge Function send-push-frota confirma-o com frota_push_autorizado()
--     (só o papel de serviço executa);
--   • o pg_cron chama a função todos os dias às 07:00 UTC (08:00 em Lisboa
--     no verão, 07:00 no inverno) via pg_net, com o segredo no cabeçalho.
--
-- APLICAR: SQL Editor, depois de 20260929030000_fase9_frota.sql.
-- Idempotente: aplicar outra vez não muda o segredo nem duplica o agendamento.
-- ================================================================

CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon, authenticated;

-- Uma só linha (id = true)
CREATE TABLE IF NOT EXISTS privado.frota_push (
  id       boolean PRIMARY KEY DEFAULT true CHECK (id),
  segredo  text    NOT NULL CHECK (length(segredo) >= 32)
);
REVOKE ALL ON TABLE privado.frota_push FROM PUBLIC, anon, authenticated;
-- Sem políticas: ninguém da app lê. frota_push_autorizado() e o pg_cron correm
-- como dono da tabela, que não está sujeito à RLS.
ALTER TABLE privado.frota_push ENABLE ROW LEVEL SECURITY;

-- 64 caracteres hex de gen_random_uuid() (gerador criptográfico do Postgres)
INSERT INTO privado.frota_push (segredo)
VALUES (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.frota_push_autorizado(p_segredo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM privado.frota_push
     WHERE p_segredo IS NOT NULL AND length(p_segredo) >= 32 AND segredo = p_segredo
  )
$$;

REVOKE ALL     ON FUNCTION public.frota_push_autorizado(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.frota_push_autorizado(text) TO service_role;

-- Extensões e agendamento: cada passo à parte, para que a falta de uma
-- extensão não impeça o resto (e para correr no banco de testes, que não as tem)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_net não ativado: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron não ativado: %', SQLERRM;
END $$;

-- Um nome de job repetido substitui o anterior (não duplica).
-- URL e chave pública do projeto: públicas por natureza (estão no site).
DO $outer$
BEGIN
  PERFORM cron.schedule(
    'enviar-push-frota',
    '0 7 * * *',
    $cmd$
      SELECT net.http_post(
        url     := 'https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/send-push-frota',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'apikey',         'sb_publishable_b2Zjbv0hhxxORNxjemsGZA_bMtFaDJa',
          'x-frota-secret', (SELECT segredo FROM privado.frota_push)
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
    $cmd$
  );
  RAISE NOTICE 'Agendado: enviar-push-frota, todos os dias às 07:00 UTC.';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Agendamento não criado (pg_cron/pg_net em falta): %', SQLERRM;
END;
$outer$;
