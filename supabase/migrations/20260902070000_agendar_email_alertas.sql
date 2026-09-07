-- ================================================================
-- Agendamento do email diário de alertas via pg_cron + pg_net
--
-- PRÉ-REQUISITOS:
--   1. pg_cron ativo (Dashboard → Database → Extensions)
--   2. pg_net  ativo (Dashboard → Database → Extensions → pg_net)
--   3. Edge Function publicada:
--      npx supabase functions deploy enviar-resumo-alertas
--   4. Segredos configurados (Dashboard → Edge Functions → Secrets):
--      RESEND_API_KEY, EMAIL_ALERTAS_DESTINATARIO, EDGE_FUNCTION_SECRET
--
-- Este script é envolto em blocos EXCEPTION para ser seguro mesmo que
-- pg_cron ou pg_net não estejam activos. Nesse caso emite NOTICE.
-- ================================================================

DO $outer$
BEGIN
  -- Agendar: todos os dias às 07:00 UTC (1h após avaliar_regras_alerta às 06:00)
  PERFORM cron.schedule(
    'enviar-email-alertas-diario',
    '0 7 * * *',
    $$
      SELECT net.http_post(
        url     := current_setting('app.supabase_url') || '/functions/v1/enviar-resumo-alertas',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.edge_function_secret')
        ),
        body    := '{}'::jsonb
      );
    $$
  );
  RAISE NOTICE 'Job enviar-email-alertas-diario agendado com sucesso.';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron/pg_net não disponíveis. Agendar manualmente: Dashboard → Edge Functions → enviar-resumo-alertas → Schedule (0 7 * * *).';
END;
$outer$;

-- ── Configurar variáveis de runtime ──────────────────────────────────────
-- Substituir pelos valores reais antes de executar:
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://wuruhxmbueeyhiqgvlxu.supabase.co';
--   ALTER DATABASE postgres SET app.edge_function_secret = 'SEU_SEGREDO_AQUI';
--
-- (O segredo deve ser igual ao EDGE_FUNCTION_SECRET configurado nos Secrets da Edge Function)
