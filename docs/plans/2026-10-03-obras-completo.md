# Plano — Módulo OBRAS completo

> Desenho e contrato de dados: `docs/superpowers/specs/2026-10-03-obras-completo-design.md` (**fonte da verdade**: nomes de RPC,
> colunas e formas de retorno não se mudam sem atualizar o desenho). Método como Armazém/Frota (`docs/plans/2026-10-02-frota-completa.md`).

## Regras para todos os agentes
- Ler `CLAUDE.md`, o desenho acima e, como exemplo de estilo, `src/features/frota/**` (db.ts, services, hooks, FrotaLayout) e `supabase/tests/frota-completa.test.mjs`.
- Português europeu na UI, sem comentários de "o quê", sem `as any`, sem N+1, um módulo nunca importa de outro.
- Só tocar nos ficheiros da sua tarefa. Se precisar de algo fora, dizer no relatório final (não editar).
- Escrever scripts em ficheiros (nunca heredocs com backticks/`$$` na shell Bash).
- Cada tarefa fecha com: `npm run typecheck` (0 erros) e os testes do seu âmbito a verde; commits **não** (o coordenador comita).
- Não aplicar migrations em produção. O banco de testes é o pg-harness (PGlite) com todas as migrations.

## Fase 1 (em paralelo)
### T1 — Banco (`supabase/migrations/20261003000000_obras_completo.sql` + `supabase/tests/obras-completo.test.mjs`)
Implementar §3 inteiro do desenho. Ler antes: migrations de obras/subempreiteiros/autos/retenção/livro-obra/picagens/ferramentas/armazém/frota/custos para reutilizar
(`armazem_materiais_por_obra`, `custos_materiais_por_obra`, `veiculo_entregas`, `emprestimos_ferramentas`, `picagens`, `colaboradores`, `profiles`, `auth_role()`).
Substituir o uso inseguro `auth.jwt()->>'role'` nas tabelas tocadas por `auth_role()` apenas onde mexer; não alterar o resto. RLS e GRANT/REVOKE explícitos, `SET search_path`,
funções `STABLE` onde der. Testes (≥ 60) cobrem: cada papel (admin/gestor/medicoes/armazem/leitura/mecanico/motorista/autor designado), validações, estados, datas futuras, imutabilidade do relatório
submetido e reabertura, progresso (fases > aferição > subs), saúde (cada regra), `obra_equipa_lista` com picagens, cruzamentos frota/ferramentas/materiais, `sub_painel`, storage (caminhos e permissões),
a view `obra_fotos_todas`, eventos de atividade. Teste de mutação manual (script no scratchpad) nas regras críticas. Documentar no topo da migration.

### T2 — Fundação do frontend (`src/features/obras/**` base, rotas, menu)
Criar: `db.ts` (tipos de todas as tabelas/RPCs do desenho + `obrasDb`), `lib/` (`progresso.ts`, `saude.ts`, `clima.ts`, `mapas.ts` [parse de coordenadas e links Google Maps, URLs de embed/abrir/navegar], `fotosObras.ts` [reduzir+enviar, URL pública, URL assinada de contrato], formatos),
`services/obrasService.ts` + `hooks/useObras.ts` (obras_painel, obra_visao, obra_guardar, listas) — **manter** as exportações antigas usadas por outros módulos (`useObra`, `useObras`, `listarObras`…) até ao fim; `components/ObrasLayout.tsx` (separadores),
`ObrasPainelPage` (dashboard elegante), `ObrasListaPage`, `ObraFormPage` (criar/editar com `MapaObra` + `MapaPicker`: colar link/coordenadas, GPS, pré-visualização embed, abrir/navegar; geofence existente mantém-se), `ObraFichaPage` (cabeçalho, ações, separadores `?sec=` e **um ficheiro stub por secção** em `components/ficha/<Secao>.tsx` com props `{ obraId: string }`),
`components/FotosGaleria.tsx` + lightbox + `FotoCapture` (reutilizar o padrão de `src/app/components/FotoInput.tsx` sem o importar — copiar a lógica para o módulo ou mover para `src/components` partilhado, o que for mais limpo).
Rotas em `src/app/routes.tsx` (§2 do desenho, incluindo todos os redirects com `Redirecionar`), menu (`Sidebar.tsx`, `MobileBottomNav.tsx`, pesquisa global se referir obras/subs), `public/_headers` (CSP: `frame-src https://maps.google.com https://www.google.com`).
Tem de deixar tudo a compilar: as rotas de subempreitadas/autos/relatórios apontam inicialmente para os ecrãs antigos ou stubs que T5/T6 substituem.
Testes: Vitest dos `lib/` (parse de mapas com todos os formatos, saúde/progresso de apresentação), do painel e do formulário.

## Fase 2 (em paralelo, depois de T1 e T2)
### T3 — Ficha: Resumo, Progresso, Fotos, Atividade (`components/ficha/{Resumo,Progresso,Fotos,Atividade}.tsx` + serviços/hooks próprios)
Resumo: KPIs (progresso real vs esperado, prazo, orçamento vs custo, saúde e motivos), mapa com Navegar, dados do cliente/responsável/engenheiro, contagens que ligam às secções, últimos relatórios e atividade, ações rápidas (relatório diário, aferição, foto).
Progresso: fases (criar/editar/apagar, peso, barra) e **aferições do engenheiro** (formulário completo: percentagem, resumo, problemas, atrasos e motivo, clima, fotos da câmara/galeria; lista cronológica com fotos). Fotos: galeria unificada (`obra_fotos_todas`) com filtros por origem, adicionar da câmara/galeria, lightbox. Atividade: linha do tempo `obra_eventos_lista`.
### T4 — Ficha: Equipa, Frota, Ferramentas, Materiais (`components/ficha/{Equipa,Frota,Ferramentas,Materiais}.tsx` + serviços/hooks)
Equipa (alocar/remover, função, presentes hoje, último ponto; designar quem escreve relatórios — `obra_definir_autores`), Frota (máquinas em destaque, quem conduz, desde quando; histórico), Ferramentas (emprestadas agora, há quantos dias, histórico), Materiais (enviado/devolvido/líquido/valor, totais, exportar CSV com `exportCsv`).
### T5 — Relatórios diários (`components/relatorios/**`, `ficha/Relatorios.tsx`, página `/obras/relatorios`)
Formulário móvel (clima + descrição + temperatura, equipa presente da equipa alocada com marcação rápida + outros, subempreiteiros presentes, trabalhos, ocorrências com campo condicional, observações, fotos da câmara **ou** galeria com legenda), guardar rascunho automaticamente, submeter com validação; ver (imprimível), reabrir (admin); lista para o CEO com filtros e destaque de ocorrências; cartão "Relatórios" no `ReportsPage` do módulo Relatórios (`src/app/pages/ReportsPage.tsx`, só acrescentar o atalho).
### T6 — Subempreitadas integradas (`components/subempreitadas/**` e ecrãs migrados de `src/app/pages/{Subempreiteiro*,Auto*}.tsx`)
Lista geral com semáforo (`subs_resumo`), formulário (contratação + ficha), **ficha do CEO** (`sub_painel`: contrato/executado/pago/retenção/atrasos/ocorrências, contrato anexado com ver/substituir/remover por URL assinada, ocorrências com fotos e resolução, autos), auto de medição com **evidências** (fotos, anotações, problemas, atraso, clima, progresso físico) e visualização/PDF com as provas; `ficha/Subempreitadas.tsx` da obra. Manter validar/retenção/pagamento existentes e os seus testes.

## Fase 3 (coordenador)
Integração, `docs/19-obras.md`, README/CLAUDE.md, suite completa (Vitest + banco + Node 24), build, agent-browser (local; Cloudflare), commit/push e entrega da migration ao utilizador.
