# [P2 · MÉDIO] Dashboard faz 3-4 queries separadas — consolidar numa RPC

## Decisão de Staff Engineer — diferido conscientemente (2026-06-12)

As 5 queries do Dashboard já correm em `Promise.all()` — são paralelas, não sequenciais.
Das 5: 3 são `{ count: 'exact', head: true }` (zero dados transferidos, apenas um número).
O custo real é 2 round-trips com dados: produtos (5 colunas, limitado) e movimentos (limit 5).

Consolidar numa RPC adiciona:
- Uma migration SQL com lógica de negócio no DB
- Tipos TypeScript adicionais para o retorno da RPC
- Dificuldade de debug (query oculta no DB em vez de visível no frontend)
- Rigidez: qualquer mudança ao Dashboard implica alterar a RPC

**Quando executar:** Se o Dashboard for medido com latência > 500ms em produção
com dados reais, ou se o número de utilizadores simultâneos crescer significativamente.
Medir antes de optimizar — não optimizar por hipótese.

## Problema
O Dashboard carrega os seus KPIs com múltiplas queries paralelas:
```
GET /rest/v1/produtos?ativo=eq.true              ← contagem total
GET /rest/v1/produtos?stock_atual=lte.stock_minimo ← stock baixo
GET /rest/v1/movimentos_stock?...&limit=7         ← movimentos recentes
GET /rest/v1/profiles?id=eq.[uuid]               ← role (se não centralizado)
```

4 round-trips HTTP ao Supabase = 4x latência em série (ou paralelo mas ainda
quadruplica a carga no servidor).

Padrão dos grandes sistemas: **BFF (Backend for Frontend)** — uma única
chamada que agrega todos os dados necessários para uma vista.

## Localização
- `src/features/dashboard/useDashboard.ts`

## Solução

### RPC `dashboard_stats()` no Supabase
```sql
-- Migration: 20260612000004_dashboard_rpc.sql
CREATE OR REPLACE FUNCTION dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_produtos     INT;
  v_stock_baixo        INT;
  v_entradas_semana    NUMERIC;
  v_saidas_semana      NUMERIC;
  v_movimentos_recentes JSON;
BEGIN
  SELECT COUNT(*) INTO v_total_produtos
  FROM produtos WHERE ativo = true;

  SELECT COUNT(*) INTO v_stock_baixo
  FROM produtos WHERE ativo = true AND stock_atual <= stock_minimo;

  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN quantidade ELSE 0 END), 0)
  INTO v_entradas_semana, v_saidas_semana
  FROM movimentos_stock
  WHERE data_movimento >= NOW() - INTERVAL '7 days';

  SELECT json_agg(m ORDER BY m.data_movimento DESC)
  INTO v_movimentos_recentes
  FROM (
    SELECT ms.id, ms.tipo, ms.quantidade, ms.data_movimento, ms.responsavel,
           p.nome AS produto_nome, p.unidade
    FROM movimentos_stock ms
    JOIN produtos p ON p.id = ms.produto_id
    ORDER BY ms.data_movimento DESC
    LIMIT 10
  ) m;

  RETURN json_build_object(
    'total_produtos',      v_total_produtos,
    'stock_baixo',         v_stock_baixo,
    'entradas_semana',     v_entradas_semana,
    'saidas_semana',       v_saidas_semana,
    'movimentos_recentes', COALESCE(v_movimentos_recentes, '[]'::json)
  );
END;
$$;
```

### Frontend
```ts
// useDashboard.ts
const { data } = await supabase.rpc('dashboard_stats');
// data.total_produtos, data.stock_baixo, data.movimentos_recentes, ...
```

**Resultado**: 4 queries → 1 RPC. Latência do Dashboard reduzida em ~60-70%.

## Esforço estimado
⏱ 2h (SQL RPC + migration + refactoring do hook + tipos TypeScript)

## Critério de conclusão
- [ ] Dashboard faz exactamente 1 request HTTP ao carregar
- [ ] Tempo de carregamento do Dashboard < 300ms em conexão normal
- [ ] Todos os KPIs mostram valores correctos
- [ ] RPC usa `SECURITY DEFINER` com verificação de auth (auth.uid() NOT NULL)
