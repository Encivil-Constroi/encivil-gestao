# /deploy — Deploy completo para Cloudflare Pages

Executa o pipeline de deploy seguro do ENCIVIL Gestão:

1. **Typecheck** — corre `npm run typecheck`. Se houver erros TypeScript, para e apresenta-os.

2. **Build** — corre `npm run build`. Se o bundle falhar, para e apresenta o erro.

3. **Tests** — corre `npm test`. Se algum teste falhar, para e apresenta os falhos.

4. **Git status** — mostra todos os ficheiros modificados/staged para revisão antes de commitar.

5. **Commit** — cria um commit descritivo com `git add` dos ficheiros relevantes (excluir `.env*`, `node_modules`, `dist/`). Usar formato de mensagem conventional commits (feat/fix/refactor/etc).

6. **Push** — faz `git push origin main`.

7. **Confirmação** — informa que o deploy foi iniciado e que o Cloudflare Pages o irá processar automaticamente. O deploy estará disponível em https://encivil-gestao.pages.dev em 1-2 minutos.

**Notas de segurança:**
- Nunca commitar ficheiros `.env` ou que contenham `sb_secret_`
- Confirmar que `git status` não tem ficheiros inesperados antes do push
- Verificar o painel Cloudflare Pages se o deploy demorar mais de 5 minutos
