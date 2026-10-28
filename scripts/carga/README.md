# Ambiente de carga (só local)

1. Ter a stack Supabase local a correr (`npx supabase start`). A guarda em `env.mjs` aborta se a API ou a BD não forem `127.0.0.1`/`localhost`.
2. `CARGA_WORKDIR` aponta para a pasta que contém `supabase/` da stack a usar (default: raiz do repo). O checkup de 2026-10-28 correu com `CARGA_WORKDIR=<scratchpad>/carga-stack` (project_id `encivil-checkup`, API na porta 55321).
3. `node scripts/carga/seed.mjs [--escala=1]` cria utilizadores, obras, colaboradores, artigos, movimentos, viaturas e ferramentas com o marcador `carga-`. Idempotente: repetir completa o que falta.
4. Credenciais: `carga-<papel>@local.test` (admin, gestor, armazem, medicoes, mecanico, motorista, leitura) e `carga-u<n>@local.test`. Senha: `CARGA_SENHA`, senão a gerada em `scripts/carga/resultados/senha.txt` (ignorada pelo git).
5. Os movimentos são imutáveis, por isso o seed só acrescenta até ao alvo. Para recomeçar, `npx supabase db reset` na stack local.

Nota: o CLI mapeia `[auth.email] enable_signup = false` para "email logins disabled", o que impede o login por senha. Na config da stack de carga (não na do repo) pôr `enable_signup = true` e reiniciar a stack.
