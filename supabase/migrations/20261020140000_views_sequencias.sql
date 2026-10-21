-- View de alertas com os direitos de quem consulta (RLS das tabelas base passa a aplicar-se)
-- e USAGE na sequência dos códigos de produto (o DEFAULT de produtos.codigo chama nextval()).

ALTER VIEW public.alertas_detalhados SET (security_invoker = on);

GRANT USAGE ON SEQUENCE public.produto_codigo_seq TO authenticated;

-- A Edge Function enviar-resumo-alertas lê a view com o papel de serviço: com security_invoker
-- esse papel precisa de SELECT nas tabelas base (ignora a RLS mas não os GRANTs).
GRANT SELECT (id, nome) ON public.colaboradores TO service_role;

-- ROLLBACK
-- ALTER VIEW public.alertas_detalhados RESET (security_invoker);
-- REVOKE USAGE ON SEQUENCE public.produto_codigo_seq FROM authenticated;
-- REVOKE SELECT (id, nome) ON public.colaboradores FROM service_role;
