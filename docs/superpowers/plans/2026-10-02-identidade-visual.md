# Identidade visual ENCIVIL Implementation Plan

> Encerramento em 2026-10-06: o utilizador autorizou explicitamente commit e merge local na main, substituindo a restrição histórica de Git abaixo. Sem push. Foram acrescentadas as correções dos dois testes de menu, a remoção da ligação ao orçamento após gravar e a mudança de `autoDados.ts` para `obras/lib`. Ver `docs/superpowers/2026-10-06-validacao-redesign.md` para a validação final.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Uniformizar todas as áreas existentes com tema neutro e identidade ENCIVIL, claro e escuro.
**Architecture:** Tokens semânticos centrais e componentes existentes; corrigir cores locais incompatíveis sem alterar lógica ou navegação. Trabalho em paralelo por propriedade exclusiva de ficheiros.
**Tech Stack:** React 18, TypeScript, Tailwind v4, Radix, Recharts, Vite, Vitest, agent-browser.
**Spec:** `docs/superpowers/specs/2026-10-02-identidade-visual-design.md`

## Global Constraints
- Cores oficiais: preto `#04090F` e azul `#001C7D`.
- Não executar comandos Git, commits, push, deploy nem criar branches/worktrees.
- Não alterar serviços, regras de negócio, autorizações, dados, schemas ou rotas.
- Não editar `src/features/obras/components/subempreitadas/AutoDetailPage.tsx`, `AutoFormPage.tsx` nem o diretório `auto/`.
- Texto de UI em pt-PT; tipos explícitos; sem `as any`.
- Estados semânticos com contraste, foco visível, redução de movimento e impressão em papel branco.
- Não inserir atalhos de autenticação para testes. Nunca escrever no Supabase real.

## Review Focus
1. Primary claro no modo escuro não pode manter texto branco fixo: inspeção de consumidores e screenshots.
2. Formulários e tabelas continuam legíveis em claro/escuro: estados, placeholders, fronteiras e contraste medidos no navegador.
3. Mobile 390px não ganha overflow horizontal da página: verificar login, navegação e páginas representativas (tabelas podem rolar internamente).
4. Relatórios imprimíveis permanecem legíveis independentemente do tema: revisão dos estilos de impressão.
5. Trabalho simultâneo preservado: comparar snapshots iniciais dos ficheiros reservados e não os editar.

### Task 1: Fundação e componentes comuns
**Files:** `src/styles/{theme,globals,fonts}.css`, `src/app/components/**`, `src/app/layouts/MainLayout.tsx`, `public/fonts/*`, `index.html`, `vite.config.ts`.
**Interfaces:** Produz tokens existentes mais `brand`, `brand-foreground`, `info`, `info-foreground`, `chart-grid`, `chart-text`; sem alterar APIs de componentes.
- [ ] Inspecionar componentes e pares de cor antes de editar; guardar lista de ficheiros no relatório.
- [ ] Implementar paleta neutra com contraste, fontes locais e mapeamento Tailwind correto; harmonizar viz tokens com chart tokens.
- [ ] Corrigir navegação, overlays, badges, controlos, foco, skeletons e sombras. Manter suporte à impressão.
- [ ] Atualizar cores da moldura PWA para preto oficial sem alterar o mecanismo de atualização.
- [ ] Executar typecheck e rever alterações; não criar testes que só espelhem classes CSS. Reportar medições/validação a completar no navegador pela coordenação.

### Task 2: Páginas transversais e armazém
**Files:** `src/app/pages/**` (propriedade exclusiva; nenhuma alteração em components ou styles).
**Interfaces:** Consome tokens Task 1; `var(--chart-N)`, `var(--chart-grid)`, `var(--chart-text)` em gráficos. Sem API nova.
- [ ] Ler páginas e SPECs relevantes; inventariar exceções visuais de login/reset, tabelas, abas, relatórios e armazém.
- [ ] Harmonizar cores locais, backgrounds, botões e estados. Login/reset usam superfícies neutras e logótipo existente, sem fundo derivado de primary invertível.
- [ ] Migrar gráficos de ecrã para tokens. Manter estilos fixos intencionais nos documentos de impressão e cores de serviços externos identificáveis.
- [ ] Executar typecheck, auto-revisão e relatório de ficheiros com exceções justificadas.

### Task 3: Componentes visuais dos módulos
**Files:** `src/features/**/components/**` e `src/features/combustivel/pedidos/**` apenas ficheiros de UI; exclui caminhos reservados ao Claude e todos os services/hooks/db/types.
**Interfaces:** Consome os mesmos tokens Task 1; mantém exports e fluxos existentes.
- [ ] Ler documentação e mapear UI de obras, frota, abastecimento, RH, faturas, custos, EPIs e livro de obra.
- [ ] Corrigir exceções fixas incompatíveis, uniformizar cores informativas e estados, usar tokens nos gráficos e superfícies de ecrã.
- [ ] Preservar estilos de impressão e segurança. Não alterar a lógica de renderização ou business rules.
- [ ] Executar typecheck, auto-revisão e relatório de cobertura/exceções.

### Task 4: Integração, documentação e validação
**Files:** `CLAUDE.md`, `docs/06-ux-ui.md`, relatório de validação em `docs/superpowers/`; correções de código pelos implementadores proprietários.
**Interfaces:** Consome relatórios das Tasks 1–3 e implementações concluídas.
- [ ] Revisão independente por tarefa, corrigir problemas importantes e rever as correções.
- [ ] Atualizar documentação com os tokens/convenções reais e indicar precedência sobre paleta antiga.
- [ ] Executar `npm run typecheck`, `npm test`, `npm run build`; exigir código 0 e registar falhas/avisos reais.
- [ ] Validar com agent-browser em localhost, ambos os temas, desktop e mobile; verificar consola e fontes. Usar apenas ambiente efémero/fixtures para áreas autenticadas sem credenciais.
- [ ] Revisão final independente; resolver problemas encontrados, repetir apenas verificações afetadas, entregar sem Git/publicação.
