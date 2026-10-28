# A2 — Edge Functions e infraestrutura

Cobertura: as 7 Edge Functions (`admin-utilizadores`, `extrair-fatura`, `ler-foto-abastecimento`, `notificar-abastecimento`, `send-push-frota`, `pump-status`, `enviar-resumo-alertas`) e `_shared/*`; `supabase/config.toml`; `public/_headers`; `src/sw.ts`; segredos no working tree e no histórico (261 commits, todas as refs); `.githooks`; `.github/workflows`; `npm audit` (completo e `--omit=dev`). Definições vigentes de RPCs/policies/buckets confirmadas na BD local de testes.
Não coberto: estado real do deploy em produção (se `verify_jwt` foi desligado à mão no Dashboard, segredos configurados, `app.edge_function_secret` na BD); `src/app/lib/push.ts` e a fila offline após logout (só vi que a fila fica de propósito); execução dos testes Deno.

### A2-01 `send-push-frota` e `enviar-resumo-alertas` sem `verify_jwt = false` no config.toml
- Severidade: Alta
- Onde: `supabase/config.toml:383-389` (só `pump-status` e `notificar-abastecimento`); chamadores em `supabase/migrations/20260929040000_fase9_agendar_push_frota.sql:74-79` e `20260902070000_agendar_email_alertas.sql:23-27`; guarda `supabase/tests/edge-config.test.mjs` (só cobre 2 funções)
- Evidência: o pg_cron chama `send-push-frota` com `apikey: sb_publishable_…` e `x-frota-secret`, sem JWT; chama `enviar-resumo-alertas` com `Authorization: Bearer <EDGE_FUNCTION_SECRET>` (string aleatória, não JWT). Sem entrada `[functions.X] verify_jwt = false`, `supabase functions deploy` publica com `verify_jwt = true` (o default) e a gateway responde 401 antes de a função correr. É exatamente o defeito que o "pente fino" 2026-10-20 corrigiu só para `notificar-abastecimento`. Cenário: deploy pelo CLI → o push diário da frota (07:00 UTC) e o email diário de alertas nunca chegam, sem erro visível na app.
- Correção proposta: acrescentar `[functions.send-push-frota] verify_jwt = false` e `[functions.enviar-resumo-alertas] verify_jwt = false` (ambas validam segredo próprio, falham fechadas) e alargar o teste-guarda; confirmar no Dashboard como estão em produção.
- Teste que prova: `edge-config.test.mjs` com `it.each(['pump-status','notificar-abastecimento','send-push-frota','enviar-resumo-alertas'])` → `verifyJwt(f) === 'false'` (falha hoje nas duas novas).

### A2-02 `npm audit --omit=dev --audit-level=high` falha: CI "Segurança" vermelho (dompurify crítico, via jspdf)
- Severidade: Média
- Onde: `.github/workflows/ci.yml` (job `seguranca`); `package.json` → `jspdf@4.2.1` → `dompurify@3.4.16` (intervalo vulnerável `<=3.4.16`)
- Evidência: `npm audit --omit=dev` → 1 crítica (GHSA-cg2g-xh64-v4q7 SAFE_FOR_TEMPLATES bypass; mais uma alta IN_PLACE e uma baixa SMIL, mesmo pacote). Exploração real: não. O DOMPurify só entra no `jsPDF.html()`; `src/app/lib/pdf/gerarPdf.ts` usa `html2canvas-pro` + `addImage` e nenhum `.html(` existe em `src/`. Mas o gate do CI fica vermelho e bloqueia `main`/deploys. Correção disponível sem salto de versão major (`fixAvailable: true`).
- Correção proposta: `npm audit fix` (ou `overrides` para `dompurify >=3.4.17`), repetir o audit, correr os testes de PDF.
- Teste que prova: `npm audit --omit=dev --audit-level=high` → exit 0 (é o próprio passo do CI).

### A2-03 Endpoint de push controlado pelo cliente → pedido de saída do servidor (SSRF cego) nas duas funções de push
- Severidade: Média
- Onde: `supabase/functions/notificar-abastecimento/index.ts` (`enviar`, `fetch(sub.endpoint …)`) e `send-push-frota/index.ts` (idem); tabela `push_subscriptions` com policy `push_sub_insert_own` (`WITH CHECK auth.uid() = user_id`, sem validação de `endpoint`)
- Evidência: qualquer utilizador autenticado (inclui `motorista` e `leitura`) insere uma linha com `endpoint = 'http://alvo-interno/…'`, `p256dh`/`auth` quaisquer. Quando essa pessoa é destinatária (o `motorista` é `solicitante_id` e recebe o evento DECISAO ao ser decidido o seu pedido; aprovadores/destinatários da frota idem), a função faz `POST` a esse URL com o cabeçalho `Authorization: vapid t=<JWT assinado com a chave privada VAPID>`, TTL e corpo cifrado. Sem restrição de esquema/host: HTTP, IPs privados e metadados também. O JWT assinado só serve para `aud` = origem escolhida pelo atacante (não é reutilizável noutros serviços), logo o impacto é pedido cego a partir da rede do Supabase + revelar o IP da função, não roubo da chave.
- Correção proposta: CHECK/trigger em `push_subscriptions.endpoint` (`https://` e host em allowlist: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`) e a mesma validação em `enviar()` antes do `fetch`.
- Teste que prova: teste de BD `push-subscriptions.test.mjs`: INSERT com `endpoint='http://169.254.169.254/x'` como `authenticated` → falha; teste Deno: `enviar({endpoint:'http://localhost/x'})` não chama `fetch`.

### A2-04 `extrair-fatura` apaga as linhas antes de a Gemini responder
- Severidade: Média
- Onde: `supabase/functions/extrair-fatura/index.ts:~125` (`// Limpar linhas anteriores em caso de re-extracção` + `delete()`), contradiz o comentário e o 2.º `delete` perto do fim
- Evidência: o `delete().eq('fatura_id')` corre antes do download e da chamada Gemini. A fatura em estado `EXTRAIDA` pode ser re-extraída (`['RECEBIDA','EXTRAIDA']`). Cenário: fatura EXTRAIDA com linhas já revistas/classificadas pelo gestor → carregar "extrair" outra vez → Gemini devolve 503/429 (comum, o próprio código de `ler-foto` trata disso) ou JSON inválido → resposta de erro, mas as linhas ficaram apagadas e a fatura continua `EXTRAIDA` sem linhas. Também `normalizar(l.descricao)` rebenta com 500 se a Gemini devolver `descricao: null`, e valores não numéricos em `quantidade`/`total_linha` só falham no INSERT, depois de já se ter apagado (a segunda eliminação protege parcialmente, a primeira não).
- Correção proposta: remover o primeiro `delete`; validar/coagir `extracted.linhas` (descricao string não vazia, números finitos ou null) antes de tocar na BD; idealmente apagar+inserir numa RPC transacional.
- Teste que prova: teste Deno com `fetch` da Gemini a devolver 503 numa fatura EXTRAIDA com 3 linhas: depois da resposta de erro, `linhas_fatura` da fatura continua com 3.

### A2-05 Vulnerabilidades só de desenvolvimento (não vão para o bundle)
- Severidade: Baixa
- Onde: `npm audit` completo → 12 (1 crítica = a do A2-02; 3 altas; 3 moderadas; 5 baixas)
- Evidência: `vite@6.4.3` (alta: bypass do `launch-editor` no Windows; só servidor de dev, correção sem major); `undici@8.11.2` via `jsdom` (altas: TLS bypass, cache poisoning; só testes, nunca ligado a hosts reais); `zod@4.6.5` via `eslint-plugin-react-hooks` (alta: DoS de memória, só lint); `vitest/@vitest/mocker` (moderada, dev); `fast-uri` (moderada); `workbox-build`/`@rollup/plugin-node-resolve`/`deepmerge`/`serialize-javascript` (baixas, build-time; o único `fixAvailable` é `vite-plugin-pwa@0.2.1`, major e retrocesso — não aplicar). Nenhuma explorável no uso real: o servidor de dev só corre localmente e o deploy é estático no Cloudflare.
- Correção proposta: `npm audit fix` resolve vite, vitest, undici, zod, fast-uri sem major; deixar as baixas do workbox até sair correção upstream.
- Teste que prova: `npm audit --json` → `metadata.vulnerabilities.high == 0`.

### A2-06 Hook pre-commit com cobertura estreita de segredos
- Severidade: Baixa
- Onde: `.githooks/pre-commit` (`SECRET_PATTERNS`, `case` que salta `supabase/functions/*` e `supabase/tests/*`)
- Evidência: padrões = `sb_secret_`, `papel de serviço`, `SUPABASE_SERVICE_<papel>`, `sk-…`, JWT HS256 padrão. Não apanha `AIza…` (Gemini), `re_…` (Resend), `ghp_…`, VAPID privada, `PUMP_POLO2_SECRET=` nem `x-pump-secret` com valor; e as Edge Functions (onde essas chaves seriam coladas) estão isentas. O CI compensa com gitleaks (`useDefault = true`, `.gitleaks.toml`), que cobre `AIza`/`re_`/`ghp_`; mas só depois do push. Não encontrei nenhum segredo real (ver abaixo), portanto é só cobertura.
- Correção proposta: acrescentar `AIza[0-9A-Za-z_-]{30,}|re_[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{30,}|BEGIN [A-Z ]*PRIVATE KEY` e deixar de isentar `supabase/functions/` (a isenção só existia por causa de `SERVICE_ROLE_KEY`; basta allowlist dessa linha).
- Teste que prova: ficheiro staged com `AIza` + 35 caracteres → o hook sai com código 1.

### A2-07 Email diário de alertas injeta texto da BD sem escape
- Severidade: Baixa
- Onde: `supabase/functions/enviar-resumo-alertas/index.ts` (`rowHtml`: `${a.entidade_nome}`, `${a.entidade_detalhe}`)
- Evidência: nomes de viatura/colaborador/EPI entram em HTML tal e qual. Quem edita esses nomes (gestor, mecânico, armazém) pode meter `<a href=…>` ou HTML no email que o gestor recebe (clientes de email bloqueiam scripts, mas links de phishing dentro de um email "oficial" passam). Exige conta com escrita.
- Correção proposta: função `esc()` (`& < > " '`) nos dois campos.
- Teste que prova: `buildEmail` com `entidade_nome='<a href=x>'` → saída contém `&lt;a href=x&gt;`.

### A2-08 Bucket `faturas-fornecedor` legível por qualquer utilizador autenticado
- Severidade: Baixa
- Onde: policy `storage_faturas_select` (`bucket_id='faturas-fornecedor'`, sem `auth_role()`), `20260923000000_fix_rls_faturas.sql`; coerente com `faturas_select USING (true)` na tabela
- Evidência: um `motorista`/`leitura` consegue listar e descarregar os PDFs de faturas de fornecedor (valores, NIF de empresas). Dados financeiros da empresa, não pessoais; o INSERT/DELETE já exigem admin/gestor. Registo, na linha do que a tabela já permite.
- Correção proposta: se se quiser restringir, `auth_role() IN ('admin','gestor','medicoes')` na policy e na tabela em conjunto.
- Teste que prova: como `leitura`, `storage.from('faturas-fornecedor').list()` → vazio.

### A2-09 Buckets públicos com fotos de pessoas e de viaturas
- Severidade: Baixa
- Onde: `storage.buckets`: `rh`, `obras`, `armazem`, `frota-docs`, `frota-checklists`, `combustivel-taloes` com `public = true`; já documentado em `docs/22-seguranca-operacao.md:236`
- Evidência: não há policy SELECT em `storage.objects` para estes buckets, logo não há listagem; o acesso é por URL com UUID + timestamp. Risco residual: quem receber/guardar um URL (ex.: foto de perfil/colaborador do bucket `rh`) mantém acesso para sempre. `frota-docs` guarda documentos de viatura (seguro/IPO) pelo mesmo mecanismo. Decisão já assumida; fica registada.
- Correção proposta: migrar `rh` e `frota-docs` para bucket privado com URLs assinados (já previsto na doc).
- Teste que prova: `GET /storage/v1/object/public/rh/…` sem token → 400/404 depois da mudança.

### A2-10 `admin-utilizadores`: desativar não corta a sessão ativa e vários eventos não são auditados
- Severidade: Baixa
- Onde: `supabase/functions/admin-utilizadores/index.ts` (`desativar`, `reativar`, `criar`, `convidar`)
- Evidência: `updateUserById(ban_duration)` impede novo login/refresh, mas o JWT já emitido (até 1 h) continua aceite pela RLS. Só `redefinirSenha`, `linkRecuperacao` e `removerMfa` chamam `_registar_evento`; `desativar`, `reativar`, `criar`, `convidar` não deixam rasto de segurança (`alterarPapel` fica registado por `promover_role`). Cenário: colaborador despedido mantém acesso até 1 h; nenhum registo de quem o desativou.
- Correção proposta: chamar `_registar_evento` nessas 4 ações; opcionalmente `admin.auth.admin.signOut(userId)` ao desativar.
- Teste que prova: teste Deno `index_test.ts`: ação `desativar` → RPC `_registar_evento` chamada com `p_tipo` de desativação.

### A2-11 Respostas de erro devolvem detalhe interno; push sem idempotência forte
- Severidade: Baixa
- Onde: `extrair-fatura/index.ts` (`Erro na API Gemini … ${errBody.slice(0,300)}`, `Erro ao descarregar ficheiro: …`); `notificar-abastecimento` (`detalhe: autErr.message`, `detalhe: pedErr.message`); `notificar-abastecimento` DECISAO sem marca anterior; `NOVO` marca `push_notificado_em` só depois do envio
- Evidência: as mensagens vão para o browser (gestor) ou para o `net.http_post` do trigger (o segredo é necessário), sem chaves nem tokens; por isso só ruído. Dois pedidos concorrentes de NOVO para o mesmo pedido passam ambos `podeNotificarNovo` e duplicam o push; DECISAO reenviado volta a notificar. O trigger só dispara uma vez por transição, logo exige repetição manual do pedido com o segredo.
- Correção proposta: reservar atomicamente (`UPDATE … SET push_notificado_em = now() WHERE push_notificado_em IS NULL RETURNING`) antes de enviar e repor se nada for entregue.
- Teste que prova: duas chamadas simultâneas NOVO com o mesmo `pedido_id` → só uma chama `fetch` aos endpoints.

## Verificado e OK
- **Segredos**: `git grep` no working tree e `git log --all -G` no histórico (`sb_secret_`, `AIza…`, `re_…`, `ghp_…`, JWT HS256 de 3 partes, `PRIVATE KEY`, `papel de serviço…eyJ`) → zero resultados; só `sb_publishable_*` (pública por desenho) e `.env.example` foram commitados; `.gitignore` cobre `.env*`, `*.pem`, `*.key`. Chaves das Edge Functions lidas só de `Deno.env.get()`.
- **Autenticação das funções**: `admin-utilizadores` (JWT + `auth_role()='admin'` + rate limit por utilizador + schema de validação por ação + `promover_role` pelo cliente do chamador, auto-desativação bloqueada); `extrair-fatura` (gestor/admin, UUID validado, rate limit, fatura lida só pelo `id`); `ler-foto-abastecimento` (sessão, caminho com regex fixa, bucket fixo, pedido do próprio utilizador, 10 MB, sem URL vindo do cliente → sem SSRF); `pump-status`/`notificar-abastecimento`/`send-push-frota` (segredo comparado em tempo constante ou via RPC `*_autorizado` só para `papel de serviço`, segredo de ≥ 32 caracteres, falha fechada; limite de falhas por IP e global em `pump-status`); `enviar-resumo-alertas` falha fechada sem `EDGE_FUNCTION_SECRET`.
- **CORS**: allowlist explícita (prod, pages.dev, previews `*.encivil-gestao.pages.dev`, localhost); nunca `*`, sem credenciais permissivas; `origemRecusada` devolve 403; `Vary: Origin`.
- **Limitador** `rate_limit_consumir`: só `papel de serviço`, chave limitada a 200 caracteres, evento só na 1.ª recusa; falha aberta documentada e aceitável.
- **`public/_headers`**: `script-src 'self'` (sem `unsafe-inline`/`unsafe-eval`), `style-src 'unsafe-inline'` justificado (Radix/Recharts), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, HSTS 2 anos com preload, `nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy` (a app não usa câmara/microfone por API: sem `getUserMedia`), COOP/CORP. `connect-src https://*.supabase.co` é largo (qualquer projeto Supabase) mas só conta com XSS, que o `script-src` estrito torna improvável. Único `dangerouslySetInnerHTML` (`ui/chart.tsx`) injeta CSS com cores da config, não dados do utilizador.
- **`src/sw.ts`**: `*.supabase.co` em `NetworkOnly` (nada autenticado em cache); caches de assets só estáticos (os regex de `.png/.js` não casam com URLs cross-origin); logout apaga `supabase-api` e `sessionStorage`; navegação SPA com denylist de `/auth/`; push com payload vindo só do servidor.
- **CI** (`ci.yml`): `permissions: contents read`, actions fixadas por SHA, typecheck/build/test/edge/gitleaks (histórico completo); `backup-bd.yml` cifra com `age` e restaura em Postgres de teste; `pr-review.yml` só corre em PRs do próprio repo.
- **Push de frota**: marca `push_severidade` só depois de pelo menos um 2xx; remove subscrições 404/410; destinatários filtrados por `frota_alerta_destinatarios`.
