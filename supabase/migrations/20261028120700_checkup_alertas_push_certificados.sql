-- ================================================================
-- Checkup 2026-10-28 — lote BD-7: alertas, push e certificados
--   A4-08  alertas_detalhados: os alertas de EPI e de formação apontam para a
--          atribuição/formação (não para o colaborador) e saíam sem nome.
--   A4-10  registar_subscricao_push: o endpoint passa a ser do utilizador que o
--          regista (telemóvel partilhado deixava o push no utilizador anterior).
--   A2-03  push_subscriptions.endpoint só dos serviços de push conhecidos (SSRF cego
--          a partir das Edge Functions). Mesma regra que _shared/pushEndpoint.ts.
--   A4-13  bucket 'certificados' (privado) e policies: só admin/gestor carregam e leem.
-- Idempotente. APLICAR: SQL Editor do Supabase Dashboard, depois de 20261028120600.
-- Site novo com a BD antiga: o site chama a RPC e, se não existir, faz o upsert antigo.
-- ================================================================

-- ── A4-08 — nome do colaborador nos alertas de EPI e formação ───────────────
-- Mesmas colunas e pela mesma ordem; entidade_detalhe passa a dizer o EPI/formação.
CREATE OR REPLACE VIEW public.alertas_detalhados
WITH (security_invoker = on) AS
SELECT
  a.id,
  a.regra_id,
  a.entidade_id,
  a.estado,
  a.severidade,
  a.valor_atual,
  a.valor_limiar,
  a.criado_em,
  a.atualizado_em,
  a.reconhecido_por,
  a.reconhecido_em,
  a.resolvido_por,
  a.resolvido_em,
  r.tipo         AS regra_tipo,
  r.entidade_alvo,
  r.campo_ref,
  r.limiar_atencao,
  r.limiar_urgente,
  CASE r.entidade_alvo
    WHEN 'viatura'     THEN v.nome
    WHEN 'colaborador' THEN c.nome
    WHEN 'frota_item'  THEN fv.nome
    ELSE NULL
  END AS entidade_nome,
  CASE r.entidade_alvo
    WHEN 'viatura'     THEN v.identificacao
    WHEN 'frota_item'  THEN fc.rotulo
    WHEN 'colaborador' THEN COALESCE(te.designacao, tf.designacao)
    ELSE NULL
  END AS entidade_detalhe
FROM public.alertas a
JOIN public.regras_alerta r ON r.id = a.regra_id
LEFT JOIN public.comb_veiculos v
  ON v.id = a.entidade_id AND r.entidade_alvo = 'viatura'
-- Nos alertas de EPI/formação o entidade_id é a atribuição/formação, não o colaborador
LEFT JOIN public.atribuicoes_epi ae
  ON ae.id = a.entidade_id AND r.tipo = 'EPI_VALIDADE'
LEFT JOIN public.tipos_epi te ON te.id = ae.tipo_epi_id
LEFT JOIN public.formacoes_colaborador fo
  ON fo.id = a.entidade_id AND r.tipo = 'FORMACAO_VALIDADE'
LEFT JOIN public.tipos_formacao tf ON tf.id = fo.tipo_id
LEFT JOIN public.colaboradores c
  ON r.entidade_alvo = 'colaborador'
 AND c.id = COALESCE(ae.colaborador_id, fo.colaborador_id,
                     CASE WHEN r.tipo NOT IN ('EPI_VALIDADE', 'FORMACAO_VALIDADE') THEN a.entidade_id END)
LEFT JOIN public.frota_veiculo_itens fi
  ON fi.id = a.entidade_id AND r.entidade_alvo = 'frota_item'
LEFT JOIN public.comb_veiculos fv ON fv.id = fi.veiculo_id
LEFT JOIN public.frota_itens_catalogo fc ON fc.id = fi.item_id;

GRANT SELECT ON public.alertas_detalhados TO authenticated;
GRANT SELECT ON public.alertas_detalhados TO service_role;

-- security_invoker: a Edge enviar-resumo-alertas (papel de serviço) precisa de SELECT
-- nas tabelas novas da view (ignora a RLS mas não os GRANTs). Só as colunas lidas.
GRANT SELECT (id, colaborador_id, tipo_epi_id) ON public.atribuicoes_epi       TO service_role;
GRANT SELECT (id, colaborador_id, tipo_id)     ON public.formacoes_colaborador TO service_role;
GRANT SELECT (id, designacao)                  ON public.tipos_epi             TO service_role;
GRANT SELECT (id, designacao)                  ON public.tipos_formacao        TO service_role;

-- ── A2-03 — endpoint só dos serviços de push conhecidos ─────────────────────
-- Igual a endpointPermitido() em supabase/functions/_shared/pushEndpoint.ts: https,
-- sem porta nem utilizador, host exato (FCM, Mozilla) ou subdomínio (Mozilla, Apple, WNS).
-- NOT VALID: não verifica as linhas que já existem (as Edge Functions ignoram e apagam
-- as inválidas); vale para todos os INSERT/UPDATE a partir de agora.
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_https;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_https CHECK (
  endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)(/|$)'
) NOT VALID;

-- ── A4-10 — o endpoint é do utilizador que o regista neste dispositivo ──────
-- A policy de INSERT (auth.uid() = user_id) impede o upsert de mudar o dono de uma
-- linha de outro utilizador; esta RPC fá-lo, sempre para o próprio.
CREATE OR REPLACE FUNCTION public.registar_subscricao_push(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária para registar notificações' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_endpoint, '') = '' OR COALESCE(p_p256dh, '') = '' OR COALESCE(p_auth, '') = '' THEN
    RAISE EXCEPTION 'Subscrição de notificações incompleta' USING ERRCODE = '22023';
  END IF;

  -- O CHECK push_subscriptions_endpoint_https valida o endpoint
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 255))
  ON CONFLICT (endpoint) DO UPDATE
     SET user_id    = EXCLUDED.user_id,
         p256dh     = EXCLUDED.p256dh,
         auth       = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = now();
END;
$$;

REVOKE ALL     ON FUNCTION public.registar_subscricao_push(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registar_subscricao_push(text, text, text, text) TO authenticated;

-- ── A4-13 — bucket 'certificados' ───────────────────────────────────────────
-- Caminho gravado pelo site (formacoesService.uploadCertificado): <colaborador_id>/<Date.now()>.<ext>
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificados', 'certificados', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
   SET public             = false,
       file_size_limit    = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
       allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);

DROP POLICY IF EXISTS "certificados_insert" ON storage.objects;
CREATE POLICY "certificados_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certificados'
              AND public.auth_role() IN ('admin', 'gestor')
              AND name ~* '^[0-9a-f-]{36}/[0-9]+\.(pdf|jpe?g|png)$');

DROP POLICY IF EXISTS "certificados_select" ON storage.objects;
CREATE POLICY "certificados_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'certificados' AND public.auth_role() IN ('admin', 'gestor'));
-- Sem UPDATE/DELETE: um certificado carregado não se substitui nem apaga pelo site.

-- ROLLBACK
-- DROP POLICY IF EXISTS "certificados_select" ON storage.objects;
-- DROP POLICY IF EXISTS "certificados_insert" ON storage.objects;
-- -- (o bucket fica: apagá-lo perderia os certificados carregados)
-- DROP FUNCTION IF EXISTS public.registar_subscricao_push(text, text, text, text);
-- ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_https;
-- REVOKE SELECT (id, colaborador_id, tipo_epi_id) ON public.atribuicoes_epi       FROM service_role;
-- REVOKE SELECT (id, colaborador_id, tipo_id)     ON public.formacoes_colaborador FROM service_role;
-- REVOKE SELECT (id, designacao)                  ON public.tipos_epi             FROM service_role;
-- REVOKE SELECT (id, designacao)                  ON public.tipos_formacao        FROM service_role;
-- -- View anterior (20260929030000_fase9_frota.sql §13), com security_invoker:
-- CREATE OR REPLACE VIEW public.alertas_detalhados WITH (security_invoker = on) AS
-- SELECT a.id, a.regra_id, a.entidade_id, a.estado, a.severidade, a.valor_atual, a.valor_limiar,
--   a.criado_em, a.atualizado_em, a.reconhecido_por, a.reconhecido_em, a.resolvido_por, a.resolvido_em,
--   r.tipo AS regra_tipo, r.entidade_alvo, r.campo_ref, r.limiar_atencao, r.limiar_urgente,
--   CASE r.entidade_alvo WHEN 'viatura' THEN v.nome WHEN 'colaborador' THEN c.nome WHEN 'frota_item' THEN fv.nome ELSE NULL END AS entidade_nome,
--   CASE r.entidade_alvo WHEN 'viatura' THEN v.identificacao WHEN 'frota_item' THEN fc.rotulo ELSE NULL END AS entidade_detalhe
-- FROM public.alertas a
-- JOIN public.regras_alerta r ON r.id = a.regra_id
-- LEFT JOIN public.comb_veiculos v ON v.id = a.entidade_id AND r.entidade_alvo = 'viatura'
-- LEFT JOIN public.colaboradores c ON c.id = a.entidade_id AND r.entidade_alvo = 'colaborador'
-- LEFT JOIN public.frota_veiculo_itens fi ON fi.id = a.entidade_id AND r.entidade_alvo = 'frota_item'
-- LEFT JOIN public.comb_veiculos fv ON fv.id = fi.veiculo_id
-- LEFT JOIN public.frota_itens_catalogo fc ON fc.id = fi.item_id;
