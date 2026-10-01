# AGENTS.md — Guia para Agents de IA

Este ficheiro orienta Codex e outros agents de IA que leem `AGENTS.md` por
convenção a contribuir corretamente para o projeto **ENCIVIL Gestão**.
**`CLAUDE.md`, na raiz do repositório, é a fonte principal** (carregado
automaticamente pelo Claude Code) — este ficheiro existe para agents que não
o leem por omissão. Em caso de conflito entre os dois, `CLAUDE.md` vence;
por favor sinalizar a divergência em vez de escolher em silêncio.

---

## Antes de Qualquer Alteração

**Superpowers é obrigatório neste projeto, em todas as sessões.** Antes de
iniciar uma tarefa, ler `.agents/skills/using-superpowers/SKILL.md` e aplicar
as skills relevantes de `.agents/skills/`. Se não aparecerem no catálogo do
Codex, ler os ficheiros diretamente. A instalação e a versão estão em
`docs/superpowers.md`. As instruções explícitas do utilizador e as regras do
projeto prevalecem sobre as skills.

1. **Ler `CLAUDE.md`** — stack, arquitetura, padrões obrigatórios, regras "nunca fazer".
2. **Ler `docs/00-source-of-truth.md`** — a verdade principal do produto.
3. **Ler a SPEC do módulo** que vai alterar, se existir (em `docs/specs/SPEC-*.md`
   — cobrem os módulos originais de armazém; módulos mais recentes não têm SPEC
   dedicada, ver `docs/12-plano-v3.md`).
4. **Ler `docs/02-regras-de-negocio.md`** se a tarefa envolve stock ou movimentos.
5. **Se a tarefa é de expansão ERP (RH, picagens, alertas, faturas, custeio):** ler `docs/12-plano-v3.md` — contém schema SQL completo, ficheiros a criar e critérios de conclusão para cada fase.
6. Histórico de tarefas anteriores (todas concluídas) em `docs/archive/` — não é o backlog ativo.

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
- ❌ Não colocar a chave `sb_secret_...` no frontend (Vite) — só `sb_publishable_...` em `VITE_`
- ❌ Não misturar regra de negócio dentro de componentes visuais
- ❌ Não criar ecrãs ou funcionalidades fora da fase indicada quando a tarefa é de uma fase específica do plano v3
- ❌ Não alterar a estrutura da base de dados sem criar uma migration SQL, com `GRANT` explícito (a exposição automática de novas tabelas está desligada — ver `CLAUDE.md`)
- ❌ Não fazer `UPDATE profiles SET role = ...` direto — está bloqueado por GRANT a nível de coluna; usar sempre a RPC `promover_role()`
- ❌ Não usar `as any` para contornar tipos do Supabase — filtros ficam inline, nunca em helpers genéricos
- ❌ Não confiar só no frontend (`RoleGuard`, esconder botões) para restringir acesso — a defesa real é RLS/GRANT na DB; toda nova funcionalidade sensível precisa de policy ou RPC com verificação de papel no servidor (`public.pode_escrever()`/`public.auth_role()`)

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
  06-ux-ui.md a 10-roadmap.md
  12-plano-v3.md          ← Plano faseado da expansão ERP (RH, alertas, faturas, custeio…)
  13-infraestrutura-e-contas.md ← Contas, segredos, assinaturas
  plano-seguranca-desempenho.md ← Plano de correções em curso
  specs/
    SPEC-AUTH.md
    SPEC-DASHBOARD.md
    SPEC-PRODUTOS.md
    SPEC-MOVIMENTOS.md    ← Ler para qualquer tarefa de movimentos
    SPEC-HISTORICO.md
    SPEC-RELATORIOS.md
    SPEC-CONFIGURACOES.md
    (módulos mais recentes não têm SPEC dedicada — ver docs/12-plano-v3.md)
  adrs/
    ADR-001.md a ADR-010.md
  archive/                 ← Histórico superado (backlog inicial TASKS/, brief original)
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

**Quem pode criar/editar produtos?**  
`admin`, `gestor` e `armazem` (módulo `armazem` em `public.pode_escrever()`).
`medicoes` e `leitura` não. RLS bloqueia mesmo que o frontend não escondesse
o botão — a matriz completa está em `CLAUDE.md`.

**Devo usar `lazy()` para uma nova página?**  
Sim — todas as rotas em `routes.tsx` são `lazy(() => import(...))` desde
28/07/2026 (ver `docs/adrs/ADR-010.md`, que substituiu a ADR-008). Seguir o
padrão das rotas vizinhas.
