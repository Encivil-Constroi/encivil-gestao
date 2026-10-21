# Obras — implementação e homologação de engenharia

Data: 08/10/2026. Base: `5ba4e4d`. Plano: [obras-homologacao](../superpowers/plans/2026-10-07-obras-homologacao.md). Desenho: [obras-homologacao-design](../superpowers/specs/2026-10-07-obras-homologacao-design.md).

## Resultado e âmbito

As falhas encontradas nesta auditoria foram corrigidas e os fluxos críticos foram homologados com dois utilizadores de engenharia em Supabase local real, incluindo Auth, PostgREST, Storage e RLS. A obra original «Obra teste 1» abriu na Cloudflare em consulta autenticada. A correção anterior de `obra_visao` preserva o retorno composto único da RPC; o serviço deixou de interpretá-lo como lista.

Esta entrega contém código e SQL prontos para publicação. Não houve commit, push, deploy, aplicação de SQL nem alteração de dados empresariais em produção. A versão publicada só recebe as novas guardas depois da publicação do frontend e aplicação da migration abaixo. O relatório de 07/10 permanece como histórico; as pendências de homologação local de engenharia e Storage ali identificadas foram verificadas nesta rodada.

## Correções e contratos

| Área | Comportamento final | Ficheiros principais |
|---|---|---|
| Identidade | Respostas atrasadas de perfil não substituem a sessão atual; logout invalida identidade/cache mesmo sem rede | `AuthContext.tsx`, `limparDadosLocais.ts` |
| Relatório diário | Reabrir/editar volta a proteger saída; autosave não altera relatório submetido ou já guardado | `RelatorioDiarioPage.tsx` |
| Cliente local | URL/chave selecionadas em par; loopback permitido só em DEV; configuração incompleta não mistura local/produção | `integrations/supabase/client.ts`, `config.ts` |
| Autos | Locks dos pais antes de ler workflow; dois pais bloqueados por UUID ordenado; submissão e linhas permanecem consistentes | migration `20261008100000_obras_concorrencia_mfa.sql` |
| MFA | Autor designado não contorna MFA obrigatório de admin/gestor | `pode_relatar_obra(uuid)` na mesma migration |
| Gates | Lint efetivo de TypeScript/Hooks; Vitest atualizado; dependências auditadas | `eslint.config.mjs`, `package.json`, `package-lock.json` |

Assinaturas públicas, tipos gerados, fronteiras de módulos e fonte de verdade SQL preservados. Não há novas tabelas, colunas, índices nem integração física nesta rodada. A migration redefine duas funções, mantém os contratos de triggers/RPC e explicita privilégios. Não altera migrations anteriores nem elimina dados. Nenhuma service role foi adicionada ao frontend; operações de domínio da homologação usam JWT dos utilizadores sintéticos.

Os ajustes mínimos para habilitar lint incluem captura das refs no cleanup de hooks/Auth, remoção de diretivas antigas inúteis, alias do ícone Infinity em EPIs, inicialização redundante no SW e guarda de inicialização do formulário de entrega da Frota por ID. A guarda da Frota tem regressões para resposta tardia e recarga da mesma entrega sem perder edição. Não são funcionalidades novas de outros módulos.

## Evidência de validação

Na árvore isolada estável: **182 ficheiros / 2.768 testes passaram**, typecheck, lint sem warnings, build, check:edge e **63 testes Edge** aprovados. Auditoria npm completa e de produção: zero vulnerabilidades. Revisão independente do conjunto: **0 críticos, 0 importantes, 0 menores** confirmados.

SQL: **385 testes focados** aprovados; todas as **86 migrations** da árvore isolada aplicadas no PostgreSQL 17.11. Reprodutor real de duas sessões: **7/7 cenários**, repetido após renomeação final da migration. Antes da correção, foi reproduzido auto submetido com total 100 e soma de linhas 9990; após a correção, alterações tardias são recusadas e totais coincidem. Trocas de pai opostas serializam sem deadlock.

API real local: **27/27 cenários**, com **6/6 verificações de preflight** de funções/triggers efetivas, repetidos após aplicação local da migration final. Cobertura: aferição com upload por engenharia 1, leitura por engenharia 2, autor designado permitido, motorista recusado, rascunho/submissão/imutabilidade/autoria, auto criado por engenharia 1 e verificado por engenharia 2, aprovação recusada a medições. DELETE, upsert e move de fotos vinculadas mantêm os bytes e os vínculos de aferição/relatório. DELETE pode responder 200 com lista vazia devido a RLS: o aceite exige que os bytes originais permaneçam, e não apenas um status HTTP.

Agent-browser, frontend local apontando explicitamente para `127.0.0.1:54321`:

- Engenharia 1 registou aferição de 25% com fotografia/legenda e submeteu relatório diário com equipa, trabalhos e fotografia; estado final consultável e sem edição.
- Engenharia 2 consultou a aferição e o relatório da primeira e registou aferição própria de 30%; relatório alheio submetido sem campos de edição.
- Rascunho alterado: saída mostrou «Guardar e sair»/«Continuar a editar»; guardar e reabrir preservou os dois textos.
- Ficha e Atividade sem rede mostraram retry; reconexão e retry recuperaram os dados. Mobile 390×844 sem overflow da página na ficha e relatório.
- Cloudflare: abertura autenticada de «Obra teste 1» confirmada, somente leitura. Não representa teste de escrita da nova versão em produção.

A CLI não preencheu corretamente o input nativo de data por `fill`; setter nativo/eventos permitiram guardar e carregar 06/10. Não se alterou o produto para acomodar a ferramenta. O log `errors` teve duas entradas vazias da CLI/desenvolvimento; não se afirma ausência global de erros. As vistas testadas não mostraram alertas de falha inesperada.

Credenciais sintéticas e evidências ficam exclusivamente em TEMP; não estão em git. Scripts reexecutáveis: `supabase/scripts/validar-obras-local.mjs`, `validar-obras-concorrencia.mjs`. O primeiro recusa APIs remotas e verifica as guardas reais antes de escrever.

## Publicação, validação operacional e rollback

1. Publicar o frontend segundo o procedimento do projeto. Ele mantém os contratos do banco anterior.
2. Aplicar manualmente **`supabase/migrations/20261008100000_obras_concorrencia_mfa.sql`**, depois das migrations anteriores, incluindo as que o utilizador informou já aplicadas. Esta migration é nova nesta auditoria. Timestamp final 100000 evita conflito com a migration independente de recuperação 090000 encontrada no checkout principal; só o nome/referências mudaram.
3. Seguir com Edge Functions se houver publicação de alterações de outras tarefas; esta rodada de Obras não altera Edge Functions.
4. Confirmar abertura da obra, aferição com fotografia, consulta pelo segundo engenheiro, relatório submetido imutável e negação de aprovação pelo papel medições. Conferir MFA obrigatório e definições das funções no projeto Supabase correto. Não usar dados reais como fixtures.

Rollback de frontend: reverter apenas os ficheiros desta entrega. Rollback SQL lógico comentado no final da migration, preservando dados; restaurar funções anteriores reabre os riscos de concorrência/MFA e exige avaliação antes do uso. Não remover histórico, fotos ou movimentos. Nenhuma nova telemetria com dados sensíveis: permanecem tratamento de erro/Sentry e auditoria de workflow existentes; observar erros de autorização, submissão e uploads após ativação.

## Autoauditoria e decisões

Revisados contratos, races, duplicidade, RLS/GRANT, autoria, MFA, integridade das fotos, cache entre identidades, tratamento de erro e diff. RED/GREEN de Auth/relatório, configuração e SQL; mutation check da guarda da Frota. Sem alterações em stock, movimentos ou automação física.

Decisões do controller: escrita de testes exclusivamente local; migration aditiva; execução automática conforme pedido; isolamento e integração apenas dos ficheiros próprios; sem publicação não solicitada. Custo operacional: nova migration manual e publicação do frontend necessárias. Durante retomada da stack, guardas locais foram recompostas em UTF-8 mantendo os dez triggers existentes e novamente validadas; assertions não foram relaxadas.

Limites: GPS/hash do browser não atestam captura física; nenhum teste de dispositivo foi necessário. Avisos preexistentes de engine: Node local 25.9.0 não é versão suportada pelo jsdom 30; CI usa Node 24 e deve estar em 24.15 ou superior. Cinco serviços legados mantêm casts históricos suprimidos, fora desta alteração. `00-source-of-truth.md` ainda descreve hospedagem/papéis/MFA antigos; seguiu-se a precedência explícita do `CLAUDE.md` e documentação atual de Obras.

## Integração no checkout principal

28 ficheiros de implementação/plano foram copiados e comparados byte a byte, após conferir que os alvos não continham alterações concorrentes (normalizando apenas CRLF na comparação com git). Trabalho simultâneo de recuperação/ajuda/auditoria foi preservado. Gates da árvore combinada e revisão final de escopo são registrados no fechamento abaixo.

Validação final no checkout principal: 193 ficheiros e 3.167 testes aprovados; 65 testes Edge aprovados; typecheck, lint sem warnings, build e check:edge aprovados. API local real 27/27 e concorrência PostgreSQL 7/7 repetidos após a renomeação final da migration. Auditoria de dependências de produção: zero vulnerabilidades. git diff --check aprovado.

Integração mínima adicional: em AuditoriaPage.tsx, a lista rows passou a usar useMemo para manter uma referência estável e cumprir exhaustive-deps. Trabalho concorrente preservado. Implementação e homologação concluídas; ativação em produção requer publicação do frontend seguida da nova migration 20261008100000_obras_concorrencia_mfa.sql.
