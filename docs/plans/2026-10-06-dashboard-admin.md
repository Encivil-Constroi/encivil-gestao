# Plano — Dashboard do administrador

Spec: `docs/superpowers/specs/2026-10-06-dashboard-admin-design.md`. Execução direta (um ecrã, ficheiros acoplados; agentes custariam mais).

1. TDD lógica pura `src/app/lib/dashboard/resumo.ts`: `saudacao(hora)`, `construirDecisoes(fonte)`, `contagemUrgentes`. Teste `src/__tests__/lib/dashboard/resumo.test.ts`.
2. `src/app/pages/dashboard/dados.ts`: `carregarDecisoes()` (contratos/autos rascunho, pedidos combustível, faltas) em `Bloco`s + `carregarDashboard()`.
3. UI `src/app/pages/dashboard/`: `Cabecalho`, `KpisExecutivos`, `PainelDecisoes`, `PainelAtencao`, `ObrasEmRisco`, `ArmazemSecao` (extraído, com erro).
4. `DashboardPage.tsx` passa a compor; mantém export/caminho. Teste de render `src/__tests__/pages/dashboard/dashboardPage.test.tsx` (sucesso, bloco em erro → `—` + aviso, vazio).
5. Validar: typecheck, `npm test`, lint, build, agent-browser (`/login`, arranque, consola), `git diff` só no âmbito.
6. Doc: entrada em `docs/07-relatorios.md`? Não — nota curta no spec (feito). Auditoria final.

Rollback: `git revert` (sem migrations). Observabilidade: `useAsync` já reporta ao Sentry (`captureError`).
Riscos: ver spec. Não tocar nos ficheiros modificados pelo trabalho "início por cargo" (Sidebar, MainLayout, routes, inicio/*).
