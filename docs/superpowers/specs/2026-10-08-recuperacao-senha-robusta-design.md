# Recuperação de senha robusta — design

Data: 2026-10-08 · Caminho: arquitetónico leve (aprovado pelo utilizador por delegação: "aprove o plano e execute").

## Entendimento (a corrigir se estiver errado)
- Quem: utilizadores com email que usam "Esqueceu a palavra-passe?" (email do Supabase) e quem recebe o link do administrador.
- Sintoma 1: o link abre `/reset-password` e mostra "Link inválido — o link expirou ou já foi usado".
- Sintoma 2: ao clicar no link, volta à página de login sem nada acontecer.
- Sucesso: qualquer link de recuperação válido leva ao formulário de nova senha; se o link já não serve, a mensagem diz porquê e oferece pedir novo link.

## Causas (confirmadas no código)
1. **Corrida com o evento `PASSWORD_RECOVERY`.** O cliente (`client.ts`) lê o `#access_token` do URL ao arrancar e emite o evento antes de o chunk lazy da página montar. A página só escuta `PASSWORD_RECOVERY`, nunca consulta `getSession()`, e ao fim de 4 s mostra "Link inválido" mesmo com sessão de recuperação já criada.
2. **Redirect fora da lista permitida** (Supabase → Auth → URL Configuration): o GoTrue envia para o Site URL (`/`), `AuthGuard` não vê sessão (ou o hash com erro) e faz `Navigate /login` — "volta ao login". Não há tratamento de recuperação fora de `/reset-password`.
3. **Scanners de email** (Outlook Safe Links, antivírus, WhatsApp) fazem GET ao link `/auth/v1/verify` e gastam o token de uso único; o utilizador chega com `#error_code=otp_expired`, que a página ignora (espera 4 s e mostra a mensagem genérica). Só se resolve com link que aponte à nossa app com `token_hash` (o token só gasta no clique em "Continuar") — o fluxo do administrador já faz isto; o email do Supabase não.
4. Falha de rede em `verifyOtp` é tratada como "link inválido" e o token é retirado do URL (impede tentar de novo).

## Desenho
### Frontend
- Novo `src/integrations/supabase/entradaUrl.ts`: avaliado **antes** do cliente (importado primeiro em `client.ts`). Lê `location.hash` e `location.search` e devolve/guarda (memória + `sessionStorage` `encivil-recuperacao`) um `EntradaRecuperacao`:
  `{ tipo: 'token_hash', tokenHash } | { tipo: 'sessao' } | { tipo: 'erro', codigo, descricao } | null`.
  Função pura `analisarEntradaUrl(search, hash)` testável.
  Se o URL traz parâmetros de recuperação e o caminho não é `/reset-password`, faz `history.replaceState` para `/reset-password` mantendo query/hash **antes** do router arrancar (resolve "volta ao login").
- `ResetPasswordPage`:
  - estado inicial a partir da entrada capturada: `token_hash` → "Continuar" (como hoje); `erro` → estado `expirado` com mensagem específica (otp_expired → "O link já foi usado ou expirou. Alguns programas de email abrem o link antes de si e gastam-no.") + botão "Pedir novo link"; `sessao` → "a validar" com verificação ativa.
  - validação por **três fontes**: `getSession()` no arranque, eventos `PASSWORD_RECOVERY`/`SIGNED_IN`/`INITIAL_SESSION` com sessão, e prazo de 8 s. Com marcador de recuperação (`sessionStorage`) e sessão presente → formulário. Sem marcador nem token → "Link inválido" (já não espera para sempre).
  - `verifyOtp` com erro de rede/5xx → estado `erroRede` com "Tentar de novo" (mantém o token); só erro de token (4xx) → `expirado`.
  - botão "Pedir novo link" navega para `/login` com `state: { modo: 'pedir-reset' }`; `LoginPage` abre direto o ecrã de pedir email.
- Sem mudanças a regras de senha/MFA já existentes.

### Supabase (operação)
- `supabase/templates/recovery.html`: email de recuperação com link `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` (imune a scanners). Registado em `config.toml` (`[auth.email.template.recovery]`) e `site_url`/`additional_redirect_urls` locais para `http://localhost:5173`.
- Documentação: passo manual no Dashboard de produção (Auth → Email Templates → Reset Password; Auth → URL Configuration: Site URL `https://app.encivilconstroi.com`, Redirect URLs `https://app.encivilconstroi.com/**`, `https://encivil-gestao.pages.dev/**`) em `docs/22-seguranca-operacao.md`. O site novo funciona com o template antigo (hash/`#access_token` continua suportado).
- Edge Function `admin-utilizadores`: sem alteração de lógica (já gera `token_hash`); confirmar `APP_URL` documentado como segredo.

## Fora de âmbito
Fluxo de convite (`inviteUserByEmail` → `/login`); alterar RLS/BD; aplicar nada em produção.

## Testes
- Unit: `analisarEntradaUrl` (todas as formas), `ResetPasswordPage` (sessão já existente sem evento; erro `otp_expired`; erro de rede mantém token; marcador; timeout), `LoginPage` (abre em pedir-reset por state).
- E2E local (agent-browser + Supabase local + Inbucket): pedir link → ler email → abrir → definir senha → login. Variantes: link já usado → mensagem + pedir novo; abrir em `/` com hash de recuperação → cai em `/reset-password`.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run check:edge && npm run test:edge`.
