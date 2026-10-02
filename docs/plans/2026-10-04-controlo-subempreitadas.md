# Plano — Controlo de Subempreitadas e Auto-Medição (Obras)

> **Desenho (fonte da verdade):** `docs/superpowers/specs/2026-10-04-controlo-subempreitadas-design.md`. Nomes de tabelas, colunas, RPCs, assinaturas e
> regras **não se mudam** sem atualizar o desenho; se algo no desenho for impossível, o agente diz no relatório (não improvisa em silêncio).
> Ramo: `feat/controlo-subempreitadas` (sem push). Método: como `docs/plans/2026-10-03-obras-completo.md`.

## Regras globais (todos os agentes)
- Ler `CLAUDE.md`, o desenho e, como estilo, `src/features/obras/**`, `supabase/migrations/20261003000000_obras_completo.sql` e `supabase/tests/obras-completo.test.mjs`.
- Português europeu na UI/erros; sem comentários de "o quê"; sem `as any`; sem N+1; `useAsync`/`useMutation`; um módulo nunca importa de outro; filtros Supabase inline.
- **Só tocar nos ficheiros da sua tarefa** (propriedade abaixo). Outro agente trabalha em paralelo na mesma árvore: erros de typecheck/testes em ficheiros que não são seus não são teus — ignora-os e diz no relatório.
- Shell: scripts longos em ficheiros (nunca heredocs com crases/`$$` em Bash); no Windows usar caminhos absolutos entre aspas.
- Commits: `git add <só os teus ficheiros>` + `git commit -m "<tipo(âmbito): …>" -- <ficheiros>` (pre-commit corre typecheck; se falhar por ficheiros alheios, espera 1–2 min e repete; nunca `--no-verify`). Terminar a mensagem com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Sem push.
- Não aplicar migrations em produção; BD de testes = pg-harness (PGlite, sem PostGIS). Não usar o browser real/dados reais.
- Relatório final em ficheiro (`.superpowers/sdd/<tarefa>-report.md`: o que fez, comandos e resultados, desvios do desenho, dúvidas) e resposta curta: estado, commits, resumo de testes.

## Fase 1 (paralelo)
### T1 — Migration A + testes (`supabase/migrations/20261004000000_subs_orcamento_docs_evidencias.sql`, `supabase/tests/subs-controlo-a.test.mjs`)
Implementar §2 "Migration A" inteiro: `subs_config` (+ `subs_config_ler/guardar`), `obra_orcamento_itens` (+ guardar/apagar/resumo), ligação `subempreiteiro_artigos.orcamento_item_id` + trigger de obra,
`validar_subempreiteiro` com bloqueio de excesso, `sub_documentos` (+ registar/remover/estado, `_sub_docs_bloqueio`, extensão de `contrato_obra_valido` e policies de storage para `doc-<ts>.<ext>` **e** `fatura-<ts>.<ext>`), `auto_evidencias`
(+ `_distancia_m`, registar/apagar/lista). RLS/GRANT/REVOKE explícitos, `SET search_path`, cabeçalho documentado. **A coluna `workflow` ainda não existe**: `auto_registar_evidencia`/`auto_apagar_evidencia`
tratam o auto como editável quando `estado = 'rascunho'` e, **se a coluna `workflow` existir** (consultar `information_schema` dentro da função), exigem `workflow IN ('rascunho','submetido')` — a Migration B só acrescenta a coluna.
Testes (≥ 60) por papel (admin, gestor, medicoes, armazem, leitura, mecanico, motorista, autor designado), validações e limites, config só admin, EAP e excesso (com tolerância), artigo de outra obra, documentos (cada estado e tipo em falta), evidências (hora futura/antiga, hash repetido,
sem GPS, precisão, fora/dentro do raio, obra sem coordenadas, caminho inválido, imutabilidade), grants/RLS. Teste de mutação manual (script no scratchpad) em: excesso de orçamento, hash único, raio, idade da foto.
### T3 — Fundação do frontend (`src/features/obras/db.ts` [só acrescentar], `lib/medicao.ts`, `lib/geo.ts`, `lib/compliance.ts`, `services/subsControloService.ts`, `hooks/useSubsControlo.ts`, testes em `src/__tests__/features/obras/`)
Tipos em `db.ts` para **todas** as tabelas/RPCs do desenho (A e B, incluindo `validar_auto`, `marcar_auto_pago`, `criar_auto_rpc`, `sub_libertar_retencao`) com o padrão existente (`obrasDb`).
`lib/`: funções **puras** que espelham o SQL — `certificado(valor, glosado)`, `retencao(certificado, pct)`, `aPagar(...)`, `saldoArtigo(prevista, acumulada)`, `validarLinhasAuto(...)` (as pré-condições de `auto_submeter` que são deterministas no cliente),
`alcadaNecessaria({certificado, temExtras}, cfg) → 'gestor'|'admin'`, `bloqueiosPagamento({fatura, docs, ocorrenciasAltas}, cfg) → string[]`, `distanciaM` (haversine) e `avaliarEvidencia`, `estadoDocumento(validade, hoje, avisoDias)`, `estadoDocs(...)`.
`services/subsControloService.ts`: um wrapper tipado por RPC (assinaturas do desenho, `if (error) throw error`); `hooks/useSubsControlo.ts`: `useAsync` com `cacheKey` por obra/sub/auto e `useMutation` com `invalidates` corretos
(`subs-resumo-*`, `sub-painel-*`, `auto-*`, `orcamento-*`, `subs-ceo-*`, `subs-fluxo-*`, `sub-docs-*`). Exportar tudo por `index.ts` do módulo se já houver esse padrão. Testes Vitest ≥ 40 (todos os ramos das funções puras; serviços com mock).

## Fase 2 (paralelo, depois de T1 e T3)
### T2 — Migration B + testes (`supabase/migrations/20261004010000_subs_medicao_workflow_glosas_painel.sql`, `supabase/tests/subs-controlo-b.test.mjs`; atualizar `supabase/tests/obras-completo.test.mjs` só onde `validar_auto`/métricas/`executado` mudarem de semântica)
Implementar §2 "Migration B" inteiro (workflow, imutabilidade por trigger com `app.auto_rpc`, verificações, glosas, todas as RPCs da tabela de fluxo, `validar_auto` delegando, `marcar_auto_pago` com os bloqueios, `sub_libertar_retencao` + REVOKE do INSERT direto em `liberacoes_retencao`, `_subs_metricas`/`sub_painel`/`subs_resumo` com certificado e novos campos, `subs_painel_ceo`, `subs_fluxo_caixa`, eventos).
Backfill `workflow='validado'` onde `estado='validado'`. Manter compatível: `criar_auto_rpc`, `auto_guardar_evidencias`, colunas legadas. Testes (≥ 90): cada pré-condição de cada RPC (positivo e negativo), alçada (gestor/admin, extras), segregação (admin isento), docs em falta/exceção só admin, glosas e invariante `pago + por_pagar + retencao = executado`, imutabilidade pós-submissão (UPDATE/DELETE direto falha),
fatura/pagamento/bloqueio por ocorrência alta, libertação de retenção (teto), painel CEO e fluxo de caixa (valores exatos), grants/RLS por papel, anon sem acesso. Mutação manual em: alçada, quantidade acumulada, hash/geofence via verificação, bloqueio de pagamento, teto da retenção.
### T4 — UI Orçamento + Documentos + Configuração (`src/features/obras/components/ficha/Orcamento.tsx`, `components/subempreitadas/SubDocumentos.tsx`, `components/subempreitadas/ConfigSubsDialog.tsx`, alterações em `ObraFichaPage.tsx`, `SubempreiteiroFormPage.tsx` [seleção EAP + aviso de excesso], `SubempreiteiroDetailPage.tsx` [separador Documentos])
Conforme §4: separador "Orçamento" na ficha (tabela por capítulo, orçado × contratado × medido, estados, adicionar/editar/apagar com `RoleGuard`/`useRole`); artigo→item EAP com aviso; documentos (lista com selo, carregar para o bucket privado `obras-contratos` com caminho `<sub>/doc-<ts>.<ext>`, ver por URL assinada, remover); diálogo de configuração (só admin).
Usar apenas hooks/serviços de T3. Testes de componente (render + interações principais + papéis).
### T5 — UI Auto de medição (`AutoFormPage.tsx`, `AutoDetailPage.tsx`, novos `components/subempreitadas/auto/{AutoPassos,AutoVerificacao,EvidenciaCapture,AutoGlosas,AutoFaturaPagamento}.tsx`)
Conforme §4 e a tabela de fluxo: colunas Pedida/Verificada/Acumulada/Saldo; passos e bloqueios em texto; botões por papel e estado; checklist; captura de evidência **só câmara** (`<input type="file" accept="image/*" capture="environment">`),
`navigator.geolocation.getCurrentPosition` com `enableHighAccuracy`, hash SHA-256 (`crypto.subtle`) da imagem reduzida (`reduzirFoto`), envio ao bucket `obras` pasta `autos`, depois `auto_registar_evidencia`; mostrar resultado (dentro/fora/precisão/hora);
glosas (aplicar/levantar); guardar a fatura do subempreiteiro (número, data, valor e **ficheiro** PDF/foto — o ERP não emite faturas), com aviso não bloqueante se o valor diferir do aprovado; pagar com exceção de admin (motivo). Erros do servidor mostrados tal como vêm (pt-PT). Testes de componente dos fluxos e dos bloqueios.
### T6 — UI Painel do CEO (`components/subempreitadas/painel/{PainelCEO,KpisSubs,TabelaSubs,FluxoCaixaSubs,AlertasSubs}.tsx`, alterações em `SubempreiteirosPage.tsx`, `ficha/Subempreitadas.tsx`, `SubResumoLista.tsx` se necessário)
Conforme §4: topo de `/obras/subempreitadas` com `subs_painel_ceo(null)` e na aba da ficha com `p_obra_id`; KPIs, tabela por subempreiteiro (desvio físico-financeiro, taxa de glosa, documentos, por pagar; ordenável; links), passivo documental, fluxo de caixa 12 semanas (barras SVG, cor **e** texto), alertas por gravidade; vazio/erro/loading; mobile first. Testes de componente com dados de exemplo.
### T7 — Compatibilidade e PDF (`src/features/obras/legacy/{autosService,subempreiteirosService,retencaoService}.ts` e hooks associados, `src/features/custos/services/custosService.ts`, `src/features/dashboard/hooks/useResumoObras.ts`, `src/features/contabilidade/contabilidadeService.ts`, `AutoPdfPage.tsx`, testes existentes dessas áreas)
`executado`/custos/dashboard/contabilidade passam a **certificado** (`valor_periodo − valor_glosado`); `criarLiberacao` usa `sub_libertar_retencao`; `autosService` expõe `workflow`, `valorGlosado`, `valorCertificado`, retenção calculada sobre o certificado; `validarAuto` chama `auto_aprovar`; `marcarAutoPago` aceita exceção; o PDF imprime glosas, fatura, aprovadores e nº de evidências válidas. Ajustar os testes existentes (`autos/autosService.test.ts`, `subempreiteiros/subempreiteirosService.test.ts`, contabilidade/custos/dashboard) e acrescentar novos.

## Fase 3 (integração — coordenador)
T8: contrato RPC×SQL estendido às duas migrations e a `legacy/` + `db.ts`; `docs/19-obras.md`, `docs/20-subempreitadas-controlo.md` (regras para o CEO, ordem das migrations, o que fica de fora), `README`/`CLAUDE.md` (módulos, migrations); suite completa (`typecheck`, `npm test`, `build`, `check:edge`, `test:edge`);
agent-browser (local; sem sessão só `/login` e redirecionamentos); revisão final de todo o ramo; entrega das migrations ao utilizador (ordem: `20261003000000`, `20261004000000`, `20261004010000`).

## Matriz de propriedade de ficheiros (sem sobreposição dentro de uma fase)
| Tarefa | Escreve em |
|---|---|
| T1 | `supabase/migrations/20261004000000_*`, `supabase/tests/subs-controlo-a.test.mjs` |
| T3 | `obras/db.ts`, `obras/lib/{medicao,geo,compliance}.ts`, `obras/services/subsControloService.ts`, `obras/hooks/useSubsControlo.ts`, `src/__tests__/features/obras/{medicao,geo,compliance,subsControlo}*.test.ts` |
| T2 | `supabase/migrations/20261004010000_*`, `supabase/tests/subs-controlo-b.test.mjs`, `supabase/tests/obras-completo.test.mjs` |
| T4 | `ficha/Orcamento.tsx`, `subempreitadas/{SubDocumentos,ConfigSubsDialog}.tsx`, `ObraFichaPage.tsx`, `SubempreiteiroFormPage.tsx`, `SubempreiteiroDetailPage.tsx` |
| T5 | `AutoFormPage.tsx`, `AutoDetailPage.tsx`, `subempreitadas/auto/**` |
| T6 | `subempreitadas/painel/**`, `SubempreiteirosPage.tsx`, `ficha/Subempreitadas.tsx`, `SubResumoLista.tsx` |
| T7 | `obras/legacy/**`, `custos/**`, `dashboard/hooks/useResumoObras.ts`, `contabilidade/**`, `AutoPdfPage.tsx` |
