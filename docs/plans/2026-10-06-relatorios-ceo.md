# Plano — Relatórios do CEO

Spec: `docs/superpowers/specs/2026-10-06-relatorios-ceo-design.md`

## Arquivos
Novos
- `src/app/lib/relatorios/periodo.ts` — `getPeriodConfig`, `diaLisboa`, `chaveBucket` (puro)
- `src/app/lib/relatorios/tendencia.ts` — `calcTrend`
- `src/app/lib/relatorios/obrasAnalise.ts` — `analiseObras(linhas)` sobre `ObraResumoRow`
- `src/app/lib/relatorios/atencao.ts` — `construirAtencao()` (semáforo da Visão Geral)
- `src/app/pages/relatorios/` — `KpiCard.tsx`, `RelatorioImpressao.tsx`, `VisaoGeralSection.tsx`, `ObrasSection.tsx`,
  `SubempreitadasSection.tsx`, `FrotaSection.tsx`, `PessoasSection.tsx`, `Estado.tsx` (loading/erro/vazio)
- Testes: `src/__tests__/lib/relatorios/*.test.ts`, `src/__tests__/pages/relatorios/*.test.tsx`
Alterados
- `src/app/pages/ReportsPage.tsx` — separadores novos, período Lisboa, gating por papel; Obras passa a `ObrasSection`
- `src/app/routes.tsx` / `Sidebar` — sem mudança de rota; prefetch mantém-se
- `docs/07-relatorios.md` — secção do relatório executivo
Sem migrations, sem alteração de `types.ts`, sem contratos públicos alterados.

## Tarefas (execução direta; sem subagentes — tudo toca em `ReportsPage.tsx`)
1. **Lib pura + testes (TDD)**: periodo (fronteiras Lisboa), tendencia, obrasAnalise, atencao.
2. **Componentes base**: `KpiCard`, `Estado`, `RelatorioImpressao` (extraídos/novos, tokens do tema).
3. **Obras** sobre `listarPainel()` (D1); remover cálculo próprio; ligação a `/obras/:id`.
4. **Subempreitadas** (`buscarPainelCeo`, `listarFluxoCaixa`), **Frota** (`listarResumoViaturas`),
   **Pessoas** (colaboradores ativos + alertas RH + assiduidade do período).
5. **Visão Geral** (`Promise.allSettled`, `construirAtencao`, links).
6. **ReportsPage**: abas por papel, período único, PDF por separador, trocar `useEffect` por `useAsync` nos novos.
7. **Validação**: `npm run typecheck`, `npm test`, `npm run build`, browser (`/login` + fluxo se houver credenciais), `git diff`.
8. **Auditoria final** + docs.

## Testes
Unit (lib), render (secções com mocks de serviço: loading/erro/vazio/dados, gating por papel), regressão dos separadores
mantidos. Sem BD nova ⇒ sem teste PGlite novo.

## Observabilidade / rollback
Erros por módulo via toast + `parseSupabaseError`; Sentry já global. Rollback: `git revert` (sem migração).

## Validação final
typecheck=0, testes verdes, build ok, comparar custo de uma obra: relatório vs `/obras/:id`.
