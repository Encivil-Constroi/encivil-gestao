# Dashboard do administrador (CEO) — desenho

Data: 2026-10-06 · Caminho: arquitetural (aprovação intermédia dispensada pelo utilizador) · Âmbito: ecrã `/` do `admin`.

## Objetivo
Ao abrir a app, o admin vê **o que precisa da sua decisão e o que está em risco**, com números que batem certo com os
módulos, e chega ao detalhe num clique. Resolve "o que exige a minha atenção hoje?" — a análise (período, PDF) fica nos Relatórios.

## Estado atual (verificado)
- `/` → `InicioPage` → admin vê `DashboardPage` (outros papéis: painel pessoal; trabalho em curso, não tocado aqui).
- `DashboardPage` (322 linhas): atalhos, 4 KPIs de obras, 4 KPIs de armazém, últimos movimentos, alertas de manutenção, alertas de stock.
- **Problemas**
  1. Custo/Margem de obras via `useResumoObras` (materiais + executado + combustível) ≠ `obras_painel()` (custo consolidado).
     O CEO vê um total no Dashboard e outro na ficha/relatórios. Mesma divergência já registada no spec dos Relatórios (D1).
  2. Sem visão cruzada: nada sobre obras em risco, subempreitadas a pagar, frota/IPO/seguros, ferramentas em atraso,
     pedidos de combustível à espera, faltas por decidir.
  3. Erros silenciosos: `useDashboard`/`useResumoObras` falham → mostram `0`/`€0` (mentira por omissão).
  4. Título genérico, sem cumprimento, sem "atualizado às", sem refresh.

## Decisões
- **D1 Fonte de verdade = `obras_painel()`** (`listarPainel`) + `analiseObras` (já existente). Dashboard deixa de usar `useResumoObras`
  (hook e teste ficam; só deixam de ter consumidor — remoção é seguimento).
- **D2 Sem migration, sem RLS/RPC novas.** Só leituras de contratos existentes. Rollback = `git revert`.
- **D3 Composição na camada de páginas**: `src/app/pages/dashboard/` (UI + `dados.ts`), lógica pura em `src/app/lib/dashboard/`
  (testada). Reutiliza `carregarVisaoGeral` (relatórios) — mesma `cacheKey` → Dashboard e Relatórios partilham cache e números.
  Nenhuma dependência nova entre `features/`.
- **D4 Resiliência por bloco**: cada fonte é um `Bloco` (ok/erro). Falhou → aviso "Dados incompletos: …" + "Tentar de novo";
  KPI afetado mostra `—`, nunca `0`. O armazém (useDashboard) tem erro próprio.
- **D5 Estrutura (de cima para baixo)**: cabeçalho (cumprimento, data Lisboa, atualizado às, botão atualizar) · atalhos (como hoje) ·
  banner de dados incompletos · KPIs (obras ativas, margem, por pagar subs, alertas urgentes) · **Requer a sua decisão**
  (contratos/autos por validar, pedidos de combustível, faltas por decidir) + **Requer atenção** (`construirAtencao`) ·
  Obras em risco (top 5 por gravidade) · Armazém (KPIs, movimentos, stock — existente, com estado de erro) · Alertas de manutenção.
- **D6 Segurança**: o ecrã é só do admin (`InicioPage`); `podeValidar` continua a esconder o link de validação. A RLS não muda;
  nada novo é exposto (o admin já lê tudo isto em Relatórios).

## Contratos
- Novo `carregarDashboard()` em `pages/dashboard/dados.ts` → `{ visao: VisaoGeral, decisoes: DecisoesFonte }`.
- Novo `construirDecisoes()` / `saudacao()` / `margemGlobal` puros. `DashboardPage`: mesmo caminho e export (`InicioPage` não muda).

## Critérios de aceite
1. Margem/custo no Dashboard = soma de `obras_painel()` = Relatórios Visão Geral.
2. Módulo em erro não derruba o resto; KPI afetado `—`; aviso visível; retry funciona.
3. "Requer a sua decisão" só lista contagens > 0; vazio mostra "Nada pendente".
4. Admin continua a ver os atalhos e o armazém; nenhum outro papel muda.
5. typecheck 0 erros · testes verdes · build · lint · validação no browser (público; autenticado se houver credenciais).

## Riscos
Divergência de cache com Relatórios (mitigado: chave partilhada) · carga extra no arranque (7 leituras em paralelo, já usadas
em Relatórios) · regressão visual do armazém (blocos movidos sem alterar markup).
