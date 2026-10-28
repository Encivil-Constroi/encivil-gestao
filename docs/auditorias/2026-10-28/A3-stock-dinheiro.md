# A3 — Stock e dinheiro

Cobri as RPCs vigentes (lidas da BD local `supabase_db_encivil-checkup` com `pg_get_functiondef`, policies, ACL e grants
de coluna): `registar_movimento`, `registar_movimento_armazem`, `_registar_movimento_stock`, `criar_produto`,
empréstimo/devolução de ferramentas, `lancar_fatura`/`classificar_e_aprender`, `criar_auto_rpc`, `substituir_linhas_auto`,
o fluxo do auto (`auto_submeter|verificar|aprovar|glosar|levantar_glosa|registar_fatura`, `marcar_auto_pago`),
`sub_libertar_retencao`, `_subs_metricas`, `subs_fluxo_caixa`, `custos_*` e `armazem_materiais_por_obra`. No frontend li os services
e hooks de movimentos, produtos, faturas, custos, contabilidade, autos (legacy e o atual), o dashboard de obras e as páginas
`armazem/*`, `ClassificarFaturaPage`, `AutoFormPage` e `ReportsPage` (relatório de stock).
**Não cobri:** o interior da Edge Function `extrair-fatura` (qualidade da extração por IA), o orçamento EAP das obras,
nem testes executados. Não abri a app nem corri concorrência real: as corridas descritas vêm da leitura do SQL vigente
(nível READ COMMITTED, ordem dos locks).

### A3-01 Lançar a mesma fatura duas vezes em paralelo duplica as entradas de stock
- Severidade: Alta
- Onde: `_lancar_fatura_impl` (corpo original em `supabase/migrations/20260917000000_fase6_faturas.sql:261-326`, renomeada por
  `20260929000000_seguranca_rpcs_storage.sql:76`); `src/features/faturas/components/ClassificarFaturaPage.tsx:362-371`
- Evidência: a função lê a fatura com `WHERE id = … AND estado = 'CLASSIFICADA'` **sem `FOR UPDATE`**. Depois percorre
  `linhas_fatura … AND lancado = false`, também sem lock. Cenário com as transações A e B no mesmo `p_fatura_id`:
  A lança a linha 1 (bloqueia o produto com o lock de `_registar_movimento_stock`). B lê a fatura (ainda CLASSIFICADA) e as linhas
  (ainda `lancado=false`, porque A não fez commit) e fica à espera do lock do produto. A faz commit. B recebe o lock, relê
  `stock_atual` (já com a entrada de A) e soma **outra vez** a quantidade. O `UPDATE linhas_fatura SET lancado=true` de B
  volta a casar com `WHERE id=…` e passa. Resultado: fatura com 10 sacos ⇒ +20 no stock, dois movimentos, sem erro.
  No ecrã há uma janela concreta para o duplo clique: `handleLancar` faz `confirm()` e depois
  `await import(...)` + `await supabase.auth.getUser()` **antes** de `lancarMut`. Durante esses awaits `lancando` ainda é
  `false` e o botão continua ativo, e não há `useFormGuard`. Também acontece com dois gestores ou dois separadores.
- Correção proposta: na RPC, `SELECT … FROM faturas_fornecedor WHERE id = p_fatura_id FOR UPDATE` e só depois validar
  `estado = 'CLASSIFICADA'` (ou um advisory lock por fatura). Na UI, envolver `handleLancar` em `useFormGuard`.
- Teste que prova: `faturas.test.mjs › "lançamento concorrente não duplica stock"`. Duas ligações PGlite/pg chamam `lancar_fatura`
  na mesma fatura; uma tem de falhar com "não está no estado CLASSIFICADA" e no fim tem de haver
  `count(movimentos_stock)=n.º de linhas ARMAZEM` e `stock_atual = inicial + qtd`.

### A3-02 O custo de materiais por obra dá dois números diferentes conforme o ecrã (devoluções ignoradas)
- Severidade: Alta
- Onde: `_custos_consolidados_por_obra_impl` (`20260917120000_fase7_custeio.sql:18-37`, vigente);
  `src/features/contabilidade/contabilidadeService.ts:45-79` (`exportarMateriais`); comparar com `custos_materiais_por_obra`
  (`20261001000000_armazem_completo.sql:176`)
- Evidência: `custos_materiais_por_obra`, usado no P&L, no dashboard e em `custoObra`, faz saídas − `DEVOLUCAO_OBRA`.
  `_custos_consolidados_por_obra_impl` (página de custos com período, `custoConsolidado`) soma só `m.tipo = 'saida'`.
  `exportarMateriais` (folha "Materiais" do fecho do mês para o contabilista) também filtra só `.eq('tipo','saida')`.
  Cenário: 100 sacos para a obra X a 5 € e 40 devolvidos. O P&L e o dashboard mostram 300 €. A página de custos consolidados
  e o export do contabilista mostram 500 €, sem nenhuma linha de devolução. O documento 17 diz que a devolução "desconta no
  custo de materiais da obra".
- Correção proposta: no `_impl`, usar `SUM(CASE WHEN tipo='saida' THEN q ELSE -q END)` com `(tipo='saida' OR subtipo='DEVOLUCAO_OBRA')`.
  Em `exportarMateriais`, incluir as devoluções com quantidade e custo negativos (ou com uma coluna "Tipo").
- Teste que prova: `custos.test.mjs › "custos consolidados descontam devoluções"`: saída 100 + devolução 40 ⇒
  `materiais = 60 × custo`, igual a `custos_materiais_por_obra`.

### A3-03 Totais de dinheiro e de stock truncados em silêncio pelo limite de 1000 linhas do PostgREST
- Severidade: Média (fica Alta quando o volume passa as 1000 linhas; o export anual e o P&L do CEO são os primeiros a falhar)
- Onde: `supabase/config.toml:18` (`max_rows = 1000`). Consultas sem paginação nem agregação no servidor:
  - `src/features/dashboard/hooks/useResumoObras.ts:23`: todos os `autos_medicao` → "custo real" e "margem" do CEO, e `autosPorValidar`;
  - `src/features/obras/legacy/subempreiteirosService.ts:109-114` (`listarSubempreiteirosComExecutado` sem obra) → P&L em `exportarPLObras`;
  - `src/features/contabilidade/contabilidadeService.ts:46,93,143,328`: exports de materiais, combustível, autos e faturas;
  - `src/app/pages/ReportsPage.tsx:1066-1068` → `listarMovimentos` (`movimentosService.ts:51`) sem `limit`, período "ano";
  - `armazem_materiais_por_obra` (RPC SETOF **sem `ORDER BY`**), que corta pares obra×artigo arbitrários → `ObrasArmazemPage`, `obrasComMaisMaterial`;
  - `listarArtigosArmazem` / `listarProdutos` (`armazemService.ts:33`, `produtosService.ts:37`) → combobox, inventário e `valorStock`.
- Evidência: o PostgREST devolve no máximo 1000 linhas sem erro nem cabeçalho de aviso, e o código não pede `count`.
  Cenário: 1 200 autos validados ⇒ `executado` soma só 1000 e a margem global sobe. Um mês com 1 300 saídas ⇒ a folha "Materiais"
  sai com 1000 linhas e o contabilista não tem forma de o saber. Nos movimentos do ano (ordem desc) os meses mais antigos aparecem a zero no gráfico.
  Com mais de 1000 artigos ativos, os restantes nem se conseguem escolher numa saída.
- Correção proposta: agregar no servidor (RPC `SUM … GROUP BY` para o P&L e para o executado) e paginar os exports com
  `.range()` em ciclo até esgotar (ou usar `count:'exact'` e falhar se `count > linhas`). Na RPC de materiais por obra, `ORDER BY` + filtro por obra.
- Teste que prova: Vitest `contabilidadeService › "exporta todas as linhas quando há mais de 1000"` (mock do cliente
  com 2 páginas ⇒ 1500 linhas). Teste de BD `custos.test.mjs` para a nova RPC de executado: 1500 autos ⇒ soma exata.

### A3-04 Lançamento de fatura: linhas ARMAZEM sem artigo saltadas, classificação do ecrã ignorada e erros nunca mostrados
- Severidade: Média
- Onde: `_lancar_fatura_impl` (filtro `artigo_id IS NOT NULL`); `ClassificarFaturaPage.tsx:157-158, 321-329, 362-371`
- Evidência: (a) a RPC ignora em silêncio as linhas `destino='ARMAZEM' AND artigo_id IS NULL` e passa a fatura a `LANCADA`.
  Como `classificar_e_aprender` só muda o estado de `EXTRAIDA|CLASSIFICADA`, a linha nunca mais entra em stock e também não conta
  nos custos (só OBRA/SERVICO contam). A UI só mostra um aviso amarelo: `canLancar` não bloqueia. (b) `canLancar` avalia os
  `states` locais, não o que está gravado. Quem muda uma linha para ARMAZEM+artigo e carrega logo em "Lançar" sem "Guardar" lança a
  classificação antiga. (c) `guardarMut`/`lancarMut` nunca expõem `error` (`useMutation` não faz toast e a página não o renderiza).
  Uma falha (ex.: linha com quantidade ≤ 0 extraída pela IA ⇒ violação de `ck_quantidade_positiva`) não mostra nada:
  o botão volta a ficar ativo e o utilizador não sabe se lançou.
- Correção proposta: na RPC, `RAISE` se houver linhas ARMAZEM sem artigo (ou DESCONHECIDO). Na UI, desativar "Lançar" com alterações
  por guardar ou com `nArmazemSemArtigo > 0`, e mostrar `error` (toast) das duas mutações.
- Teste que prova: BD `faturas.test.mjs › "não lança com linha ARMAZEM sem artigo"` (espera erro e estado continua CLASSIFICADA).
  Vitest `ClassificarFaturaPage › "mostra o erro do lançamento"`.

### A3-05 Fatura já lançada continua editável e pode voltar a ser lançada
- Severidade: Média
- Onde: `_classificar_e_aprender_impl` (`20260917000000_fase6_faturas.sql:182-250`); policies `faturas_update` e `linhas_update`
  (só `auth_role() IN ('admin','gestor')`, sem condição de estado nem colunas)
- Evidência: `classificar_e_aprender` faz `UPDATE linhas_fatura SET destino, artigo_id …` sem verificar o estado da fatura e sem
  verificar `fatura_id = p_fatura_id` (aceita ids de linhas de outra fatura). Depois de LANCADA, uma linha ARMAZEM já em stock pode
  passar a OBRA e entra também em "fornecedores" no custo consolidado (custo contado duas vezes). Pela API REST, um gestor pode ainda fazer
  `PATCH faturas_fornecedor {estado:'CLASSIFICADA'}` + `PATCH linhas_fatura {lancado:false}` e chamar `lancar_fatura` de novo ⇒
  entradas de stock em duplicado. `linhas_fatura` não tem trigger de auditoria. A UI só fica `readonly` no cliente (linha 153).
- Correção proposta: trigger em `linhas_fatura`/`faturas_fornecedor` que recuse alterações quando `estado='LANCADA'` (exceto pela
  própria RPC, com flag de sessão como `app.auto_rpc`). Em `_classificar_e_aprender_impl`, exigir `estado IN ('EXTRAIDA','CLASSIFICADA')`
  e `fatura_id = p_fatura_id`.
- Teste que prova: `faturas.test.mjs › "fatura LANCADA é imutável"`. Como gestor, o `UPDATE linhas_fatura SET lancado=false` e o
  `classificar_e_aprender` numa fatura LANCADA têm de lançar erro.

### A3-06 Stock e unidade do artigo alteráveis fora dos movimentos
- Severidade: Média
- Onde: grants de coluna em `produtos` (INSERT inclui `stock_atual`); policy `produtos_insert_rbac`; `produtosService.ts:104-125`
  (`criarProdutoSemRpc`); `ProdutoFormPage.tsx:200-201`
- Evidência: `authenticated` tem `INSERT (…, stock_atual, …)` em `produtos`. Qualquer papel com `pode_escrever('armazem')` faz
  `POST /produtos {stock_atual: 500}` e cria stock **sem movimento** (viola RN-PROD-03/08). Os relatórios a partir de
  `movimentos_stock` deixam de bater com `stock_atual`. O fallback `criarProdutoSemRpc` faz exatamente isso. A `unidade` está em
  `UPDATE` e o formulário de edição deixa mudá-la depois de haver movimentos (RN-UNID-02). Exemplo: 2 000 "kg" passam a ler-se como
  2 000 "t", e o `custo_unitario` multiplica sobre a unidade nova em todos os custos históricos.
- Correção proposta: `REVOKE INSERT (stock_atual) ON produtos FROM authenticated` (ou um `CHECK`/trigger `stock_atual = 0` no INSERT pela API)
  e retirar o fallback. Um trigger que recuse mudar `unidade` quando existam movimentos, e desativar o campo na edição.
- Teste que prova: `armazem.test.mjs › "INSERT direto não cria stock"` (como `armazem`, `INSERT … stock_atual=5` falha ou fica 0)
  e `"unidade imutável após movimento"`.

### A3-07 `lancar_fatura` nunca liga o movimento à linha e perde dados da compra
- Severidade: Baixa
- Onde: `_lancar_fatura_impl` (`20260917000000_fase6_faturas.sql:282, 293-315`)
- Evidência: `v_inicio := clock_timestamp()` é tirado depois do início da transação, mas `movimentos_stock.created_at` tem `DEFAULT now()`
  (início da transação), por isso `created_at >= v_inicio` nunca é verdade e `linhas_fatura.movimento_id` fica sempre NULL
  (rastreabilidade perdida). Além disso: a quantidade NULL entra como 1 (`COALESCE(quantidade,1)`) e a descrição da linha (`obs`) é
  calculada mas não usada. O movimento sai sem `subtipo='COMPRA'`, `fornecedor`, `numero_fatura` nem `preco_unitario`, por isso o
  `custo_unitario` do artigo não é atualizado pelas faturas (só pela entrada manual COMPRA).
- Correção proposta: usar `registar_movimento_armazem`/`_registar_movimento_stock` com subtipo COMPRA e guardar o `id` devolvido
  (`v_mov := …; UPDATE … movimento_id = v_mov.id`). Recusar a quantidade NULL.
- Teste que prova: `faturas.test.mjs › "lançar liga movimento_id e grava COMPRA"` (`movimento_id IS NOT NULL`, `subtipo='COMPRA'`).

### A3-08 Retenção calculada em JS diverge 1 cêntimo da calculada no SQL
- Severidade: Baixa
- Onde: `src/features/obras/lib/medicao.ts:6-19` (`arred2`, `retencao`) vs `round(cert * pct / 100, 2)` em `marcar_auto_pago`,
  `sub_libertar_retencao`, `_subs_metricas` e `subs_fluxo_caixa`
- Evidência: `arred2(21.35 * 10 / 100)` = 2.13 (o float 2.1349999…), enquanto o Postgres `round(2.135, 2)` = 2.14. Outros casos:
  21.75/10 %, 23.85/10 %, 29.00/7,5 %. O "Valor retido/Líquido" da folha "Autos" do contabilista e o ecrã ficam 1 cêntimo diferentes do
  valor pago registado no `audit_log` e da retenção disponível para libertar.
- Correção proposta: arredondar em cêntimos inteiros (`Math.round(cert*100*pct/100)/100` com `cert` já em cêntimos) ou passar a usar os
  valores calculados pelo servidor.
- Teste que prova: Vitest `medicao.test.ts › "retencao(21.35, 10) === 2.14"`.

### A3-09 Custos consolidados cortam os dias em UTC, não em Europe/Lisbon
- Severidade: Baixa
- Onde: `_custos_consolidados_por_obra_impl` (`m.created_at::date`, `p_data_fim DEFAULT CURRENT_DATE`); BD com `timezone = UTC`
- Evidência: uma saída a 01/07 às 00:30 em Lisboa (30/06 23:30 UTC) conta em junho no filtro de período. O `CURRENT_DATE` por defeito
  falha o dia de hoje entre as 00:00 e a 01:00 de verão. O export do contabilista (`limitesLisboa`) já usa Lisboa, por isso os dois divergem.
- Correção proposta: `(m.created_at AT TIME ZONE 'Europe/Lisbon')::date` e `public._hoje_pt()` como valor por defeito.
- Teste que prova: `custos.test.mjs › "saída às 23:30 UTC de 30/06 conta em julho"`.

### A3-10 Contagem de inventário: regras documentadas não impostas no servidor
- Severidade: Baixa
- Onde: `registar_movimento_armazem` (`20261020110000_armazem_integridade.sql:127`); `docs/17-armazem.md:26`; `MovimentoFormPage.tsx:34-37`
- Evidência: o doc 17 e a UI limitam INVENTARIO a admin/gestor, mas a RPC só pede `pode_escrever('armazem')`. O papel `armazem` fixa o
  stock pela API, e o próprio `supabase/tests/armazem.test.mjs:111` faz isso com `armazem`. RN-AJU-03 exige observação nos ajustes, mas
  `p_observacoes` é opcional. RN-AJU-04 admite ajuste a 0, mas `ck_quantidade_positiva` impede-o (a UI manda usar "Quebra").
  O impacto é limitado: `armazem` já mexe no stock com ACERTO/QUEBRA.
- Correção proposta: decidir a regra. Se for admin/gestor, `IF p_subtipo='INVENTARIO' AND auth_role() NOT IN ('admin','gestor') THEN RAISE`
  e exigir observação. Senão, corrigir o doc 17 e a UI.
- Teste que prova: `armazem.test.mjs › "INVENTARIO recusado a armazem"` / `"INVENTARIO sem observação recusado"`.

### A3-11 Libertação de retenção pode ser apagada sem rasto
- Severidade: Baixa
- Onde: policy `liberacoes_retencao_delete` (`20260902160000_fase1_retencao_pagamento.sql:70`); `legacy/retencaoService.ts:66-68`
- Evidência: o admin apaga por REST uma linha de `liberacoes_retencao` (dinheiro já entregue ao subempreiteiro). A tabela não tem
  trigger `audit_delete` (os autos têm `trg_audit_del_autos`). O "retido disponível" volta a subir e pode ser libertado outra vez sem registo do apagamento.
- Correção proposta: trigger `audit_delete` em `liberacoes_retencao`, ou trocar o DELETE por um estorno (linha negativa).
- Teste que prova: `subempreitadas.test.mjs › "apagar libertação fica no audit_log"`.

### A3-12 Custo de obra recalculado retroativamente com o custo unitário atual
- Severidade: Baixa
- Onde: `custos_materiais_por_obra`, `armazem_materiais_por_obra`, `_custos_consolidados_por_obra_impl`, `exportarMateriais`
- Evidência: todos multiplicam as quantidades históricas pelo `produtos.custo_unitario` de hoje, que muda a cada COMPRA com preço.
  Uma obra concluída em março vê o custo de materiais mudar em outubro quando se compra cimento mais caro. O fecho de um mês já entregue
  ao contabilista deixa de ser reproduzível. Está documentado ("o preço passa a ser o custo do artigo"), mas não é custo histórico.
- Correção proposta: gravar o custo em vigor em cada saída (coluna `custo_unitario` no movimento, preenchida pela RPC) e somar essa.
- Teste que prova: `custos.test.mjs › "nova compra não altera custo de saídas anteriores"`.

### A3-13 `custos_materiais_por_obra` executável por PUBLIC/anon
- Severidade: Baixa
- Onde: ACL `{=X/postgres, anon=X/postgres, …}` (a migration `20261001000000_armazem_completo.sql:199` faz GRANT mas nunca `REVOKE … FROM PUBLIC, anon`)
- Evidência: a função é `SECURITY INVOKER` e o `anon` não tem SELECT em `movimentos_stock`, por isso a chamada falha. Não há fuga hoje,
  mas é a única RPC de custos sem o REVOKE que o resto aplica.
- Correção proposta: `REVOKE ALL ON FUNCTION public.custos_materiais_por_obra() FROM PUBLIC, anon;`
- Teste que prova: `seguranca.test.mjs › "anon não executa custos_materiais_por_obra"` (`has_function_privilege('anon', …) = false`).

## Verificado e OK
- `_registar_movimento_stock`: `FOR UPDATE` no produto ativo. Saída bloqueada se `quantidade > stock_atual`. `ck_quantidade_positiva`,
  `ck_stock_depois_nao_negativo`, `ck_destino_obrigatorio_saida`. O trigger `movimentos_stock_imutavel` (UPDATE/DELETE) existe e não há
  policy de UPDATE/DELETE. Um produto inativo é recusado e não aparece em `listarArtigosArmazem`.
- `registar_movimento_armazem`: idempotência por `client_id` com advisory lock + índice único. Obra obrigatória e ativa em OBRA. A
  devolução é limitada ao líquido enviado, com lock no produto. Sem obra noutros subtipos. O frontend usa `useFormGuard` e reaproveita o `clientId` depois de erro.
- Ferramentas: empréstimo com `FOR UPDATE` + índice único `uq_emprestimo_ativo_ferramenta`. Devolução com `FOR UPDATE` no empréstimo e
  recusa de devolução dupla. `emprestimos_ferramentas` sem grant de UPDATE.
- Autos: `criar_auto_rpc` com advisory lock + `uq_autos_medicao_sub_numero`. `auto_submeter` com lock por contrato, preço = contrato,
  acumulado ≤ previsto, soma das linhas = valor (±0,01), global ≤ 100 %. `auto_aprovar` com alçada, extras só admin, separação de
  funções, `FOR UPDATE`. `marcar_auto_pago`/`auto_registar_fatura`/`auto_glosar`/`auto_levantar_glosa` com `FOR UPDATE` e estado
  verificado. `ck_auto_glosado` (glosa ≤ período). Triggers de imutabilidade do auto e das linhas fora do rascunho.
- `sub_libertar_retencao`: `FOR UPDATE` no contrato e limite de retido − libertado (sem corrida).
- `_subs_metricas`/`subs_fluxo_caixa`: arredondamento por auto, `pago` e `por_pagar` coerentes com `marcar_auto_pago`.
- RLS ligada em `faturas_fornecedor`, `linhas_fatura` e `regras_classificacao` (o `anon` tem grants de tabela, mas nenhuma policy o deixa passar).
  `lancar_fatura`/`classificar_e_aprender` com guarda admin/gestor e `_impl` sem EXECUTE para `authenticated`.
- Exports de contabilidade: limites de dia em Europe/Lisbon (`limitesLisboa`) nas colunas `timestamptz`, e `lte` inclusivo nas colunas DATE.
