-- ENCIVIL — Limpeza de dados de teste (registos). Mantém cadastros e utilizadores.
-- Correr UMA vez no SQL Editor. Um único bloco: se algo falhar, nada é apagado.

DO $$
DECLARE
  registos text[] := ARRAY[
    'comb_abastecimentos', 'comb_abastecimentos_pendentes', 'pump_comandos', 'pump_heartbeat', 'pump_sessoes',
    'movimentos_stock', 'emprestimos_ferramentas',
    'auto_linhas', 'autos_medicao', 'liberacoes_retencao',
    'linhas_fatura', 'faturas_fornecedor', 'guias_transporte', 'registos_obra',
    'alertas', 'picagens', 'faltas', 'resumo_assiduidade_dia',
    'atribuicoes_epi', 'formacoes_colaborador', 'audit_log'
  ];
  existentes text;
BEGIN
  UPDATE public.produtos    SET stock_atual = 0            WHERE stock_atual <> 0;
  UPDATE public.ferramentas SET estado      = 'disponivel' WHERE estado = 'emprestada';

  -- Só tabelas que existem (módulos ocultos podem não ter migration aplicada).
  -- Sem CASCADE: se um cadastro dependesse destes registos, o Postgres recusava.
  SELECT string_agg(format('public.%I', t), ', ')
    INTO existentes
    FROM unnest(registos) AS t
   WHERE to_regclass('public.' || t) IS NOT NULL;

  EXECUTE 'TRUNCATE TABLE ' || existentes || ' RESTART IDENTITY';
  RAISE NOTICE 'Limpas: %', existentes;
END $$;

-- Verificação: registos a 0, cadastros intactos
SELECT 'abastecimentos'  AS tabela, count(*) FROM public.comb_abastecimentos
UNION ALL SELECT 'pendentes',          count(*) FROM public.comb_abastecimentos_pendentes
UNION ALL SELECT 'movimentos_stock',   count(*) FROM public.movimentos_stock
UNION ALL SELECT 'emprestimos',        count(*) FROM public.emprestimos_ferramentas
UNION ALL SELECT 'autos_medicao',      count(*) FROM public.autos_medicao
UNION ALL SELECT 'audit_log',          count(*) FROM public.audit_log
UNION ALL SELECT '— MANTIDOS —',       NULL
UNION ALL SELECT 'viaturas',           count(*) FROM public.comb_veiculos
UNION ALL SELECT 'produtos',           count(*) FROM public.produtos
UNION ALL SELECT 'produtos com stock', count(*) FROM public.produtos WHERE stock_atual <> 0
UNION ALL SELECT 'ferramentas',        count(*) FROM public.ferramentas
UNION ALL SELECT 'obras',              count(*) FROM public.obras
UNION ALL SELECT 'subempreiteiros',    count(*) FROM public.subempreiteiros
UNION ALL SELECT 'utilizadores',       count(*) FROM public.profiles;
