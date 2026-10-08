# Recuperação de acesso, Ajuda por perfil e Auditoria legível — Desenho

Data: 2026-10-08 · Estado: aprovado pelo utilizador · Execução: subagentes em paralelo.

## Objetivo
1. Qualquer funcionário recupera o acesso depressa: email (quem tem) ou link gerado pelo admin e enviado por WhatsApp.
   Depois de definir a senha nova entra logo na app e o navegador oferece guardar a senha.
2. A Ajuda é um guia atualizado por perfil, com guia rápido do sistema e instalação da PWA em iOS e Android.
3. A Auditoria (só admin) mostra frases legíveis, antes/depois dos campos alterados, filtros e exportação Excel.

Fora de âmbito: códigos de 6 dígitos, pedidos de recuperação no ecrã de login, auditoria para gestor, novas tabelas
auditadas, alertas na auditoria.

## Restrições
- Site novo funciona com a BD antiga (ordem: site → migrations → Edge Functions). Sem a migration nova, o registo do
  evento de segurança falha em silêncio e tudo o resto funciona.
- Edge Function nova ação só para admin; validação por esquema (`_shared/validar.ts`), CORS e limite como as restantes.
- O admin nunca vê a senha escolhida pelo funcionário. O link é pessoal e expira (OTP do Supabase, ~1 h).
- pt-PT na UI; sem `as any`; `useAsync`/`useMutation`; lógica em funções puras testadas.

## A. Recuperação de acesso

### Edge Function `supabase/functions/admin-utilizadores/index.ts`
- Ação `linkRecuperacao`, payload `{ userId: uuid }` (esquema obrigatório).
  1. `admin.auth.admin.getUserById(userId)` → email (erro 404 pt-PT "Utilizador não encontrado").
  2. `admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` } })`.
  3. Lê `profiles.nome, telemovel` do utilizador.
  4. `_registar_evento('link_recuperacao_admin', userId, { por: <id do admin> })` sem bloquear (`.then(()=>{},()=>{})`).
  5. Devolve `{ link: data.properties.action_link, nome, telemovel, login: loginDeEmail(email), email }`.
- Ação existente `redefinirSenha` passa a registar `senha_redefinida_admin` (sem bloquear).
- Função pura `mensagemRecuperacao(nome, link)` em `regras.ts` (texto do WhatsApp) — testada em Deno e espelhada no
  frontend em `src/features/auth/lib/recuperacao.ts`.

### Migration `supabase/migrations/20261008090000_eventos_recuperacao.sql`
- Recria o CHECK de `eventos_seguranca.tipo` acrescentando `link_recuperacao_admin` e `senha_redefinida_admin`
  (`DROP CONSTRAINT IF EXISTS eventos_seguranca_tipo_check` + `ADD CONSTRAINT`), idempotente, com bloco `-- ROLLBACK`.
- Teste de BD: os dois tipos novos inserem via `_registar_evento`; tipo desconhecido continua a falhar.

### Frontend
- `utilizadoresService.gerarLinkRecuperacao(userId): Promise<LinkRecuperacao>`
  (`{ link, nome, telemovel: string | null, login: string | null, email }`) + hook `useLinkRecuperacao()`.
- `EnviarWhatsAppDialog` ganha prop opcional `numeroInicial?: string` (preenche o campo ao abrir).
- `GestaoUtilizadoresPage`: item de menu "Link de recuperação" por utilizador (não para o próprio) → gera o link →
  abre diálogo com: aviso "Pessoal, válido cerca de 1 hora. Quem abrir define a senha.", botão "Copiar link",
  e `EnviarWhatsAppDialog` com `texto = mensagemRecuperacao(nome, link)` e `numeroInicial = telemovel`.
- `ResetPasswordPage`:
  - Mostra "Conta: <utilizador ou email>" (sessão de recuperação; `loginDeEmail`).
  - Formulário com `<input type="text" name="username" autoComplete="username" value=<email> readOnly hidden-visually>`
    e campos `autoComplete="new-password"`, para o gestor de palavras-passe oferecer guardar.
  - Depois de `updateUser` com sucesso: **não** termina a sessão; tenta `navigator.credentials.store(new PasswordCredential(...))`
    quando existir (ignora falhas); toast "Palavra-passe guardada"; `navigate('/', { replace: true })`.
    Guardas existentes (MFA) tratam contas com MFA.
  - Link inválido/expirado: texto "O link expirou ou já foi usado. Peça um novo ao administrador ou use
    'Esqueceu a palavra-passe?' se tiver email." + botão "Voltar ao login".
- `LoginPage`: o pedido por email mantém-se; texto do ecrã de recuperação explica as duas vias.

## B. Ajuda (`/ajuda`)
- Conteúdo em `src/app/pages/ajuda/conteudo.ts` (dados, sem JSX): `GUIA_RAPIDO` (comum), `GUIAS_POR_PAPEL:
  Record<RoleUtilizador, SecaoGuia[]>` (admin, gestor, armazem, medicoes, mecanico, motorista, leitura), `FAQ`.
  Reaproveita o conteúdo útil do `HelpPage.tsx` atual, atualizado para as rotas e ecrãs que existem hoje (verificar em
  `routes.tsx`/`Sidebar.tsx`; não inventar ecrãs).
- `src/app/pages/ajuda/instalacao.ts` (puro): `detetarPlataforma(userAgent, standalone): 'ios' | 'android' | 'desktop' | 'instalada'`
  e `PASSOS_INSTALACAO` por plataforma (iOS: Safari → Partilhar → "Adicionar ao ecrã principal" → Adicionar;
  Android: Chrome → menu ⋮ → "Instalar aplicação"/"Adicionar ao ecrã principal"; desktop Chrome/Edge: ícone de instalar
  na barra de endereço).
- `src/app/pages/ajuda/useInstalarPwa.ts`: captura `beforeinstallprompt`, expõe `podeInstalar` e `instalar()`.
- `HelpPage.tsx` passa a compor: seletor de perfil (só admin vê; os outros veem o seu), pesquisa, secções
  "Primeiros passos", "O seu dia a dia" (perfil), "Instalar no telemóvel" (plataforma detetada em destaque, as outras
  recolhidas, botão "Instalar" quando `podeInstalar`), "Recuperar o acesso", FAQ.

## C. Auditoria (`/auditoria`, só admin)
- `src/app/lib/auditoria/descrever.ts` (puro):
  - `camposAlterados(details, operacao): { campo: string; rotulo: string; antes: string; depois: string }[]`
    (update: usa `{antes, depois}` do trigger; insert/delete: lista campos relevantes da linha), com rótulos pt
    (`ROTULO_CAMPO`), formatação (booleanos Sim/Não, papéis, datas pt-PT, nulos "—"), omitindo ids/técnicos
    (`id`, `created_at`, `user_id`, `*_path`, etc.).
  - `descreverRegisto(row, nomeAtor, nomeAlvo): string` → ex.: "Ana alterou o utilizador Rui (papel: armazém → gestor)",
    "Rui criou a obra Escola X", "Ana eliminou a fatura FT 123". Ações antigas (`role_change`, `validar_auto`, …)
    usam `labelAction` existente.
  - `nomeDoAlvo(tabela, details, nomes)`: `profiles` → nome do perfil; `obras` → `nome`; `colaboradores` → `nome`;
    `faturas_fornecedor` → `numero_fatura`/`fornecedor`; fallback "registo".
- `src/app/pages/auditoria/dados.ts`: `listarAuditoria(filtros, pagina)` e `exportarAuditoria(filtros)` com filtros
  inline: pessoa (`actor_id`), módulo (prefixo `action like 'tabela.%'`, compatível com BD antiga), operação
  (`action like '%.update'` etc.), período (datas Europe/Lisbon). Paginação 50 com `count: 'exact'`.
- `AuditoriaPage`: linha do tempo agrupada por dia; cada item mostra hora, ator, frase, selo de severidade
  (`severidadeAction` existente) e "Ver detalhes" com tabela antes/depois; filtros pessoa/módulo/operação/período;
  exportar Excel com colunas Data/Hora, Utilizador, Ação (frase), Módulo, Campos alterados ("campo: a → b; …").
  Aba "Eventos de segurança" mantém-se (rótulos dos 2 tipos novos acrescentados).

## Testes
- Deno: `linkRecuperacao` esquema (payload inválido recusado) e `mensagemRecuperacao`.
- BD: CHECK dos tipos novos.
- Vitest: `recuperacao`, `instalacao.detetarPlataforma`, `conteudo` (todos os papéis têm guia, rotas citadas existem
  em `routes.tsx`), `descrever` (frases e campos), serviço de auditoria (filtros), `ResetPasswordPage` (sucesso navega
  para "/", não chama signOut; expirado mostra texto), Gestão (item gera link e abre diálogo com número), Ajuda (perfil
  certo, admin troca de perfil, passos iOS em iPhone).
- typecheck, `npm test`, build, `check:edge`/`test:edge`; agent-browser em localhost: `/login`, `/reset-password` (estado
  inválido), consola sem erros.

## Passos manuais
1. Publicar site (push). 2. Aplicar `20261008090000_eventos_recuperacao.sql`. 3. `npx supabase functions deploy admin-utilizadores`.
4. Confirmar em Supabase → Auth → URL Configuration que `https://app.encivilconstroi.com/reset-password` está em Redirect URLs.
