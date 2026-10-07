# Relatórios do CEO — desenho

Data: 2026-10-06 · Âmbito: `/relatorios` · Path: arquitetural (aprovação dispensada pelo utilizador)

## Objetivo
O CEO (António Baptista) tem de ver, num só sítio, o estado de **todos** os módulos, com números que
**batem certo** com os ecrãs de cada módulo e com ligação direta ao detalhe.

## Estado atual (verificado no código)
- `src/app/pages/ReportsPage.tsx` (2133 linhas): separadores Stock, Ferramentas, Obras, Combustível; cada um com
  PDF próprio copiado/colado. Fetch por `useEffect`+`useState` (viola o padrão `useAsync`).
- **Divergência de números**: o separador Obras calcula `materiais + subs executados + combustível`
  (`custosMateriaisCombustivelPorObra` + `listarSubempreiteirosComExecutado`). `obras_painel()` e
  `custos_consolidados_por_obra()` usam o custo **consolidado** (materiais, combustível, mão de obra, fornecedores,
  subempreiteiros certificados = executado − glosas). O CEO via dois totais diferentes para a mesma obra.
- Sem relatório de Frota, Subempreitadas (existe `subs_painel_ceo`), Pessoas/RH nem visão consolidada.
- Dados financeiros visíveis a qualquer papel que chegue ao ecrã (armazem, medicoes, leitura).
- Datas em buckets via `toISOString()` (UTC) — um movimento às 00:30 de Lisboa cai no dia anterior no verão.
- `resumo_assiduidade_dia` tem policy `SELECT USING (true)`: qualquer autenticado lê horas de todos. **Não alterado
  aqui** (migration em produção, fora do pedido); fica sinalizado para decisão do utilizador.

## Decisões
- **D1 Fonte de verdade das obras = `obras_painel()`** (via `listarPainel` de `features/obras`). O relatório não recalcula custo.
- **D2 Sem migration.** Tudo se faz com RPCs/serviços já existentes e tipados (`obras_painel`, `subs_painel_ceo`,
  `subs_fluxo_caixa`, `frota_resumo_viaturas`, `produtos_em_alerta`, alertas ativos, colaboradores, assiduidade).
  Zero risco em produção; rollback = `git revert`. RLS inalterada.
- **D3 Fronteiras**: a composição multi-módulo vive em `src/app/pages/relatorios/` (como `pages/armazem/`); lógica pura
  em `src/app/lib/relatorios/`. Nenhuma dependência nova entre `features/`.
- **D4 Acesso por separador**: Stock, Ferramentas, Combustível mantêm-se como hoje. **Visão Geral, Obras,
  Subempreitadas, Frota, Pessoas: só admin/gestor** (custos e RH). A segurança real continua a ser a RLS/RPC; a UI só esconde.
- **D5 Período único** na página (hoje/semana/mês/ano) com datas em `Europe/Lisbon`, partilhado pelos separadores com período.
- **D6 PDF**: um componente genérico `RelatorioImpressao` (KPIs + tabelas) para os separadores novos e Obras;
  os PDFs existentes de Stock/Ferramentas/Combustível ficam como estão (não reescrever o que funciona).
- **D7 Ligações**: cada KPI/linha da Visão Geral leva ao módulo (`/obras/:id`, `/frota`, `/alertas`, …).
- **D8 Resiliência**: cada separador carrega com `useAsync`; erro de um módulo não derruba os outros (Visão Geral usa
  `Promise.allSettled` e marca o bloco como "indisponível").

## Visão Geral (CEO) — conteúdo
KPIs: obras ativas, custo vs orçamento (margem), a pagar a subempreiteiros, viaturas imobilizadas/oficina,
artigos em alerta, ferramentas em atraso, alertas urgentes. Lista "Requer atenção" ordenada por gravidade, gerada
por função pura `construirAtencao()` a partir dos dados dos módulos.

## Critérios de aceite
1. Custo/orçamento/margem de cada obra no relatório = `obras_painel()` = ficha da obra.
2. Total a pagar/retido/glosado de subempreitadas = `subs_painel_ceo().totais`.
3. Estado da frota = `frota_resumo_viaturas()`.
4. Um módulo em erro não impede os restantes; estados loading/erro/vazio em todos os separadores.
5. `motorista`/`mecanico` continuam sem acesso (MainLayout); `armazem`/`medicoes`/`leitura` não veem separadores financeiros.
6. Datas por dia de Lisboa; testes de fronteira (23:30 UTC / 00:30 Lisboa).
7. typecheck 0 erros, `npm test` verde, build verde, validação no browser.

## Riscos
- `obras_painel` devolve todas as obras (incl. arquivadas?) → filtrar por `estado` na lógica pura e testar.
- Regressão dos 3 separadores mantidos → testes de render antes/depois do split.
- Rollback: reverter commit; nenhuma migração.
