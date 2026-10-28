# A5 — Frontend transversal

Cobri: `routes.tsx` × `AuthGuard`/`RoleGuard`/`MainLayout` (restrição mecânico/motorista); `MATRIZ_ESCRITA` × `public.pode_escrever`
e policy `colab_write` vigentes (BD local `supabase_db_encivil-checkup`); `AuthContext` (sessão, troca de identidade, auto-logout),
`useEstadoMfa` × `auth_role()`/`mfa_em_falta()`, recuperação de senha (`entradaUrl.ts`, `ResetPasswordPage`); `useAsync`/`useMutation`;
filas offline de movimentos **e** de picagens; XSS (`dangerouslySetInnerHTML`, `href`/`src`, WhatsApp, CSP de `public/_headers`);
exportações CSV/XLSX/JSON; usos de `toISOString()` como data; `parseSupabaseError`; `ErrorBoundary`/`RouteErrorPage`/Sentry; `sw.ts` + `UpdatePrompt`.
NÃO cobri: execução real no browser (só leitura de código + BD local), comportamento exato de temporizadores em páginas congeladas
por SO/browser (A5-05 é provado por teste com relógio falso, não em dispositivo), conteúdo de PDFs gerados (só verifiquei ausência de HTML injetado).

---

### A5-01 Picagem de outro colaborador após troca de utilizador no mesmo telemóvel
- Severidade: Alta
- Onde: `src/features/picagens/components/PicagemPage.tsx:71`, `:77-82`, `:206-210`; `src/features/auth/lib/limparDadosLocais.ts:8` (`CHAVES_LOCAIS_COM_DADOS = []`)
- Evidência: `colaboradorId` arranca de `localStorage['enc_pic_colab']`, que **não** é limpo no logout. O efeito de auto-seleção só corre
  `if (colaboradorAtual && !colaboradorId)`. Quando há `colaboradorAtual`, a UI mostra `colaboradorAtual.nome — conta própria`, mas
  `handlePicar` envia `colaboradorId` (o do utilizador anterior). Cenário: telemóvel partilhado; A (colaborador X) pica → `enc_pic_colab=X`;
  A sai; B (colaborador Y) entra e abre `/picagens` → ecrã diz "Y — conta própria", toca "Entrada" →
  (a) B é `armazem`/`leitura`/…: a policy `picagens_insert` só aceita o próprio colaborador → erro "Sem permissão" e B **não consegue picar**
  (sem forma de corrigir na UI, o select está escondido); offline, fica na fila com X e é descartado ao sincronizar;
  (b) B é `gestor`/`admin` com ficha própria: a RLS aceita → **picagem gravada em nome de X**, sem aviso, e o histórico do dia mostrado é o de X.
- Correção proposta: quando `colaboradorAtual` existe, usar sempre `colaboradorAtual.id` (ignorar o guardado); e incluir `enc_pic_colab`/`enc_pic_obra`
  em `CHAVES_LOCAIS_COM_DADOS` para serem apagadas no logout.
- Teste que prova: `PicagemPage.test.tsx` "com colaboradorAtual=Y e enc_pic_colab=X, picar envia colaboradorId=Y"; `limparDadosLocais.test.ts` "remove enc_pic_colab".

### A5-02 Fila offline de picagens descarta picagens em falha de rede
- Severidade: Alta
- Onde: `src/features/picagens/offlineQueue.ts:84-88` (`isNetworkError`), `src/features/picagens/hooks/usePicagensOfflineQueue.ts:52-56`
- Evidência: o erro do supabase-js 2.108 é um **objeto simples** `{message:'TypeError: Failed to fetch',…}` (postgrest-js só cria
  `PostgrestError` com `throwOnError`). A versão de picagens faz `e instanceof Error ? e.message : String(e)` → `"[object Object]"` → não reconhece
  a falha de rede (`node -e`: `picagens false`, a de movimentos dá `true`). Cenário: telemóvel em obra com Wi-Fi sem internet / rede instável
  (`navigator.onLine === true`), fila com 3 picagens, flush → cada insert falha por rede → tratado como "erro de negócio" → `removeFromQueue` →
  as 3 picagens desaparecem, toast genérico "não puderam ser sincronizadas". O mesmo bug faz o caminho online (`usePicar.ts:82`) mostrar erro em vez de enfileirar.
- Correção proposta: reutilizar a lógica de `features/movimentos/offlineQueue.ts` (ler `e.message` de objetos) — ou mover `isNetworkError` para `@/app/lib`.
- Teste que prova: `picagens/offlineQueue.test.ts` "isNetworkError({message:'TypeError: Failed to fetch'}) === true".

### A5-03 Fila offline de movimentos apaga o movimento em erros transitórios do servidor (5xx/429)
- Severidade: Alta
- Onde: `src/features/movimentos/hooks/useOfflineQueue.ts:64-73`, `src/features/movimentos/offlineQueue.ts:109-113`
- Evidência: só falhas que casem `/failed to fetch|…|timeout/` mantêm o item; tudo o resto é removido da fila. A RPC é POST (postgrest-js não
  repete POST em 503/520) e um 502/503/522/429 do Cloudflare/Supabase chega como `{message:'<html>…502 Bad Gateway…'}` ou `'error code: 522'`
  → não casa (verificado com `node -e`: `502 html false`, `522 false`) → o movimento, já confirmado ao utilizador como "guardado offline",
  é apagado. Se o servidor não chegou a gravar, o movimento de stock perde-se; o toast manda "verificar os Movimentos" mas os dados (artigo,
  quantidade, obra) já não existem em lado nenhum. Relevante sob carga (é quando aparecem 5xx).
- Correção proposta: remover só com erro de negócio identificado (`code` `P0001`, `23xxx`, `42501`); qualquer outro mantém o item e conta tentativas
  (ex.: após N falhas, marcar "com erro" e mostrar os dados ao utilizador em vez de apagar).
- Teste que prova: `useOfflineQueue.test.ts` "erro {message:'error code: 522'} mantém o item na fila"; "erro {code:'P0001'} remove".

### A5-04 Mês do histórico de abastecimentos desfasado um dia durante a hora de verão
- Severidade: Média
- Onde: `src/features/combustivel/components/modulo/HistoricoAbastecimentos.tsx:19-29`, `:100-101`
- Evidência: `primeiroDiaMes`/`ultimoDiaMes` criam meia-noite **local**; `toISO` usa `toISOString()` (UTC). Em Lisboa (UTC+1, fim de março → fim de
  outubro) julho dá `dataInicio='2026-06-30'`, `dataFim='2026-07-30'` → a lista, os totais de litros/€ e a exportação XLSX de julho incluem 30/06 e
  **omitem 31/07**. Mesmo padrão: `AbastecimentoFormPage.tsx:28` (data por defeito = ontem entre 00h e 01h), `RelatorioCombustivelPage.tsx:42`
  (`hoje` errado entre 00h e 01h), `diaLabel` "Hoje/Ontem" (`:33-34`), nomes de ficheiro em `exportCsv.ts:26`/`exportXlsx.ts:59`/`exportJson.ts:7`.
- Correção proposta: usar `dataISOLocal`/`hojeLisboa` de `@/app/lib/dataLisboa` nesses pontos.
- Teste que prova: com `TZ=Europe/Lisbon`, filtros de julho/2026 = `{dataInicio:'2026-07-01', dataFim:'2026-07-31'}`.

### A5-05 Auto-logout: atividade depois do prazo renova a sessão em vez de a terminar
- Severidade: Média
- Onde: `src/features/auth/AuthContext.tsx:222-230` (`registarAtividade`)
- Evidência: `registarAtividade` faz `ultima = Date.now()` e reagenda sem verificar se já passaram 30 min. O fim de sessão depende do callback do
  `setTimeout` correr antes de qualquer evento de atividade. Em separadores ocultos/páginas congeladas (throttling intensivo do Chrome, PWA
  suspensa no iOS/Android, portátil em suspensão) o temporizador atrasa; ao regressar, o primeiro `touchstart`/`mousemove` renova a sessão de quem
  saiu há horas. A verificação de arranque (`:196-201`) só cobre remontagem, não retoma da mesma página.
- Correção proposta: em `registarAtividade` (e num `visibilitychange`→visible), se `Date.now() - max(ultima, lerUltimaAtividade()) >= INACTIVITY_LIMIT_MS`, chamar `encerrarSessao('local')`.
- Teste que prova: fake timers, `vi.setSystemTime(+31 min)` **sem** correr temporizadores, disparar `mousedown` → espera `signOut({scope:'local'})`.

### A5-06 Deploy recarrega a app à força e perde formulários em curso
- Severidade: Média
- Onde: `src/sw.ts:22-25` (`skipWaiting`+`clientsClaim`), `src/app/components/UpdatePrompt.tsx:23-35`, `:43-48` (verificação a cada 60 s)
- Evidência: novo SW ativa-se sozinho → `controllerchange` → `window.location.href = '/'` sem perguntar. Cenário: mecânico a preencher o checklist
  com fotos (`ChecklistPage`, sem `useProtegerSaida` nem rascunho) ou uma entrega/manutenção de frota; há push para `main` → até 60 s depois a página
  salta para `/` e perde tudo. Nos formulários protegidos aparece só o diálogo nativo `beforeunload` (inexistente no Safari iOS).
- Correção proposta: no `controllerchange`, se `ativos.size > 0` (registo de `protegerSaida`) ou houver formulário sujo, mostrar aviso "Nova versão — atualizar" em vez de navegar; recarregar só em idle/rota sem trabalho.
- Teste que prova: `UpdatePrompt.test.tsx` "com useProtegerSaida(true) ativo, controllerchange não altera location".

### A5-07 Fila offline de picagens: dois separadores duplicam picagens; guarda pode ficar presa
- Severidade: Média
- Onde: `src/features/picagens/hooks/usePicagensOfflineQueue.ts:25-61`, `src/features/picagens/services/*:76-95` (`registarPicagemOffline`)
- Evidência: ao contrário dos movimentos, não há `navigator.locks` nem `client_id`; `flushingRef` é por separador. PWA + separador do browser
  abertos, rede volta → ambos recebem `online` → ambos leem a mesma fila e fazem `insert` → picagens em duplicado (sem idempotência no servidor).
  Além disso, se `getSession()` lançar, `flushingRef.current` fica `true` (sem `try/finally`) e a fila nunca mais sincroniza nessa página.
- Correção proposta: `navigator.locks.request('encivil-picagens', …)` + `try/finally`; idealmente `client_id` único na tabela como nos movimentos.
- Teste que prova: dois `flush()` concorrentes com a mesma fila → `insert` chamado 1× por item.

### A5-08 Erros de páginas (errorElement) nunca chegam ao Sentry
- Severidade: Média
- Onde: `src/app/routes.tsx:4-77` (`RouteErrorPage`), usado em todas as rotas autenticadas
- Evidência: o `errorElement` do React Router apanha qualquer erro de render/loader das páginas antes do `ErrorBoundary` de `main.tsx` (o único que chama
  `captureError`). `RouteErrorPage` não chama `captureError` e o Sentry não tem `CaptureConsole`. Um crash em qualquer ecrã em produção mostra
  "Algo correu mal" e fica invisível na monitorização (inclusive durante os testes de carga).
- Correção proposta: em `RouteErrorPage`, `useEffect(() => { if (!isChunkError) captureError(error) }, [error])`.
- Teste que prova: render de rota que lança → `captureError` chamado 1×.

### A5-09 `parseSupabaseError` deixa passar mensagens técnicas/inglês e páginas HTML
- Severidade: Baixa
- Onde: `src/app/lib/parseSupabaseError.ts:41-60`
- Evidência: só reconhece `Failed to fetch`/`NetworkError`; no Safari (iPhone) a falha de rede é `TypeError: Load failed` → mostrado tal e qual.
  Um 502/503 do Cloudflare mostra o HTML da página de erro no toast/estado de erro (último recurso `return e.message`). `PGRST303` ("JWT expired",
  PostgREST ≥12), `57014` (statement timeout), `40P01`, `429` não estão mapeados. Também `LoginPage.tsx:30-32` mostra "Credenciais inválidas" para
  falha de rede/limite de pedidos.
- Correção proposta: incluir `Load failed`/`timed out`, detetar corpo `<` (HTML) e códigos acima → mensagens pt-PT; no login distinguir rede de credenciais.
- Teste que prova: `parseSupabaseError({message:'TypeError: Load failed'})` → mensagem de rede pt-PT; `{message:'<html>…'}` → fallback.

### A5-10 Números de WhatsApp recentes ficam no telemóvel partilhado após logout
- Severidade: Baixa
- Onde: `src/app/lib/whatsapp.ts:1,35-41`; `limparDadosLocais.ts:8`
- Evidência: `encivil:wa-recentes` (até 5 telemóveis de terceiros) persiste em `localStorage`; não está em `CHAVES_LOCAIS_COM_DADOS`, que afirma
  "nenhuma chave guarda dados de negócio". O utilizador seguinte vê os contactos usados pelo anterior no `EnviarWhatsAppDialog`.
- Correção proposta: acrescentar `encivil:wa-recentes` a `CHAVES_LOCAIS_COM_DADOS` (e atualizar o comentário/inventário).
- Teste que prova: `limparDadosLocais()` remove `encivil:wa-recentes`.

### A5-11 Pesquisa global falha em termos com vírgula/parênteses e mostra "sem resultados"
- Severidade: Baixa
- Onde: `src/features/search/globalSearchService.ts:19-41`
- Evidência: o termo vai cru para `.or(\`nome.ilike.%${termo}%,…\`)`. "Silva, Lda" ou "Construções (Norte)" partem a árvore lógica do PostgREST → erro;
  o código ignora `error` (`data ?? []`) → obras/artigos/ferramentas aparecem como inexistentes. `armazemService.ts:169` já tem `limparPesquisa` para isto.
- Correção proposta: aplicar a mesma sanitização (`[,()*%\\]` → espaço) e não engolir o erro.
- Teste que prova: `pesquisarGlobal('Silva, Lda')` gera filtro sem vírgula extra.

### A5-12 MFA voluntário de papéis não admin/gestor é só no cliente; fila legada sem `userId` vai para qualquer conta
- Severidade: Baixa
- Onde: `mfa_em_falta()` (BD vigente) / `useEstadoMfa.ts:8-13`; `movimentos/offlineQueue.ts:87`, `picagens/offlineQueue.ts:64`
- Evidência: (1) `mfa_em_falta()` só rebaixa `admin`/`gestor` com `mfa_obrigatorio`; um `armazem` (ou admin com a flag desligada) que registou TOTP
  é desafiado na UI, mas com só a senha (aal1) a API dá-lhe o papel completo — o fator não protege nada. (2) Itens antigos sem `userId`
  (`!i.userId`) são enviados por quem fizer login a seguir, em nome dessa conta (legado; desaparece quando essas filas esvaziarem).
- Correção proposta: (1) `mfa_em_falta()` = "tem fator verificado e sessão não é aal2" para qualquer papel; (2) não enviar itens sem `userId` (pedir confirmação).
- Teste que prova: BD — utilizador `armazem` com fator TOTP e JWT aal1 → `auth_role() = 'leitura'`.

### A5-13 `href` de fotos de abastecimento aceita qualquer texto da BD
- Severidade: Baixa
- Onde: `src/app/pages/AbastecimentoFormPage.tsx:112-119`, `src/features/combustivel/components/pedidos/PedidoPage.tsx:414`
- Evidência: `comb_abastecimentos.foto_url` é texto livre, gravável por `pode_escrever('combustivel')` (admin/gestor/armazem). Um `javascript:` lá
  posto vai para `<a href>` visto pelo admin. Mitigado pela CSP `script-src 'self'` (bloqueia `javascript:`), por isso só defesa em profundidade.
- Correção proposta: só aceitar `https:` (ex.: `url.startsWith('https://')`) antes de usar em `href`/`src`.
- Teste que prova: `photoUrl='javascript:alert(1)'` → link não renderizado.

---

## Verificado e OK
- `MATRIZ_ESCRITA` = `pode_escrever` vigente (armazem/ferramentas/combustivel→admin,gestor,armazem; obras→admin,gestor; subempreitadas→+medicoes; frota→+mecanico) e `colaboradores` = `colab_write`.
- Rotas sensíveis com `RoleGuard` (colaboradores, rh, epis, formações, segurança, alertas, faturas, contabilidade, backup, auditoria, configurações, config. abastecimento, registo de abastecimento, destinatários frota); `MainLayout` confina mecânico/motorista; rotas de impressão fora do layout dependem de `pode_ver_obra`, que exclui mecânico/motorista.
- Troca de identidade: `clearAsyncCache` + invalidação de respostas em voo (`_sessaoCache`), cache `supabase-api` apagado, SW `NetworkOnly` para `*.supabase.co`, sessão local apagada mesmo sem rede, fila de movimentos filtrada por `userId` e por sessão real.
- `useAsync`: geração por pedido (resposta antiga não sobrescreve), sem setState após desmontar, invalidação recarrega hooks montados; `useMutation` não faz setState desmontado; movimentos com `client_id` idempotente e lock entre separadores.
- Recuperação de senha: captura do token antes do cliente, marcador de sessão, MFA aal2 antes de `updateUser`; `MfaDesafio` antes de mostrar a app; `auth_role()` rebaixa admin/gestor sem aal2 quando obrigatório.
- XSS: único `dangerouslySetInnerHTML` é `ui/chart.tsx` (CSS de config estática); sem `innerHTML`; links WhatsApp com `encodeURIComponent`; `tel:` com prefixo fixo; CSP estrita (`script-src 'self'`, `frame-ancestors 'none'`).
- Exportações: todas passam por `exportCsv`/`exportXlsx` (que aplicam `neutralizarFormula`); não há outros geradores de CSV/XLSX.
- Sentry: só `id` do utilizador, sem replay nem `sendDefaultPii`.
- SW: `index.html`/`sw.js` sem cache no CDN, `skipWaiting` + verificação a cada 60 s, `cleanupOutdatedCaches`, recuperação de chunks antigos com guarda anti-ciclo.
