# Política de segurança

## Como reportar uma vulnerabilidade

Se encontrou uma falha de segurança no ENCIVIL Gestão (https://app.encivilconstroi.com):

1. Envie os detalhes por e-mail para o responsável de sistemas: **encivil.sistemas@hotmail.com**
   (endereço interino, ver `docs/13-infraestrutura-e-contas.md`; será substituído pelo e-mail institucional).
2. Indique o que viu, como reproduzir e o impacto que considera possível. Não inclua passwords nem dados pessoais reais.
3. Respondemos em **5 dias úteis**.
4. Pedimos que **não divulgue** a falha antes de estar corrigida e que não aceda a dados de outras pessoas nem altere dados para a demonstrar.

Não abra issues públicas no GitHub para vulnerabilidades.

## O que fazemos

- A segurança real está na base de dados: RLS em todas as tabelas, `GRANT` explícitos e RPCs
  `SECURITY DEFINER` com verificação de papel no servidor (`public.pode_escrever()`, `public.auth_role()`).
- MFA TOTP (obrigatório para admin/gestor quando ligado em `seguranca_config`) e logout após 30 min de inatividade.
- Segredos só no servidor (Edge Functions, `Deno.env.get()`); no site só a chave pública `sb_publishable_*`.
  O pre-commit bloqueia padrões de segredo; o CI corre `npm audit` e gitleaks sobre o histórico.
- Cabeçalhos de segurança (CSP, HSTS…) em `public/_headers`.
- Último checkup de segurança: `docs/auditorias/2026-10-28-checkup-geral.md` (2026-10-28/29).

Modelo de acesso: `docs/05-seguranca-e-acesso.md`. Operação, backups, recuperação e resposta a
incidentes: `docs/22-seguranca-operacao.md`.
