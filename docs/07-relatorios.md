# Relatórios — Controle Armazém ENCIVIL

**Regra fundamental:** Todos os relatórios são calculados a partir de `movimentos_stock`. Nunca apenas de `produtos.stock_atual`.

---

## Relatório Diário

**Objetivo:** Ver todos os movimentos registados no dia atual.

**Filtros:**
- Data (padrão: hoje)
- Tipo de movimento (opcional)

**Dados exibidos:**
- Lista de movimentos do dia: hora, produto, tipo, quantidade, responsável, destino/obra
- Total de entradas (quantidade somada)
- Total de saídas (quantidade somada)
- Número de movimentos do dia

**Cálculo:**
```sql
SELECT *
FROM movimentos_stock
WHERE created_at::date = CURRENT_DATE AT TIME ZONE 'Europe/Lisbon'
ORDER BY created_at DESC;
```

**Origem dos dados:** `movimentos_stock.created_at`, `tipo`, `quantidade`, `produto_id`, `responsavel`, `destino_obra`

**Critério de aceitação:** Todos os movimentos do dia aparecem; zero movimentos mostra estado vazio com mensagem.

---

## Relatório Semanal

**Objetivo:** Analisar movimentos dos últimos 7 dias, agrupados por dia.

**Filtros:**
- Semana (padrão: semana atual, segunda a domingo)
- Tipo de movimento (opcional)

**Dados exibidos:**
- Gráfico de barras: entradas vs saídas por dia da semana
- Tabela de totais por dia
- Produto mais movimentado da semana
- Total de entradas e saídas da semana

**Cálculo:**
```sql
SELECT
  DATE_TRUNC('day', created_at AT TIME ZONE 'Europe/Lisbon') AS dia,
  tipo,
  SUM(quantidade) AS total_quantidade,
  COUNT(*) AS num_movimentos
FROM movimentos_stock
WHERE created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Lisbon')
  AND created_at < DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Lisbon') + INTERVAL '7 days'
GROUP BY dia, tipo
ORDER BY dia;
```

**Critério de aceitação:** Dados corretos para cada dia da semana; dias sem movimentos aparecem com zero.

---

## Relatório Mensal

**Objetivo:** Visão consolidada do mês atual, totais por semana.

**Filtros:**
- Mês e ano (padrão: mês atual)

**Dados exibidos:**
- Gráfico de evolução semanal
- Total mensal de entradas e saídas por produto
- Top 5 produtos mais consumidos (saídas)
- Top 5 produtos mais reposto (entradas)

**Cálculo:**
```sql
SELECT
  p.nome,
  p.categoria,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas,
  COUNT(*) AS num_movimentos
FROM movimentos_stock m
JOIN produtos p ON m.produto_id = p.id
WHERE DATE_TRUNC('month', m.created_at AT TIME ZONE 'Europe/Lisbon') = DATE_TRUNC('month', NOW())
GROUP BY p.id, p.nome, p.categoria
ORDER BY total_saidas DESC;
```

**Critério de aceitação:** Totais por produto corretos; exportável para Excel (Fase 2).

---

## Relatório Anual

**Objetivo:** Visão estratégica do ano, consumos e reposições por mês.

**Filtros:**
- Ano (padrão: ano atual)

**Dados exibidos:**
- Gráfico de barras mensais: entradas vs saídas totais
- Tabela de totais por mês
- Categoria mais consumida por mês

**Cálculo:**
```sql
SELECT
  DATE_TRUNC('month', created_at AT TIME ZONE 'Europe/Lisbon') AS mes,
  tipo,
  SUM(quantidade) AS total
FROM movimentos_stock
WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Europe/Lisbon') = EXTRACT(YEAR FROM NOW())
GROUP BY mes, tipo
ORDER BY mes;
```

**Critério de aceitação:** 12 meses exibidos mesmo para meses sem movimentos (zero).

---

## Relatório por Produto

**Objetivo:** Historial completo de entradas, saídas e ajustes de um produto específico.

**Filtros:**
- Produto (obrigatório)
- Período (opcional)

**Dados exibidos:**
- Informação do produto: nome, código, stock atual, stock mínimo
- Gráfico de evolução de stock ao longo do tempo
- Tabela de todos os movimentos do produto
- Total entradas, total saídas, saldo líquido

**Cálculo:**
```sql
SELECT
  m.*,
  p.nome AS produto_nome,
  p.unidade
FROM movimentos_stock m
JOIN produtos p ON m.produto_id = p.id
WHERE m.produto_id = :produto_id
ORDER BY m.created_at DESC;
```

**Critério de aceitação:** Evolução de stock calculada de `stock_depois` em cada movimento, não de `stock_atual`.

---

## Relatório por Categoria

**Objetivo:** Comparar consumo entre diferentes categorias de materiais.

**Filtros:**
- Categoria (obrigatório)
- Período (opcional)

**Dados exibidos:**
- Lista de produtos da categoria com totais de entrada/saída
- Stock atual de cada produto
- Produtos com stock baixo na categoria destacados

**Cálculo:**
```sql
SELECT
  p.id,
  p.nome,
  p.stock_atual,
  p.stock_minimo,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE 0 END) AS total_saidas
FROM produtos p
LEFT JOIN movimentos_stock m ON p.id = m.produto_id
  AND m.created_at >= :data_inicio AND m.created_at <= :data_fim
WHERE p.categoria = :categoria
GROUP BY p.id, p.nome, p.stock_atual, p.stock_minimo
ORDER BY total_saidas DESC;
```

**Critério de aceitação:** Produtos sem movimentos no período aparecem com zero (LEFT JOIN).

---

## Relatório por Obra/Destino

**Objetivo:** Saber exatamente quais materiais foram consumidos por cada obra.

**Filtros:**
- Obra/destino (pesquisa de texto, obrigatório)
- Período (opcional)

**Dados exibidos:**
- Lista de materiais consumidos na obra
- Quantidade por material
- Custo estimado (se preço unitário disponível — Fase 2)
- Data do primeiro e último movimento para a obra

**Cálculo:**
```sql
SELECT
  p.nome AS produto,
  p.categoria,
  p.unidade,
  SUM(m.quantidade) AS total_consumido,
  MIN(m.created_at) AS primeiro_movimento,
  MAX(m.created_at) AS ultimo_movimento
FROM movimentos_stock m
JOIN produtos p ON m.produto_id = p.id
WHERE m.tipo = 'saida'
  AND m.destino_obra ILIKE '%' || :obra || '%'
GROUP BY p.id, p.nome, p.categoria, p.unidade
ORDER BY total_consumido DESC;
```

**Critério de aceitação:** Apenas movimentos de saída contam para consumo por obra; ajustes e entradas excluídos.

---

## Relatório executivo (`/relatorios`) — visão do CEO

Spec: `docs/superpowers/specs/2026-10-06-relatorios-ceo-design.md` · Plano: `docs/plans/2026-10-06-relatorios-ceo.md`.

| Separador | Fonte de verdade | Quem vê |
|---|---|---|
| Visão geral | `obras_painel`, `subs_painel_ceo`, `frota_resumo_viaturas`, `produtos_em_alerta`, empréstimos | admin, gestor |
| Obras | `obras_painel()` (custo consolidado — o mesmo da ficha da obra) | admin, gestor |
| Subempreitadas | `subs_painel_ceo`, `subs_fluxo_caixa` | admin, gestor |
| Stock / Ferramentas / Combustível | movimentos, empréstimos, abastecimentos | todos os papéis com acesso ao ecrã |
| Frota | `frota_resumo_viaturas()` | admin, gestor |
| Pessoas | colaboradores, `resumo_assiduidade_dia`, `faltas`, alertas de EPI/formação/documentos | admin, gestor |

Regras:
- Os relatórios **não recalculam** custos: leem o que o módulo já calcula, para que o CEO veja os mesmos números em todo o lado.
- A Visão geral carrega cada módulo à parte; um módulo em erro aparece assinalado e não derruba os outros.
- Datas por dia civil de Lisboa (`src/app/lib/relatorios/periodo.ts`), não UTC.
- A restrição por papel na UI é conforto; a segurança real é a RLS/RPC.
