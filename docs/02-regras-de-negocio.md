# Regras de Negócio — Controle Armazém ENCIVIL

---

## Produto

**RN-PROD-01** — Um produto tem sempre: código único, nome, categoria, unidade de medida, stock atual, stock mínimo e estado ativo/inativo.

**RN-PROD-02** — O código do produto é único no sistema e não pode ser reutilizado mesmo após desativação.

**RN-PROD-03** — O stock atual de um produto é **sempre** calculado pela soma algébrica dos movimentos associados. O campo `stock_atual` na tabela `produtos` é o valor em cache — deve ser atualizado atomicamente em cada movimento.

**RN-PROD-04** — Um produto ativo aparece na seleção de novos movimentos.

**RN-PROD-05** — Um produto desativado **não aparece** na seleção de novos movimentos.

**RN-PROD-06** — Um produto desativado **mantém** todo o histórico de movimentos associado.

**RN-PROD-07** — Produtos não são apagados fisicamente. A desativação é sempre lógica (`ativo = false`).

**RN-PROD-08** — Não é possível editar o stock atual diretamente. A correção é feita através de um movimento de ajuste.

---

## Categoria

**RN-CAT-01** — Categorias predefinidas no MVP: Agregados, Ligantes, Cerâmica, Tubagem, Ferramentas, Metais, Madeiras, Tintas e Vernizes, Outros.

**RN-CAT-02** — Um produto pertence obrigatoriamente a uma categoria.

**RN-CAT-03** — Gestão de categorias personalizadas: por confirmar no código (não documentada aqui).

---

## Unidade de Medida

**RN-UNID-01** — Unidades suportadas no MVP: tonelada (t), quilograma (kg), metro cúbico (m³), metro linear (ml), metro quadrado (m²), unidade (un), saco (sc), caixa (cx), litro (L), rolo (rl), paletes (pal).

**RN-UNID-02** — A unidade de medida de um produto não pode ser alterada após o primeiro movimento registado (imposto na BD desde `20261028120500`; o formulário bloqueia o campo).

---

## Stock Atual

**RN-STOCK-01** — O stock atual de um produto nunca pode ser inferior a zero no MVP.

**RN-STOCK-02** — Se uma saída for registada com quantidade superior ao stock disponível, a operação é bloqueada com mensagem: *"Stock insuficiente. Disponível: {stock_atual} {unidade}."*

**RN-STOCK-03** — O stock é atualizado de forma atómica com o registo do movimento (numa única transação).

---

## Stock Mínimo

**RN-STOCKMIN-01** — Cada produto tem um stock mínimo definido. O valor padrão é configurável nas Configurações.

**RN-STOCKMIN-02** — Stock baixo: `stock_atual <= stock_minimo` e `stock_atual > 0`.

**RN-STOCKMIN-03** — Sem stock: `stock_atual = 0`.

**RN-STOCKMIN-04** — O dashboard deve alertar visualmente para produtos em estado de stock baixo e sem stock.

---

## Movimento de Entrada

**RN-ENT-01** — A entrada soma a quantidade ao stock atual: `novo_stock = stock_atual + quantidade`.

**RN-ENT-02** — Campos obrigatórios: produto, quantidade, responsável.

**RN-ENT-03** — Campos opcionais: observação, referência de fornecedor.

**RN-ENT-04** — O destino/obra não é obrigatório para entradas.

---

## Movimento de Saída

**RN-SAI-01** — A saída subtrai a quantidade do stock atual: `novo_stock = stock_atual - quantidade`.

**RN-SAI-02** — Saída que resultaria em stock negativo é **bloqueada**.

**RN-SAI-03** — Campos obrigatórios: produto, quantidade, responsável, destino/obra.

**RN-SAI-04** — O destino/obra identifica para que obra ou cliente o material foi retirado.

**RN-SAI-05** — Campos opcionais: observação.

---

## Movimento de Ajuste

**RN-AJU-01** — O ajuste corrige o stock para o valor correto após contagem física ou erro detetado.

**RN-AJU-02** — O sistema regista a diferença (positiva ou negativa) entre o stock antes e o novo stock.

**RN-AJU-03** — Campos obrigatórios: produto, novo valor de stock (ou quantidade de diferença), responsável, observação (obrigatória para ajustes — deve explicar o motivo).

**RN-AJU-04** — Um ajuste pode resultar num stock inferior ao mínimo ou até a zero, mas não negativo.

---

## Histórico

**RN-HIST-01** — Cada movimento gera um registo imutável na tabela `movimentos_stock`.

**RN-HIST-02** — Registos de movimentos nunca são apagados fisicamente — nem por admin.

**RN-HIST-03** — Correções de registos errados fazem-se através de novo movimento de ajuste com observação explicativa.

**RN-HIST-04** — O histórico deve ser acessível mesmo para produtos desativados.

**RN-HIST-05** — Cada registo de histórico inclui: produto, tipo, quantidade, stock_antes, stock_depois, responsável, destino/obra, observação, data/hora.

---

## Relatórios

**RN-REL-01** — Todos os relatórios são calculados a partir de `movimentos_stock`. Nunca apenas de `produtos.stock_atual`.

**RN-REL-02** — O relatório diário mostra todos os movimentos do dia atual (00:00 a 23:59 Europe/Lisbon).

**RN-REL-03** — Relatórios por obra mostram o total de materiais consumidos (saídas) agrupado por produto.

**RN-REL-04** — Relatórios por categoria somam entradas e saídas de todos os produtos dessa categoria no período.

---

## Responsável

**RN-RESP-01** — O responsável é a pessoa física que executou o movimento.

**RN-RESP-02** — O responsável é registado como texto livre (nome), pré-preenchido automaticamente com o nome do utilizador autenticado (`useRole().nome`) mas editável — permite registar um movimento em nome de outro colega presente fisicamente no armazém.

**RN-RESP-03** — `created_by` (separado de `responsavel`) já associa o movimento ao utilizador autenticado que submeteu, para efeitos de auditoria — ver `docs/03-modelo-de-dados.md`.

---

## Destino/Obra

**RN-DEST-01** — O destino/obra identifica para onde o material foi (saída) ou de onde veio (entrada, opcional).

**RN-DEST-02** — No MVP, o destino/obra era texto livre. Hoje as saídas "para obra" escolhem uma obra cadastrada em execução (`obra_id`); o texto `destino_obra` continua obrigatório em todas as saídas.

**RN-DEST-03** — Implementado: obras são entidades (`obras`), ver `docs/19-obras.md`.

---

## Data e Hora

**RN-DATA-01** — A data e hora de cada movimento é registada automaticamente no momento da submissão.

**RN-DATA-02** — O timezone obrigatório é `Europe/Lisbon` (UTC+0 inverno, UTC+1 verão — WEST/WET).

**RN-DATA-03** — Não é permitido ao utilizador alterar a data e hora de um movimento após o registo.

---

## Atualizações até 2026-11-12

Fonte da verdade: `docs/00-source-of-truth.md`, `docs/17-armazem.md` e as migrations. Regras acrescentadas ou reforçadas:

**RN-MOV-01** — A porta do armazém é `registar_movimento_armazem`, com tipo detalhado: `COMPRA` (exige fornecedor ou ENCIVIL), `DEVOLUCAO_OBRA` (exige obra; limitada ao líquido enviado para essa obra), `PROPRIO_ENCIVIL`, `ACERTO` (entradas); `OBRA` (exige obra em execução), `VENDA` (exige cliente), `QUEBRA` (saídas); `INVENTARIO` (ajuste). Escrita: `pode_escrever('armazem')` (admin, gestor, armazém).

**RN-MOV-02** — Idempotência: cada movimento pode levar `client_id`; o reenvio da fila offline com o mesmo id devolve o movimento já gravado em vez de duplicar o stock.

**RN-MOV-03** — `movimentos_stock` recusa UPDATE, DELETE e TRUNCATE (trigger e privilégios), também ao dono da tabela. `produtos.stock_atual` e `produtos.codigo` não se gravam por INSERT/UPDATE direto: o artigo nasce a 0 (`criar_produto`) e o stock inicial entra como movimento de entrada na mesma transação.

**RN-CUSTO-01** — O custo de materiais de uma obra é saídas "para obra" menos devoluções (`DEVOLUCAO_OBRA`), em valor, por dia de Lisboa; vale igual em P&L, dashboard e custos consolidados. Venda comercial e quebra não contam como custo de obra.

**RN-FAT-01** — Fatura de fornecedor `LANCADA` é imutável (só dados fiscais e observações); lançar bloqueia a fatura (sem duplicar stock) e exige artigo e quantidade válidos nas linhas de armazém.

**RN-RH-01** — Picagens: idempotentes por `client_id` e `colaborador`; picagens atrasadas ficam `PENDENTE_VALIDACAO`, nunca são recusadas; horas efetivas calculadas no servidor (turnos noturnos incluídos). Faltas e assiduidade só visíveis a admin, gestor e ao próprio colaborador. Detalhe: `docs/12-plano-v3.md`.

**RN-ACESSO-01** — Conta nova nasce com o papel `leitura`; mudança de papel só pela RPC `promover_role` (ou pela Edge Function `admin-utilizadores`). Com `seguranca_config.mfa_obrigatorio` ligado, admin e gestor sem MFA ficam só de leitura na BD.
