# Recuperação de senha robusta — plano

Spec: `docs/superpowers/specs/2026-10-08-recuperacao-senha-robusta-design.md`. Execução: subagent-driven; T1 e T2 em paralelo (ficheiros disjuntos), T3 depois.

**Regras para todos:** não tocar em ficheiros com alterações alheias no working tree (AuthContext.tsx, client.ts só para o import indicado em T1); sem commits; texto de UI em pt-PT; `npm run dev` liga à produção — não criar/alterar dados reais; TDD (teste a falhar primeiro).

## T1 — Frontend (ficheiros: `src/integrations/supabase/entradaUrl.ts` [novo], `src/integrations/supabase/client.ts` [só 1 import no topo], `src/app/pages/ResetPasswordPage.tsx`, `src/app/pages/LoginPage.tsx`, testes em `src/__tests__/…`)
- [ ] `analisarEntradaUrl(search, hash)` puro + testes (token_hash+recovery; hash access_token+type=recovery; hash error_code=otp_expired/access_denied; nada).
- [ ] Captura na carga do módulo + marcador `sessionStorage` + `replaceState` para `/reset-password` quando necessário; `client.ts` importa-o primeiro.
- [ ] Reescrever máquina de estados da `ResetPasswordPage` (confirmar, a validar, pronto, a guardar, mfa, expirado, erroRede) com 3 fontes de validação (getSession, eventos, prazo 8 s) e botão "Pedir novo link".
- [ ] `LoginPage`: `location.state.modo === 'pedir-reset'` abre `request-reset` (usar `useLocation`; atualizar mocks do teste existente).
- [ ] Atualizar `src/__tests__/pages/resetPassword.test.tsx` e `loginPage.test.tsx`; novos testes dos cenários da spec. `npm run typecheck` e `npx vitest run src/__tests__/pages src/__tests__/lib` verdes.

## T2 — Supabase/docs (ficheiros: `supabase/templates/recovery.html` [novo], `supabase/config.toml`, `docs/22-seguranca-operacao.md`, `docs/superpowers/specs/2026-10-08-recuperacao-ajuda-auditoria-design.md` só se citar o passo antigo)
- [ ] Template HTML simples pt-PT (botão + link em texto) com `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
- [ ] `config.toml`: `site_url = "http://localhost:5173"`, `additional_redirect_urls` com `http://localhost:5173/**`, `[auth.email.template.recovery]` com `subject` e `content_path = "./supabase/templates/recovery.html"`. Confirmar com `grep` que testes de config (se existirem) continuam verdes.
- [ ] Docs: secção "Recuperação de senha por email" com passos manuais de produção e como diagnosticar (otp_expired = scanner; volta ao login = redirect fora da lista).
- [ ] `npm run check:edge && npm run test:edge` e testes de BD relevantes inalterados.

## T3 — Verificação (controlador)
- [ ] Reiniciar Supabase local para aplicar o template; correr Vite apontado ao Supabase local (`VITE_SUPABASE_URL=http://127.0.0.1:54321` + chave local) numa porta livre.
- [ ] agent-browser: fluxo completo via Inbucket (porta 54324); link reutilizado; hash de recuperação em `/`; consola limpa.
- [ ] `npm run typecheck`, `npm test`, `npm run build`. Relatório final com passos manuais.
