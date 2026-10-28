# Ambiente de carga (só local)

1. Ter a stack Supabase local a correr (`npx supabase start`). A guarda em `env.mjs` aborta se a API ou a BD não forem `127.0.0.1`/`localhost`.
2. `CARGA_WORKDIR` é obrigatório: pasta que contém `supabase/` da stack `encivil-checkup` (o env.mjs verifica o `project_id` e aborta se for outra). O checkup de 2026-10-28 correu com `CARGA_WORKDIR=<scratchpad>/carga-stack` (API na porta 55321).
3. `node scripts/carga/seed.mjs [--escala=1]` cria utilizadores, obras, colaboradores, artigos, movimentos, viaturas e ferramentas com o marcador `carga-`. Idempotente: repetir completa o que falta.
4. Credenciais: `carga-<papel>@local.test` (admin, gestor, armazem, medicoes, mecanico, motorista, leitura) e `carga-u<n>@local.test`. Senha: `CARGA_SENHA`, senão a gerada em `scripts/carga/resultados/senha.txt` (ignorada pelo git).
5. Os movimentos são imutáveis, por isso o seed só acrescenta até ao alvo. Para recomeçar, `npx supabase db reset` na stack local.

Nota: o CLI mapeia `[auth.email] enable_signup = false` para "email logins disabled", o que impede o login por senha. Na config da stack de carga (não na do repo) pôr `enable_signup = true` e reiniciar a stack.

## Concorrência (`concorrencia.mjs`)
`node scripts/carga/concorrencia.mjs [--so=<cenário>]` — cenários: `saidas-mesmo-artigo`, `entradas-saidas-mistas`, `autos-numeracao`, `codigos-sequencia`, `aprovacao-dupla-abastecimento`, `emprestimo-duplo-ferramenta`, `picagem-duplicada`, `fatura-lancamento-duplo`.
- As operações vão pela API como utilizadores do seed (login sequencial; o paralelismo é nas operações, vários clientes por sessão). O psql só cria fixtures novas (marcador `carga-conc-<ts>`) e verifica o resultado.
- Cada cenário imprime `OK|FALHA <nome> <detalhe>`; sai com código 1 se algum falhar. A saída fica em `resultados/concorrencia-<ts>.txt`.
- `--so=entradas-saidas-mistas` inclui a verificação global pós-carga (artigos `carga-` sem ajustes: stock = Σ entradas − Σ saídas; nenhum stock negativo).
- Movimentos levam `p_client_id` como na app; numa falha de rede (o gateway local fecha sockets com ~300 pedidos simultâneos) reenviam com o mesmo id, sem duplicar.

## Carga (`runner.mjs` + `cenarios.mjs`)
`node scripts/carga/runner.mjs --perfil=leve|medio|pesado|rutura [--duracao=60] [--passo=30] [--max=500] [--sem-integridade]`
- leve 10 VUs 70/30 leitura/escrita; medio 50 VUs, rampa 30 s, pico de picagens; pesado 200 VUs com 30 % fecho de mês; rutura degraus de 50 até erro > 1 % ou p95 > 3 s.
- VU = utilizador `carga-u<n>` com login real e o seu papel (a RLS aplica-se); pausa de 1–3 s entre operações. As queries replicam os services (citados em `cenarios.mjs`).
- Erros por classe: `rede`, `gw` (502/503/504 do Kong), `serv`, `cli`, `neg` (recusa prevista). Antes de cada perfil faz `pg_stat_statements_reset()`; no fim grava o top 10 e corre a integridade (`concorrencia.mjs --so=entradas-saidas-mistas`).
- Resultado em `resultados/<perfil>-<ts>.json` e tabela no terminal. Baseline de 2026-10-28: `BASELINE-2026-10-28.md`.
