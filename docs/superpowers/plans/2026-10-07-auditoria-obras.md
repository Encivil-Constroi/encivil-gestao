# Auditoria de Obras — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Corrigir falhas comprovadas na ficha, aferições, relatórios e proteções de Obras e registrar evidência de aptidão para produção.
**Architecture:** Manter React/hooks/serviços e Supabase como fonte de verdade. Ajustar a fronteira RPC sem mudar contrato público, proteger operações assíncronas no frontend e adicionar triggers/validação SQL sem alterar migrations existentes.
**Tech Stack:** React 18, TypeScript strict, Supabase/Postgres, Vitest/PGlite, agent-browser, Cloudflare Pages.
**Spec:** `docs/superpowers/specs/2026-10-07-auditoria-obras-design.md`.

## Restrições globais
- Preservar alterações anteriores; sem commit/push ou deploy não solicitado. Execução direta com revisão independente final.
- Produção apenas leitura; sem bypass de RLS, sem service role, sem secrets nos artefatos.
- Europe/Lisbon, UI pt-PT; serviços/hooks existentes, sem nova dependência entre módulos.
- Tipos gerados Supabase não editados; ajustar apenas `features/obras/db.ts`.

## Foco da revisão
- Objeto composto RPC versus array e ausência/erro de resposta.
- Upload lento com remoção/legenda e conclusão/cancelamento concorrentes.
- Saída antes do autosave, edição durante submissão e troca de relatório na mesma rota.
- Autoria forjada por INSERT/UPDATE direto e permissões negadas sobre custos.
- Foto inexistente e arquivo eliminado/modificado após vincular evidência.

## Tarefa 1 — ficha e contrato RPC
**Arquivos:** `src/features/obras/db.ts`, `services/obrasService.ts`, novo `src/__tests__/features/obras/visaoContrato.test.ts`.
**Interface:** `buscarVisao(id: string): Promise<ObraResumoRow>` permanece; `obra_visao` retorna objeto composto; aceitar array legado na fronteira.
- [ ] Testar objeto real, array legado, resposta vazia e erro; observar falha antes da correção.
- [ ] Corrigir tipo e seleção da linha, sem consultas adicionais nem fallback que esconda erro.
- [ ] Executar testes de serviço/ficha/contrato e validar obra existente no browser em leitura.

## Tarefa 2 — fotos, aferições e relatórios
**Arquivos:** `components/FotoCapture.tsx`, `components/ficha/Progresso.tsx`, `components/ficha/Fotos.tsx`, `components/RelatorioDiarioPage.tsx`, `hooks/useRelatoriosDiarios.ts`; testes de concorrência novos e existentes.
**Interface:** callback opcional `onUploadingChange(boolean)`; contratos RPC de gravação preservados.
- [ ] Testar upload pendente com legenda/remoção e tentativa de concluir; RED→GREEN.
- [ ] Ref da lista atual, bloqueio síncrono contra envio duplicado, estado de upload comunicado ao pai; desativar gravar/cancelar enquanto operação está pendente.
- [ ] Testar autor designado leitura e invalidação de galeria/eventos/últimos relatórios; alinhar hooks.
- [ ] Testar saída antes do autosave e submissão em curso; guardar antes de sair pelo link, aviso de fechamento, proteção de navegação SPA e serialização. Evitar navegar automaticamente após criação se a página já desmontou.
- [ ] Executar testes relevantes e de regressão; validar responsividade, erros e estados de engenharia.
- [ ] Limpar o cache remoto na saída/troca de identidade e impedir resposta em voo de repovoá-lo após a troca: `src/app/lib/useAsync.ts`, `src/features/auth/AuthContext.tsx`, teste de isolamento de cache. É a integração de autenticação necessária para não reutilizar dados de Obras de outra sessão.

## Tarefa 3 — banco e segurança
**Arquivos:** nova `supabase/migrations/20261007110000_obras_producao.sql`, novo `supabase/tests/obras-producao.test.mjs`; fixtures de storage de `subs-controlo-a/b.test.mjs`.
**Contratos:** assinaturas RPC permanecem; autoria passa a ser controlada pelo servidor; nova evidência exige arquivo real.
- [ ] Testes PGlite reproduzem autoria forjada/alterada, custos de papel negado, evidência ausente e remoção/alteração de objeto vinculado; RED antes da migration.
- [ ] Trigger de autoria e evidência; trigger de proteção storage; função de custos com autorização por obra. GRANT/REVOKE explícitos, search_path fixo. Sem DELETE/backfill destrutivo, sem nova tabela/índice redundante.
- [ ] Aplicar a mesma guarda de existência a `sub_documentos.path` e `autos_medicao.fatura_path`; preservar campos/assinaturas. Proteger objetos referenciados contra DELETE/UPDATE. Testar path ausente/incorreto e arquivo existente permitido; validar registros legados no preflight.
- [ ] Proteger também fotos JSON de `obra_afericoes`, `obra_relatorios_diarios`, `sub_ocorrencias`, `autos_medicao` e `obra_fotos.path`. Verificar novos paths; preservar edição histórica sem novo vínculo. Submissão de relatório revalida fotos atuais; aprovação/pagamento revalidam evidências do auto. Atualizar fixtures em `obras-completo.test.mjs` para uploads simulados, sem alterar assertions de validação/RLS.
- [ ] Fixtures de testes com upload antes de registrar evidência; não reduzir validações/asserts existentes.
- [ ] Validar todas as migrations, permissões permitidas/negadas, constraints/FKs/índices e compatibilidade de leitura histórica. Documentar consulta de preflight para fotos faltantes.

## Tarefa 4 — validação, revisão e relatório
**Arquivos:** `docs/19-obras.md`, novo `docs/auditorias/2026-10-07-obras.md`.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm run check:edge`, `npm run test:edge`; lint se existir configuração (não introduzir gate fictício).
- [ ] agent-browser em produção/local: abertura/abas em leitura; gravações só em banco isolado. Credenciais não persistidas. Rever console/logs sem copiar dados sensíveis.
- [ ] Revisão independente do diff delimitado, corrigir falhas importantes com RED→GREEN, repetir testes relevantes.
- [ ] Revisar git diff/check e escopo; distinguir alterações anteriores.
- [ ] Relatório com achados corrigidos, evidências, limites, passos manuais e critérios pendentes. Sem garantia absoluta sem validação operacional.

## Integrações, observabilidade e rollback
- RPC Supabase mantém erros originais; useAsync/useMutation reportam Sentry. Eventos SQL/audit_log existentes preservados; não logar credenciais/fotos/pessoas.
- Mapa não exige nova chave/integração. Não há Shelly neste escopo.
- Concorrência: manter row locks existentes, congelar edição no commit, bloquear upload/gravação duplicada. Conflitos entre usuários sem versionamento de rascunho devem ser verificados e descritos.
- Publicação: usuário aplica migration após as anteriores; conferir preflight, objetos/RLS e testar papéis antes de publicar frontend. Não aplicar automaticamente.
- Rollback frontend: restaurar apenas alterações desta tarefa. Banco: dados ficam preservados; correção progressiva preferida; não remover proteções de segurança como rotina.
- Riscos de regressão: testes antigos que inventam photos sem upload precisam de fixtures reais no storage simulado; consumidores de custos que não têm acesso serão recusados intencionalmente.
