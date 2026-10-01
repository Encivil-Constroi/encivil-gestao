# Superpowers neste projeto

Instalado em 2026-10-01 a pedido do utilizador para uso permanente.

- Origem: https://github.com/obra/superpowers
- Commit: `8ca22dba9a94f28898bbce59f2537ff4d87c747d`
- Local: `.agents/skills/` (15 skills, incluindo os recursos de cada uma).
- Entrada: `.agents/skills/using-superpowers/SKILL.md`.
- Método: `skill-installer`, com versão fixa e destino local ao projeto.
- Descoberta Codex: https://learn.chatgpt.com/docs/build-skills

`AGENTS.md` e `CLAUDE.md` exigem a consulta da skill de entrada em todas
as sessões e a aplicação das skills relevantes para cada tarefa.
As instruções do utilizador e as regras do projeto prevalecem sobre as skills.
Os nomes de ferramentas e as permissões disponíveis na sessão prevalecem
sobre exemplos específicos de outras versões do Codex.

As skills ficam disponíveis no próximo turno. Se não aparecerem no catálogo,
reiniciar o Codex. A leitura direta dos ficheiros continua disponível.

A cópia preexistente em `.claude/skills/superpowers` foi preservada; a
instalação do Codex usa o mesmo commit, mas é independente dessa cópia.
Não há atualização automática: numa atualização, rever as alterações upstream,
substituir as skills de forma controlada e atualizar o commit neste documento.
Preservar a licença MIT em `docs/licenses/superpowers-LICENSE.txt`.
