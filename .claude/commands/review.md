# /review — Code review focado no ENCIVIL

Faz code review do diff atual com as regras específicas deste projeto.

## Passos

1. **Obter o diff** — correr `git diff HEAD` (mudanças não commitadas) ou `git diff main...HEAD` (branch completo) ou `git diff HEAD~1` (último commit).

2. **Analisar por cada categoria:**

### Segurança (crítico)
- [ ] Alguma chave `sb_secret_*` está exposta no código ou em VITE_ env vars?
- [ ] Novas tabelas têm RLS ativado?
- [ ] Novas migrations têm GRANTs para `authenticated`?
- [ ] Input do utilizador é validado antes de chegar à BD?

### TypeScript
- [ ] Há `as any` no código novo? (Proibido — ver CLAUDE.md)
- [ ] Tipos Supabase foram regenerados após migrations?
- [ ] `npm run typecheck` dá 0 erros?

### Performance / Queries
- [ ] Há padrões N+1? (INSERT seguido de SELECT separado?)
- [ ] Agregações que deviam ser RPCs estão a ser feitas em JS no cliente?
- [ ] Filtros Supabase estão inlined (não em helpers genéricos)?

### Padrões do projeto
- [ ] Hooks de dados usam `useAsync` (não `useEffect`+`useState` manual)?
- [ ] Mutations usam `useMutation` (não try/catch manual)?
- [ ] Services têm constante `SELECT` e encadeiam `.select()` em INSERT/UPDATE?
- [ ] Void mutations usam o padrão `async (id): Promise<true> => { await fn(id); return true }`?

### Testes
- [ ] Funções puras novas têm testes em `src/__tests__/`?
- [ ] `npm test` passa sem falhos?

### Commits e documentação
- [ ] Commit message é descritivo (conventional commits)?
- [ ] CLAUDE.md precisa de ser atualizado com novos padrões ou regras?

## Output esperado
Lista os problemas encontrados por severidade (crítico → aviso → sugestão), com ficheiro e linha.
