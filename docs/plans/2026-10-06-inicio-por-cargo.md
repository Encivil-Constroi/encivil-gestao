# Plano — Página inicial por cargo

Spec: `docs/superpowers/specs/2026-10-06-inicio-por-cargo-design.md`. Execução direta (um só contrato, ficheiros
acoplados — subagentes custariam mais do que ajudam). TDD nas partes de lógica.

1. **Lógica pura** `src/app/pages/inicio/secoes.ts` + `src/__tests__/pages/inicio/secoes.test.ts` (matriz papel→secções).
2. **Dados**: `listarAbastecimentosVeiculo` + `useAbastecimentosVeiculo` (combustivel); `buscarMeuColaborador` +
   `useMeuColaborador` (colaboradores). Testes de serviço com mock do cliente.
3. **UI**: `InicioPage` (admin → `DashboardPage` lazy; resto → `PainelPessoalPage`), widgets em `inicio/widgets/`.
4. **Navegação**: `routes.tsx` índice, `MainLayout` (`/` permitido a mecânico/motorista), `Sidebar` ("Início",
   flags mecânico/motorista), `MobileBottomNav`.
5. **Testes existentes**: atualizar `isolamentoMecanico`, `isolamentoMotorista`, `sidebarMecanico` (novo comportamento).
6. **Validação**: typecheck, `npm test`, build, abrir `/login` e arranque no navegador; git diff sem extras.
7. **Docs**: `docs/19`… não; entrada curta em `docs/06-ux-ui.md`? Só se existir secção de navegação (verificar).

Riscos: regressão dos testes de isolamento (atualizados de forma explícita); `useAsync` com cache partilhado (chaves novas
`inicio-*`); lentidão do painel gestor (secções independentes, carregam em paralelo, cada uma com o seu erro).
Rollback: `git revert` do commit; sem migrations.
