-- Eventos de segurança da recuperação de acesso pelo administrador.
ALTER TABLE public.eventos_seguranca DROP CONSTRAINT IF EXISTS eventos_seguranca_tipo_check;
ALTER TABLE public.eventos_seguranca ADD CONSTRAINT eventos_seguranca_tipo_check CHECK (tipo IN (
  'login_ok','login_falhado','mfa_registado','mfa_removido','mfa_removido_admin','mfa_falhado','rate_limit',
  'link_recuperacao_admin','senha_redefinida_admin'));

-- ROLLBACK
-- DELETE FROM public.eventos_seguranca WHERE tipo IN ('link_recuperacao_admin','senha_redefinida_admin');
-- ALTER TABLE public.eventos_seguranca DROP CONSTRAINT IF EXISTS eventos_seguranca_tipo_check;
-- ALTER TABLE public.eventos_seguranca ADD CONSTRAINT eventos_seguranca_tipo_check CHECK (tipo IN (
--   'login_ok','login_falhado','mfa_registado','mfa_removido','mfa_removido_admin','mfa_falhado','rate_limit'));
