# AGENTS.md — Guia para Agents de IA

Este ficheiro orienta Claude Agents, Codex e outros agents de IA a contribuir corretamente para o projeto **Controle Armazém ENCIVIL**.

---

## Antes de Qualquer Alteração

1. **Ler `docs/00-source-of-truth.md`** — é a verdade principal do produto.
2. **Ler a SPEC do módulo** que vai alterar (em `docs/specs/SPEC-*.md`).
3. **Ler `docs/02-regras-de-negocio.md`** se a tarefa envolve stock ou movimentos.
4. Verificar se a tarefa está no backlog (`TASKS.md`) e qual a prioridade.
5. **Se a tarefa é de expansão ERP (RH, picagens, alertas, faturas, custeio):** ler `docs/12-plano-v3.md` — contém schema SQL completo, ficheiros a criar e critérios de conclusão para cada fase.

---

## Regras de Comportamento

### O que FAZER

- Fazer alterações pequenas e isoladas — uma funcionalidade por vez
- Manter separação entre UI (`app/pages/`, `app/components/`) e lógica de negócio (`features/*/services/`)
- Usar funções puras em `utils/` para cálculos (ex: `calcularNovoStock`)
- Preservar todos os registos de `movimentos_stock` — nunca apagar
- Validar stock antes de registar saída (bloquear se insuficiente)
- Usar timezone `Europe/Lisbon` em todas as datas
- Atualizar a SPEC do módulo se alterar uma regra de negócio
- Escrever código TypeScript com tipos explícitos

### O que NÃO FAZER

- ❌ Não inventar funcionalidades fora do escopo definido
- ❌ Não transformar o sistema em ERP completo **sem seguir o plano faseado em `docs/12-plano-v3.md`** — implementar apenas a fase indicada, pela ordem definida
- ❌ Não criar sistema de ecommerce, pagamentos ou faturação (Secção 1 da spec v3.0 está excluída)
- ❌ Não apagar registos de `movimentos_stock` — nem mesmo para "corrigir"
- ❌ Não editar `stock_atual` diretamente — apenas via movimentos
- ❌ Não colocar `service-role` key no frontend (Vite)
- ❌ Não misturar regra de negócio dentro de componentes visuais
- ❌ Não criar ecrãs ou funcionalidades de Fase 2/3 quando a tarefa é de MVP
- ❌ Não alterar a estrutura da base de dados sem criar uma migration SQL
- ❌ Não fazer `UPDATE profiles SET role = ...` direto — está bloqueado por GRANT a nível de coluna; usar sempre a RPC `promover_role()`
- ❌ Não usar `lazy()`/code-splitting por rota em `routes.tsx` — foi removido deliberadamente (ADR-008, elimina "stale chunk" pós-deploy)
- ❌ Não confiar só no frontend (`RoleGuard`, esconder botões) para restringir acesso — a defesa real é RLS/GRANT na DB; toda nova funcionalidade sensível precisa de policy ou RPC com verificação de role no servidor

---

## Regras Críticas de Negócio (para agents)

```
stock_novo = stock_atual + quantidade  (entrada)
stock_novo = stock_atual - quantidade  (saída — bloquear se negativo)
stock_novo = valor_definido            (ajuste)

movimentos_stock: NUNCA DELETE, NUNCA UPDATE
produtos.stock_atual: NUNCA editar diretamente
```

---

## Estrutura para Navegar Rapidamente

```
docs/
  00-source-of-truth.md   ← Ler sempre primeiro
  01-requisitos-funcionais.md
  02-regras-de-negocio.md ← Ler para tarefas de stock/movimentos
  03-modelo-de-dados.md   ← Ler para tarefas de BD
  04-arquitetura.md       ← Ler para novas features
  05-seguranca-e-acesso.md
  specs/
    SPEC-AUTH.md
    SPEC-DASHBOARD.md
    SPEC-PRODUTOS.md
    SPEC-MOVIMENTOS.md    ← Ler para qualquer tarefa de movimentos
    SPEC-HISTORICO.md
    SPEC-RELATORIOS.md
    SPEC-CONFIGURACOES.md
  adrs/
    ADR-001.md a ADR-008.md
TASKS/                     ← Backlog ativo (SEGURANÇA / UX / PERFORMANCE, cada uma com backlog/ e done/)
TASKS.md                   ← Obsoleto, só histórico — aponta para TASKS/
```

---

## Ao Finalizar uma Tarefa, Reportar

```
## Tarefa concluída: [título]

### Ficheiros alterados
- src/features/movimentos/services/movimentosService.ts
- src/app/pages/NewMovementPage.tsx

### Comportamento alterado
- Validação de stock insuficiente agora acontece em onChange (antes era apenas onSubmit)
- Mensagem de erro melhorada: mostra stock disponível em unidades

### Testes executados
- T-MOV-03: saída maior que stock bloqueada ✅
- T-MOV-01: entrada aumenta stock ✅

### Riscos conhecidos
- Nenhum identificado para esta alteração
```

---

## Convenções de Código

```typescript
// Nomes de funções: camelCase em inglês para código, português para variáveis de negócio
const novoStock = calcularNovoStock(stockAtual, quantidade, tipo);

// Erros: lançar com mensagem em português (mostrada ao utilizador)
throw new Error('Stock insuficiente. Disponível: ' + stockAtual + ' ' + unidade);

// Tipos: sempre explícitos
function registarMovimento(dados: DadosMovimento): Promise<Movimento> {}

// Queries Supabase: em integrations/supabase/queries/
// Nunca SQL inline em componentes
```

---

## Perguntas Frequentes para Agents

**Posso apagar um movimento errado?**  
Não. Criar um movimento de ajuste com observação explicando o erro.

**Posso editar o stock_atual diretamente?**  
Não. Registar movimento de ajuste.

**O relatório usa stock_atual do produto?**  
Não. Sempre calcular a partir de movimentos_stock.

**Produto desativado aparece em novos movimentos?**  
Não. Apenas no histórico.

**Destino/obra é obrigatório sempre?**  
Apenas em saídas. Opcional em entradas e ajustes.

**Posso promover um utilizador a admin?**  
Só via RPC `promover_role()`, autenticado como um admin existente. Nunca por `UPDATE` direto na tabela `profiles` — está bloqueado por GRANT a nível de coluna desde 2026-06-22.

**Um gestor pode criar/editar produtos?**  
Não. Só `admin`. RLS bloqueia mesmo que o frontend não escondesse o botão.

**Devo usar `lazy()` para uma nova página?**  
Não. O projeto usa bundle único deliberadamente (ver `docs/adrs/ADR-008.md`) — importar a página diretamente em `routes.tsx`.
