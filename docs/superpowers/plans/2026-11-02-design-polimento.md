# Plano — Polimento visual e bugs de frontend (2026-11-02)

**Objetivo.** Corrigir os bugs de frontend e as falhas de design Média das auditorias
`.superpowers/design/V1-desktop.md` (desktop) e `V2-mobile.md` (telemóvel), mais um bug Alta do controlador
(config Supabase), sem mudar a identidade visual. Achados verificados no código a 2026-11-02.

**Regras globais (valem para todos os lotes).**
- Só tokens de `src/styles/theme.css`, em pares semânticos (`bg-primary text-primary-foreground`, `bg-warning text-warning-foreground`…).
  Nada de `text-white`, `gray-*`, hex ou cores Tailwind cruas em ecrã. Foco: `focus-visible:ring-2 focus-visible:ring-ring`.
- Sem dependências npm novas. Sem nova identidade visual (fonte, raio 8px, sombras e paleta ficam como estão).
- Sem `as any`. Texto de UI em pt-PT, forma neutra/formal ("Selecione", nunca "Seleciona"); botões e títulos só com a 1.ª palavra em maiúscula.
- Animações novas só com `motion-safe:`; impressão (`print:`, `*PrintView`, `ObraRelatorioPage`) mantém tinta explícita — não tocar.
- Correção de comportamento ⇒ teste Vitest que falha antes (escrever, ver falhar, corrigir). Mudança só visual ⇒ captura antes/depois
  com `agent-browser` (Supabase **local**, nunca produção) guardada em `.superpowers/design/capturas/polimento/<lote>-<ecrã>-<antes|depois>-<tema>-<largura>.png`.
- Um módulo de `features/` só importa de `auth`, `@/app/lib`, `@/app/components`, `@/integrations` (os componentes novos ficam em `@/app/components`).
- Cada lote mexe **só** nos ficheiros listados. Ficheiro preciso e não listado ⇒ parar e avisar o controlador.

## Ondas e dependências

| Onda | Lotes (paralelos) | Depende de |
|---|---|---|
| 1 | **S1** config Supabase · **F1** fundações de componentes · **F2** casca (cabeçalho, nav, convite push) | — |
| 2 | **A** armazém · **B** obras · **C** frota/abastecimento · **D** início/relatórios/auditoria/faturas · **E** RH/picagens/EPIs | F1 (todos); F2 só para capturas finais |

Na onda 2 correm 4 de cada vez; o 5.º arranca quando o primeiro terminar.

---

## Onda 1

### S1 — Configuração Supabase em dev nunca cai em produção  [BUG Alta, controlador]
Ficheiros: `src/integrations/supabase/config.ts`, `src/integrations/supabase/client.ts`, `src/__tests__/lib/supabaseClientConfig.test.ts`.
Mudança:
- Em `selecionarConfiguracaoSupabase`, com `dev === true`: se **URL ou chave** vierem preenchidas (após `trim`) e o par for inválido
  (URL nem hosted nem loopback válida, ou chave não `sb_publishable_*`), **lançar** `Error` com mensagem pt-PT:
  `Configuração Supabase local inválida: VITE_SUPABASE_URL tem de ser https://<projeto>.supabase.co ou http(s)://localhost|127.0.0.1:<porta> e VITE_SUPABASE_PUBLISHABLE_KEY tem de começar por sb_publishable_. Corrija o .env.local — em desenvolvimento nunca se usa o projeto de produção por omissão.`
  (não incluir os valores recebidos na mensagem). Dev com URL **e** chave vazias mantém o fallback (é o caso documentado de `npm run dev`).
- Com `dev === false` o comportamento atual mantém-se exatamente (fallback + `console.warn`).
- `client.ts` não muda de lógica (o erro propaga no import, falha alto no arranque do Vite).
Testes (reescrever os casos `DEV=true` que hoje esperam fallback): loopback + `sb_secret_…` em dev ⇒ `rejects.toThrow(/Configuração Supabase local inválida/)`;
URL `http://servidor.example:54321` + chave válida em dev ⇒ lança; `http://localhost:54321/api` em dev ⇒ lança; URL vazia + chave local em dev ⇒ lança;
ambos vazios em dev ⇒ fallback; todos os casos `DEV=false` atuais continuam verdes; a mensagem não contém a chave recebida.
Capturas: nenhuma (sem UI).

### F1 — Fundações de componentes  [transversais V1 1-7, V2 1-5]
Ficheiros: `src/app/lib/format.ts`, `src/app/components/ui/button.tsx`, `src/app/components/ui/tabs.tsx`, `src/app/components/EmptyState.tsx`,
novos `src/app/components/PageHeader.tsx`, `src/app/components/SeparadoresNav.tsx`, `src/app/components/FiltroChips.tsx`,
`src/app/components/CampoSelect.tsx`, testes novos em `src/__tests__/lib/format.test.ts` e `src/__tests__/components/fundacoes.test.tsx`.
Mudança:
1. `format.ts`: `primeiraMaiuscula(s)` (só o 1.º carácter), `fmtDataExtensa(d)` → "Segunda-feira, 2 de novembro de 2026",
   `fmtMesAno(d)` → "Novembro de 2026", `fmtQuantidade(valor, unidade?)` → `fmtNumber` + `' ' + unidade` (ex.: "1453,52 kg").
   Substitui todo o uso de `capitalize` do Tailwind em datas (aplicado nos lotes A–E).
2. `ui/button.tsx`: alvos — `default: h-10 md:h-9`, `sm: h-9 md:h-8`, `lg: h-11 md:h-10`, `icon: size-10 md:size-9`.
   Desativado: tirar `disabled:opacity-50` da base; por variante `default|destructive|secondary` → `disabled:bg-muted disabled:text-muted-foreground`,
   `outline` → `disabled:bg-transparent disabled:text-muted-foreground`, `ghost|link` → `disabled:text-muted-foreground`; base mantém
   `disabled:pointer-events-none` e ganha `disabled:shadow-none`.
3. `ui/tabs.tsx`: `TabsList` com `max-w-full overflow-x-auto` e `h-10 md:h-9`; `TabsTrigger` `min-h-9`.
4. `PageHeader`: props `titulo`, `descricao?`, `acoes?: ReactNode`, `voltar?: string` (rota). Markup: `<header className="flex flex-col gap-3 sm:flex-row sm:items-start">`;
   bloco de título `flex-1 min-w-0` com `h1 text-xl md:text-2xl font-semibold tracking-tight` e `p text-sm text-muted-foreground mt-0.5`;
   `voltar` ⇒ `Button variant="ghost" size="icon" asChild` com `ArrowLeft` e `aria-label="Voltar"` à esquerda do título; ações em
   `flex flex-wrap gap-2 sm:shrink-0` com `[&>*]:whitespace-nowrap`. **Sem ícone no título.** Exporta também
   `LARGURA_PAGINA = 'max-w-6xl mx-auto w-full'` e `LARGURA_FORMULARIO = 'max-w-3xl mx-auto w-full'` (as duas únicas larguras).
5. `SeparadoresNav`: props `itens: { para; rotulo; Icone; fim? }[]`, `ariaLabel`. `NavLink`s com o estilo atual dos layouts
   (`border-b-2 -mb-px`, ativo `border-primary text-primary`) + `min-h-10`; contentor `relative border-b border-border` **sem** `-mx-1 px-1`
   (corrige o recuo de 3px); `nav` com `overflow-x-auto [scrollbar-width:none]`. Indicação de scroll: dois `div aria-hidden pointer-events-none
   absolute inset-y-0 w-8` (`left-0 bg-linear-to-r from-background to-transparent`, `right-0 bg-linear-to-l …`) visíveis só quando há
   conteúdo escondido desse lado (estado calculado em `onScroll` e num `ResizeObserver`, protegido com `typeof ResizeObserver !== 'undefined'`).
   No mount, o separador ativo faz `scrollIntoView({ block: 'nearest', inline: 'nearest' })`.
6. `FiltroChips`: props `opcoes: { valor; rotulo; contagem? }[]`, `valor`, `onChange`, `ariaLabel`. `div role="group"` com `flex gap-2 overflow-x-auto`;
   cada opção `button aria-pressed` `inline-flex items-center gap-1.5 min-h-10 md:min-h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap`;
   ativo `bg-primary text-primary-foreground border-primary`, inativo `bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground`;
   `contagem` em `span tabular-nums text-xs`. É o **único** estilo de filtros e de sub-vistas dentro de uma página (substitui "segmentados").
7. `CampoSelect`: `<select>` nativo (mantido: melhor no telemóvel) com `forwardRef`, envolvido em `div relative` com `ChevronDown` à direita;
   exporta `CLASSE_CAMPO = 'w-full min-h-11 px-4 py-3 bg-input-background border border-input rounded-xl text-base md:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground'`
   e o select usa `CLASSE_CAMPO + ' appearance-none pr-10'`. Os lotes trocam `<select className={campo}>` por `<CampoSelect>`.
8. `EmptyState`: `description` opcional, nova prop `compacto?` (`py-8`, ícone `w-6 h-6` em caixa `w-12 h-12`), ação passa a `<Button size="lg">`.
Testes: `format.test.ts` (as 4 funções; `fmtDataExtensa(new Date(2026,10,2))` sem "De"/"Feira" em maiúscula);
`fundacoes.test.tsx`: `Button disabled` não tem `disabled:opacity-50` e tem `disabled:bg-muted`; `SeparadoresNav` marca o ativo com `aria-current="page"`
e não renderiza os gradientes quando não há overflow; `FiltroChips` chama `onChange` e expõe `aria-pressed`; `PageHeader` renderiza `h1` e o link "Voltar";
`EmptyState` sem descrição não renderiza `<p>`.
Capturas: nenhuma isolada (validadas nos lotes da onda 2).

### F2 — Casca: cabeçalho, barra inferior, convite push  [BUG Alta convite push (V1+V2), BUG Média alvos do cabeçalho, DESIGN Média ranhura do FAB]
Ficheiros: `src/app/components/Header.tsx`, `src/app/components/MobileBottomNav.tsx`, `src/app/components/PushSetup.tsx`,
`src/app/components/GlobalSearch.tsx`, `src/main.tsx`, testes novos `src/__tests__/components/pushSetup.test.tsx` e `src/__tests__/components/mobileBottomNav.test.tsx`.
Mudança:
- Convite push: o `toast` passa a `{ id: 'convite-push', position: 'bottom-center', … }`; no `main.tsx` o `Toaster` ganha
  `mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}` (fica acima da barra inferior). Antes de mostrar, se existir
  `document.querySelector('[aria-modal="true"]')` adia 5 s e volta a tentar (máx. 3 tentativas). `GlobalSearch` passa a ter
  `role="dialog" aria-modal="true" aria-label="Pesquisa global"` no painel e chama `toast.dismiss('convite-push')` ao abrir.
  Os restantes toasts continuam `top-right`.
- Cabeçalho: tema, notificações e sair → `inline-flex items-center justify-center size-10 rounded-lg`; pesquisa → `h-10`.
  Remover `capitalize` do nome (nomes já vêm escritos). `ROLE_LABELS` cobre os 7 papéis com maiúscula inicial ("Leitura", "Mecânico"…).
- `MobileBottomNav`: sem permissão de movimento, **não** renderizar a ranhura do FAB (`w-14` vazio); itens `flex-1`; etiquetas `text-[11px]`;
  inativo `text-muted-foreground`, ativo `bg-primary/10 text-primary` (igual nos dois ramos — motorista/mecânico incluídos).
Testes: `pushSetup` (fake timers + `vi.mock('sonner')`): chama `toast` com `position: 'bottom-center'` e `id: 'convite-push'`; com um
`[aria-modal="true"]` no DOM não chama aos 5 s e chama depois de o remover. `mobileBottomNav`: papel `medicoes` (sem `podeArmazem`)
não tem o elemento placeholder e mostra 4 links.
Capturas (admin e armazem; claro/escuro): `/` 390 e 1440 antes/depois; `/` com Ctrl+K aberto aos 6 s (convite não aparece por cima); `/obras/subempreitadas` medicoes 390.

---

## Onda 2 (todos dependem de F1)

### A — Armazém
Achados: [BUG Alta] quantidades com ponto (inventário, ficha); [BUG Média] chips 34px; [DESIGN Média] placeholder de foto (inventário e ficha),
Arquivar âmbar, Emprestar âmbar ×200, select nativo vs combobox e quantidade "0" no formulário de movimento; `capitalize` em Movimentos;
`toFixed(2) €` na ferramenta; recuo 3px dos separadores; estado vazio de Movimentos sem ação.
Ficheiros: `src/app/pages/armazem/ArmazemLayout.tsx`, `InventarioPage.tsx`, `ProdutoDetalhePage.tsx`, `ProdutoFormPage.tsx`, `FerramentasPage.tsx`,
`FerramentaDetalhePage.tsx`, `MovimentoFormPage.tsx`, `MovimentosPage.tsx`; testes em `src/__tests__/features/armazem/`.
Mudança:
- Stocks: `fmtQuantidade` em `InventarioPage:208,235`, `ProdutoDetalhePage:84,121`, `ProdutoFormPage:222` (export CSV mantém o número cru).
  `FerramentaDetalhePage:69` → `fmtEuro`.
- `ArmazemLayout`: `LARGURA_PAGINA` + `PageHeader` (ações Entrada `bg-success text-success-foreground` e Saída `default`, via `Button asChild`) + `SeparadoresNav`.
- Inventário: filtros de estado → `FiltroChips`; cartão sem foto (`!p.fotoPath`) usa faixa `h-20` com ícone em vez de `aspect-[4/3]`;
  sem preferência guardada e `matchMedia('(max-width: 767px)').matches` ⇒ vista `lista` por omissão.
- Ficha do produto: sem foto ⇒ placeholder `h-40`; "Arquivar" → `Button variant="outline"` com `Archive` (neutro, sem âmbar).
- Ferramentas: "Emprestar" → `Button variant="outline" asChild`; `warning` só para atraso; vista (Ferramentas/Empréstimos/Arquivadas) e filtros → `FiltroChips`.
- Formulário de movimento: "Obra" → `CampoSelect`; o gatilho do combobox "Artigo" usa `CLASSE_CAMPO`; quantidade com valor inicial `''`,
  `placeholder="0"`, `text-left`, unidade como sufixo `text-muted-foreground`; cabeçalho via `PageHeader voltar="/armazem"` dentro de `LARGURA_FORMULARIO`.
- Movimentos: `MovimentosPage:181` remover `capitalize` (fica `uppercase`); vazio → `EmptyState` com ação "Limpar filtros" quando há filtros.
Testes: inventário mostra "1453,52" e não "1453.52" (falha antes); vista por omissão `lista` com `matchMedia` móvel mockado;
formulário de saída começa com quantidade vazia; Movimentos vazio com filtro mostra "Limpar filtros" e repõe filtros.
Capturas (armazem; 1440 e 390; claro/escuro): `/armazem/inventario`, `/armazem/produto/:id`, `/armazem/ferramentas`, `/armazem/movimento/saida`, `/armazem/movimentos`.

### B — Obras e subempreitadas
Achados: [BUG Média] Materiais com 1000 linhas e colunas numéricas à esquerda; [BUG Média] "Submeter para verificação" ilegível e motivo longe;
[BUG Média] "Nova contratação" quebra / dois primários; [DESIGN Média] larguras 1024/1136, cabeçalhos de custos/livro/guias, cartões do painel,
títulos de secção 20px e enum "PROBLEMA", rótulos colados no relatório diário, filtros empilhados em `/obras/relatorios`; separadores cortados a 1024.
Ficheiros: `src/features/obras/components/ObrasLayout.tsx`, `ObraFichaPage.tsx`, `ObraCard.tsx`, `ficha/Materiais.tsx`, `RelatorioDiarioPage.tsx`,
`RelatoriosDiariosPage.tsx`, `subempreitadas/SubempreiteirosPage.tsx`, `subempreitadas/SubempreiteiroDetailPage.tsx`, `subempreitadas/SubFichaCEO.tsx`,
`subempreitadas/AutoDetailPage.tsx`, `src/features/custos/components/CustosObraPage.tsx`, `src/features/livro-obra/components/LivroObraPage.tsx`
(só o cabeçalho de ecrã, **não** o bloco `print:`), `GuiasTransportePage.tsx`; testes em `src/__tests__/features/obras/`.
Mudança:
- `ObrasLayout`: `PageHeader` + `SeparadoresNav`; ação do cabeçalho conforme a rota: em `/obras/subempreitadas*` "Nova contratação"
  (se `podeSubempreitadas`), senão "Nova obra" (se `podeObras`). `SubempreiteirosPage` perde o seu `h1` e botão; o contador fica `p text-sm text-muted-foreground`.
- `ObraFichaPage`: `max-w-5xl` → `LARGURA_PAGINA` (3 sítios); nav "Secções da obra" → `SeparadoresNav`. Custos, Livro e Guias: `LARGURA_PAGINA` + `PageHeader voltar={`/obras/${id}`}`.
- `ObraCard`: sem dados de progresso não renderiza o anel nem as duas linhas "Sem previsto…/Ainda sem progresso" (uma só linha `text-xs text-muted-foreground` "Sem plano de progresso");
  nome `line-clamp-2` em vez de `truncate`; badge de estado passa para a linha de baixo.
- `Materiais`: mostrar 50 linhas + botão `Button variant="outline"` "Mostrar mais (N restantes)" (+50); colunas Enviado/Devolvido/Líquido/Valor
  `text-right tabular-nums` (cabeçalho incluído); pesquisa com `CLASSE_CAMPO` e `placeholder="Pesquisar por artigo…"`.
- `AutoDetailPage`: "Submeter" → `Button size="lg" className="w-full"`; motivos de bloqueio numa `ul id="motivos-submissao" role="status" text-sm text-destructive`
  **logo abaixo** do botão, com `aria-describedby="motivos-submissao"` no botão; remover a cópia acima.
- Subempreitada: títulos de secção `text-base font-semibold`; tipos de ocorrência com mapa `ROTULO_TIPO_OCORRENCIA` em `SubFichaCEO.tsx`
  (Atraso, Problema, Clima, Qualidade, Segurança, Nota) no select e na lista.
- Relatório diário: cada `label` → `grid gap-1.5 text-sm font-medium`, grupos `gap-4`; selects → `CampoSelect`.
  `/obras/relatorios`: filtros em `grid grid-cols-2 md:grid-cols-4 gap-3` com `CampoSelect`.
Testes: Materiais com 120 linhas renderiza 50 `tr` e, após clicar, 100 (falha antes); `ObrasLayout` em `/obras/subempreitadas` (admin) tem só "Nova contratação";
Auto com erro de validação: botão desativado com `aria-describedby` e o motivo a seguir ao botão; `SubFichaCEO` mostra "Problema" e não "PROBLEMA".
Capturas (admin e medicoes; 1440, 1024, 390; claro/escuro): `/obras`, `/obras/subempreitadas`, `/obras/:id` (Materiais), `/obras/:id/custos`, `/obras/auto/:id`, `/obras/:id/relatorio-diario/novo`, `/obras/relatorios` (gestor 390).

### C — Frota e abastecimento
Achados: [BUG Média] "Novembro De 2026" e seletor de mês como barra preta; `capitalize` em manutenção; separadores cortados sem indicação; chips pequenos (padrão).
Ficheiros: `src/features/frota/components/FrotaLayout.tsx`, `FichaViaturaPage.tsx`, `ViaturasListaPage.tsx`, `manutencao/DetalheDia.tsx`,
`manutencao/HistoricoManutencoes.tsx`, `src/features/combustivel/components/modulo/AbastecimentoLayout.tsx`, `modulo/HistoricoAbastecimentos.tsx`;
testes em `src/__tests__/features/frota/` e `src/__tests__/features/combustivel/`.
Mudança:
- `FrotaLayout` e `FichaViaturaPage`: `LARGURA_PAGINA` + `PageHeader` + `SeparadoresNav`; `AbastecimentoLayout`: os separadores → `SeparadoresNav` (ou `FiltroChips` se forem botões).
- `ViaturasListaPage`: estado e classe (Todas/Viaturas/Máquinas) → `FiltroChips`.
- `DetalheDia`/`HistoricoManutencoes`: tirar `capitalize`, usar `primeiraMaiuscula(nomeDoDia(...))`.
- Histórico de abastecimentos: barra de período → linha `flex items-center gap-2`: `Button variant="outline" size="icon"` (mês anterior),
  `FiltroChips` `[{valor:'mes', rotulo: fmtMesAno(mesRef)}, {valor:'tudo', rotulo:'Tudo'}]`, `Button variant="outline" size="icon"` (seguinte);
  cabeçalhos de grupo (`:222`) sem `capitalize`; "Lançar registo manual" passa para a direita da linha de título da lista (`Button variant="outline" size="sm"`).
Testes: histórico mostra "Novembro de 2026" (texto real, falha antes porque hoje vem "novembro de 2026" e depende do CSS); `nomeDoDia` + `primeiraMaiuscula` → "Segunda-feira, 2 de novembro de 2026".
Capturas (mecanico e gestor; 1440 e 390; claro/escuro): `/frota`, `/frota/viaturas`, `/frota/viatura/:id`, `/abastecimento/historico`.

### D — Início, relatórios, auditoria, faturas
Achados: [BUG Média] data do dashboard com `capitalize`; [BUG Média] classificar fatura sem `h1`, enum de estado, texto 11px; [BUG Média V2] links "Abrir" 49×20;
[DESIGN Média] cabeçalho do relatório executivo, auditoria (tabs antes do título, "Normal" âmbar, "Ver detalhes" apagado), ações rápidas com 4 estilos.
Ficheiros: `src/app/pages/DashboardPage.tsx`, `src/app/pages/inicio/PainelPessoalPage.tsx`, `src/app/pages/inicio/widgets/ui.tsx`, `src/app/pages/ReportsPage.tsx`
(só o cabeçalho e a barra de ações), `src/app/pages/AuditoriaPage.tsx`, `src/features/faturas/components/ClassificarFaturaPage.tsx`;
testes em `src/__tests__/pages/` e `src/__tests__/features/faturas/`.
Mudança:
- Dashboard: `fmtDataExtensa(hoje)` sem `capitalize`; `PageHeader` + `LARGURA_PAGINA` (também em `PainelPessoalPage`, que perde o `max-w-5xl`).
  Ações rápidas: só duas famílias — ação principal `Button` default, restantes `Button variant="outline"` com ícone colorido
  (`text-success` entrada, `text-destructive` saída); nada de fundos verde/vermelho cheios.
- `widgets/ui.tsx`: link da secção `inline-flex items-center min-h-10 px-2 -mr-2 rounded-lg hover:bg-accent`.
- Relatório executivo: cartão com logótipo → `PageHeader titulo="Relatório executivo"` com "Exportar PDF" em `acoes`; atalho de relatórios diários
  como `Button variant="outline" size="sm"` nas ações; logótipo só no bloco de impressão existente.
- Auditoria: `PageHeader` primeiro, depois `FiltroChips` (Registos / Eventos de segurança); badge de severidade só para `high` (`bg-destructive/10 text-destructive`)
  e `low` (`bg-info/10 text-info`); `medium` sem badge; "Ver detalhes" → `Button variant="ghost" size="sm"` (texto `foreground`).
- Classificar fatura: fornecedor em `<h1 className="font-semibold truncate text-base md:text-lg">`; estado com rótulo pt-PT (Recebida, Extraída, Classificada, Lançada)
  em vez do enum; link de voltar com `aria-label="Voltar às faturas"` e `size-10`; nenhum texto abaixo de `text-xs`, corpo das linhas `text-sm`.
  O ecrã continua full-bleed (decisão: área de trabalho dividida PDF/linhas).
Testes: Dashboard mostra "de novembro" e começa por maiúscula; `ClassificarFaturaPage` tem `heading level 1` com o fornecedor e "Extraída" em vez de "EXTRAIDA";
Auditoria: registo `medium` não mostra "Normal" (atualizar `auditoriaPage.test.tsx` se o espera).
Capturas (admin, gestor, armazem; 1440 e 390; claro/escuro): `/`, `/relatorios`, `/auditoria`, `/faturas/:id/classificar`.

### E — RH, picagens, EPIs, alertas
Achados: [BUG Média] "Entrada" desativada verde-claro ilegível; [DESIGN Média] dois cabeçalhos "Recursos Humanos", estado inicial de EPIs/Formações/Segurança
(texto solto, "Seleciona"); terceiro estilo de tabs em `/alertas` e `/rh`; `capitalize` na assiduidade.
Ficheiros: `src/app/pages/RecursosHumanosPage.tsx`, `src/features/horarios/components/RHPage.tsx`, `src/features/horarios/components/HorariosPage.tsx`,
`src/features/horarios/components/AssiduidadePage.tsx`, `src/features/picagens/components/PicagemPage.tsx`, `ValidacaoPicagensPage.tsx`,
`src/features/epis/components/EpisPage.tsx`, `FormacoesPage.tsx`, `FichaSegurancaPage.tsx`, `src/features/alertas/components/AlertasPage.tsx`;
testes em `src/__tests__/features/{picagens,epis,horarios}/`.
Mudança:
- `/colaboradores` e `/rh`: mesmo `PageHeader` (sem ícone) e `LARGURA_PAGINA`; abas das duas → `FiltroChips` (ou `SeparadoresNav` se forem rotas);
  H2 "Horários de Trabalho" com ícone → `h2 text-base font-semibold` sem ícone.
- Picagem: botão principal desativado → `disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none` (sem `opacity-40`) e, quando `!ready`,
  linha `text-sm text-muted-foreground` por baixo: "Escolha o colaborador e a obra para picar."
- EPIs/Formações/Segurança: select de colaborador → `CampoSelect`; estado inicial → `EmptyState compacto icon={UserSearch} title="Escolha um colaborador"`
  com descrição "Os EPIs/formações/ficha aparecem aqui." Validação de picagens: idem com "Selecione uma obra…"; remover subtítulo "Tudo validado" sem obra.
- Todos os "Seleciona …" destes ficheiros → "Selecione …". `AssiduidadePage`: `primeiraMaiuscula` em vez de `capitalize` (`:40`, `:148`).
- `/alertas`: sub-abas Ativos/Reconhecidos/Resolvidos → `FiltroChips`; "Avaliar agora" → `Button variant="outline"` (altura igual aos outros).
Testes: Picagem sem colaborador mostra o texto de ajuda e o botão desativado sem `disabled:opacity-40`; EpisPage sem seleção mostra "Escolha um colaborador";
nenhum dos ficheiros contém "Seleciona " (teste de texto renderizado nos 3 ecrãs de EPIs).
Capturas (gestor; 1440 e 390; claro/escuro): `/colaboradores`, `/rh`, `/picagens`, `/picagens/validacao`, `/epis`, `/alertas`.

---

## O que NÃO fazer (rejeitados — 10 Média/BUG; todas as Baixas ficam fora)
1. "Terminar sessão sem confirmação" — falso: `Header.handleLogout` já pede `window.confirm` (com aviso de registos pendentes).
2. "Unificar a home do gestor com o dashboard do admin" — são ecrãs diferentes por desenho (`InicioPage`: executivo vs painel pessoal); só se alinham cabeçalho e largura (lote D).
3. "Lista de faturas sem valor/data/obra" — o cartão já mostra data, obra e total quando existem (`FaturasPage:243-252`); a captura tinha dados sem esses campos.
4. "Backup: círculos de rádio sem ação" — são o indicador de progresso por tabela (`idle`/`concluido`/`erro`), não seleção.
5. "Botão final do pedido de abastecimento tapado pela barra" — o `main` tem `pb-20` e o botão aparece ao deslizar; não é bug.
6. "Checkboxes 16×16 na manutenção" — a linha inteira (`label` com `py-2.5`) já é o alvo (~42px).
7. "Classificar fatura com padding do `main`" — o full-bleed é intencional (split PDF/linhas); corrigem-se só título e tipografia.
8. "`text-gray-*` no Livro de obra" — está no cabeçalho `hidden print:block`; impressão mantém tinta explícita.
9. "EPIs: lista global de vencimentos por omissão" — funcionalidade nova fora do pedido; só se melhora o estado vazio.
10. "Trocar todos os `<select>` nativos pelo `Select` Radix" — o nativo é melhor no telemóvel; uniformiza-se o aspeto com `CampoSelect`.
Também fora: sheet "Filtros" em mobile (componente novo de comportamento; os filtros passam a 2 colunas), mapa Google no escuro, virtualização (basta paginar).

## Verificação final (controlador, depois de todos os lotes)
1. `npm run typecheck` → 0 erros.
2. `npx vitest run src/__tests__` → tudo verde (e `npm test` completo antes do commit final).
3. `npm run build` → sem erros.
4. Passagem visual com `agent-browser` contra o Supabase **local** (confirmar `supabaseUrl` loopback antes do login), papéis admin, gestor, armazem,
   mecanico, motorista, medicoes, leitura, em **1440 claro/escuro** e **390 claro/escuro**: `/`, `/armazem`, `/armazem/inventario`, `/armazem/movimento/saida`,
   `/armazem/ferramentas`, `/obras`, `/obras/:id`, `/obras/subempreitadas`, `/frota`, `/abastecimento`, `/abastecimento/historico`, `/relatorios`,
   `/auditoria`, `/colaboradores`, `/picagens`, `/epis`, `/alertas`. Critérios: sem overflow horizontal, sem erros de consola, alvos ≥ 40px em 390,
   nenhuma data com "De"/"Feira" maiúsculos, números com vírgula, convite push nunca por cima do cabeçalho nem da pesquisa.
5. Comparar capturas antes/depois de cada lote e anexar a lista ao relatório final.
