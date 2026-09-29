# [P3 · BAIXO] Sem pre-commit hook para prevenir commit de secrets

## Problema
Nenhuma guarda automática contra commit acidental de chaves API, tokens
Supabase ou outros secrets em ficheiros de código.

## Resolução — 2026-06-12

### `.git/hooks/pre-commit` criado
Hook shell que scans ficheiros staged por padrões de secret:
- `sb_secret_` — service role key Supabase
- `service_role` — variável de ambiente com service key
- `SUPABASE_SERVICE_ROLE` — variável de ambiente
- `sk-[32+ chars]` — padrão de API key OpenAI/Anthropic
- JWT tokens longos (padrão `eyJhbGci...`)

Ficheiros binários e lock files são ignorados.
Allowlist configurable no topo do ficheiro para falsos-positivos.

### `.gitignore` reforçado
```gitignore
.env.production
.env.production.local
.env.staging
secrets/
*.pem
*.key
```

**Critérios cumpridos:**
- [x] Commit com `sb_secret_` seria bloqueado (hook activo)
- [x] `.env.production` no `.gitignore`
- [x] Mensagem de erro clara ao bloquear (`--no-verify` documentado como escape hatch)
- [x] Ficheiros binários excluídos do scan (sem falsos-positivos em imagens)
