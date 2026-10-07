-- =============================================================
-- ENCIVIL — Guardas da BD (Tarefa 14)
-- search_path: todas as SECURITY DEFINER já o têm fixo (teste
-- seguranca-guardas); nada a alterar aqui por esse motivo.
--
-- movimentos_stock: stock só por RPC atómica (registar_movimento,
-- SECURITY DEFINER, com advisory lock e audit log). O GRANT INSERT direto
-- a authenticated (20260611000001) e a policy movimentos_insert_admin_gestor
-- deixavam admin/gestor inserir movimentos sem atualizar stock_atual.
-- O site nunca insere diretamente (só lê); registar_movimento_armazem e
-- _lancar_fatura_impl passam por registar_movimento.
-- =============================================================

REVOKE INSERT ON public.movimentos_stock FROM authenticated;
DROP POLICY IF EXISTS "movimentos_insert_admin_gestor" ON public.movimentos_stock;

-- ROLLBACK
-- GRANT INSERT ON public.movimentos_stock TO authenticated;
-- CREATE POLICY "movimentos_insert_admin_gestor" ON public.movimentos_stock FOR INSERT TO authenticated
--   WITH CHECK (public.auth_role() IN ('admin', 'gestor'));
