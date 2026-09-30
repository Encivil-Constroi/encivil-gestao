# 13 — Infraestrutura e Contas

> Escrito em 2026-09-29. Serve de inventário para a Direção e de documento de
> continuidade — quem consegue substituir o responsável de sistemas amanhã
> precisa de saber isto sem depender de uma pessoa, um computador ou uma conta
> pessoal (ver o mandato de "Segurança e continuidade" da função).
>
> **Como manter atualizado:** sempre que uma conta, serviço ou segredo mudar,
> atualizar aqui na mesma alteração — não depois. Este documento nunca contém
> valores de password, chave ou token — só o nome do segredo e onde ele vive.
>
> **Partes marcadas "A CONFIRMAR" não foram verificadas no código** — são
> factos que só quem tem acesso às contas sabe (quem é titular, que plano,
> quanto custa, se há 2FA). Preencher antes de entregar este documento à Direção.

---

## 1. Sistemas em produção

| Sistema | O que é | URL |
|---|---|---|
| ENCIVIL Gestão | ERP interno — armazém, obras, subempreiteiros, ferramentas, combustível/frota, RH, faturas | https://encivil-gestao.pages.dev |
| Pedido de abastecimento | Com conta (papel `motorista` ou outro); o QR da viatura abre o pedido com a viatura escolhida — ver `docs/15-abastecimento-v2.md` | `/abastecer` (o QR antigo `/pub/combustivel?v=...` redireciona) |

Stack e arquitetura completas: `CLAUDE.md` e `ARCHITECTURE.md`.

---

## 2. Contas por serviço

### GitHub — código, CI, revisão automática

- **Organização:** `Encivil-Constroi`, repositório `encivil-gestao` (remote `origin`)
- **Função:** guarda todo o código-fonte e o histórico de alterações; corre
  os testes automáticos (`.github/workflows/ci.yml`) e um code review
  automático em cada Pull Request (`pr-review.yml`)
- **Segredo usado:** `ANTHROPIC_API_KEY` (Settings → Secrets → Actions) — para o code review automático
- **Titulares/acesso hoje:** A CONFIRMAR — quem é owner da organização, quem tem acesso de escrita
- **Custo:** A CONFIRMAR — plano gratuito cobre esta escala; confirmar se há alguma subscrição paga associada
- **2FA:** A CONFIRMAR

### Cloudflare Pages — alojamento e deploy

- **Função:** serve o site em produção; cada push a `main` dispara um deploy automático
- **Domínio atual:** `encivil-gestao.pages.dev` (subdomínio gratuito do Cloudflare)
- **Domínio próprio planeado:** `app.encivil.pt` — **ainda não ligado** (ver §6)
- **Variáveis de ambiente configuradas lá:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY`
- **Titular da conta Cloudflare:** A CONFIRMAR (email institucional? pessoal?)
- **Custo:** A CONFIRMAR — Cloudflare Pages tem plano gratuito generoso; confirmar se algum recurso (domínio, WAF) está a gerar custo
- **2FA:** A CONFIRMAR

### Supabase — base de dados, autenticação, ficheiros, funções de servidor

- **Função:** todo o backend — PostgreSQL (dados), Auth (login), Storage
  (fotos de abastecimentos/faturas), Edge Functions (IA, notificações, bomba Polo 2)
- **Projeto:** `wuruhxmbueeyhiqgvlxu` — transferido para a organização da
  empresa em 14/07/2026 (`docs/11-transferencia-titularidade.md`)
- **Chave pública** (`sb_publishable_...`): pode estar no frontend, é segura
  para expor — a segurança real é a Row Level Security no banco
- **Chave secreta** (`sb_secret_...` / papel de serviço): **nunca no
  frontend**; usada só dentro das Edge Functions (variável de ambiente do lado do servidor)
- **Segredos configurados nas Edge Functions** (Dashboard → Edge Functions → Secrets):
  - `GOOGLE_AI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_RESERVA` — leitura de faturas/fotos por IA
  - `RESEND_API_KEY`, `EMAIL_ALERTAS_DESTINATARIO`, `APP_URL` — envio de e-mail de alertas
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — notificações push
  - `PUMP_POLO2_SECRET` — autenticação do dispositivo Shelly da bomba
  - (envio diário dos alertas da frota: o segredo **não** está aqui — é gerado
    no próprio banco, em `privado.frota_push`, e o pg_cron chama a
    `send-push-frota` com ele; ver migration `20260929040000`)
  - (notificações imediatas do abastecimento: idem — segredo em
    `privado.segredos`, enviado pelo trigger do banco à `notificar-abastecimento`;
    ver migration `20260930010000`)
  - `EDGE_FUNCTION_SECRET` — chamadas entre funções
  - URL do projeto, chave anónima e a chave de papel de serviço — geridas automaticamente pelo próprio Supabase, não precisam de configuração manual
- **Acesso ao CLI:** **ainda não configurado** com a conta da organização —
  todas as migrations são aplicadas manualmente no SQL Editor do Dashboard, o
  que já causou divergências entre produção e o repositório (ver Etapa 3 de
  `docs/plano-seguranca-desempenho.md`)
- **Backup do banco de dados:** **nunca foi feito** — ver §5
- **Titulares/acesso hoje:** A CONFIRMAR
- **Plano:** A CONFIRMAR se é Pro (o Free não faz backup automático nem MFA/TOTP para os utilizadores da app)
- **Custo:** A CONFIRMAR
- **2FA na conta Supabase (não confundir com MFA dos utilizadores finais):** A CONFIRMAR

### Google AI Studio (Gemini) — leitura de documentos por IA

- **Função:** lê faturas de fornecedor e fotos de abastecimento (litros/custo), classifica faturas
- **Onde é usada:** Edge Functions `extrair-fatura` e `ler-foto-abastecimento`
- **Segredo:** `GOOGLE_AI_API_KEY`, guardado nos secrets do Supabase (nunca no frontend)
- **Titular da conta:** A CONFIRMAR
- **Custo:** A CONFIRMAR — faturação por utilização (tokens); confirmar limites e alertas de gasto configurados

### Resend — envio de e-mail

- **Função:** e-mail de resumo de alertas (Edge Function `enviar-resumo-alertas`)
- **Segredo:** `RESEND_API_KEY`
- **Titular da conta:** A CONFIRMAR
- **Custo:** A CONFIRMAR — plano gratuito tem limite mensal de e-mails

### Sentry — monitorização de erros

- **Função:** captura erros do frontend em produção (`src/app/lib/sentry.ts`)
- **Chave:** `VITE_SENTRY_DSN` (pública por natureza — identifica o projeto, não dá acesso)
- **Titular da conta:** A CONFIRMAR
- **Custo:** A CONFIRMAR — plano gratuito tem limite de eventos/mês

### Anthropic (Claude) — revisão automática de código

- **Função:** revê cada Pull Request automaticamente (`pr-review.yml`)
- **Segredo:** `ANTHROPIC_API_KEY`, nos secrets do GitHub Actions
- **Titular da conta:** A CONFIRMAR
- **Custo:** A CONFIRMAR — faturação por utilização

### E-mail institucional

- **Conta raiz atual:** `encivil.sistemas@hotmail.com` — **interina**
  (`docs/11-transferencia-titularidade.md`)
- **Planeado:** usar o domínio próprio da empresa (`encivil.pt`) — já existe
  um utilizador `admin@encivil.pt` no sistema de autenticação do Supabase,
  mas confirmar se a caixa de correio em si já está ativa
- **Titular/quem tem acesso à caixa:** A CONFIRMAR
- **2FA + gestor de passwords + envelope de emergência para a Direção:** ainda não implementado (§6)

### Domínio `encivil.pt`

- **Registrar/conta de gestão:** A CONFIRMAR
- **`app.encivil.pt` (subdomínio para o sistema):** ainda não criado/ligado ao Cloudflare Pages

### Shelly Polo 2 (bomba de combustível)

- Não é uma conta na nuvem — comunica em rede local, autenticado por um
  segredo partilhado (`PUMP_POLO2_SECRET`, guardado nos segredos do
  Supabase). Ver `supabase/scripts/shelly-polo2.js` para o procedimento de
  configuração do aparelho.

---

## 3. Legado — a desligar

| O quê | Estado | Ação |
|---|---|---|
| Vercel (`antigo-vercel` remote, repo pessoal `mickaelorlande/armazem-encivil`) | Congelado, sem pushes desde a migração para Cloudflare Pages | Desligar o projeto na Vercel quando a equipa deixar de o usar (docs/11 Fase 4) |
| Projeto Supabase `azbzqintclkovlvkxfle` | Criado por engano, vazio | Apagar |
| Utilizador de teste `encivil.sistemas@hotmail.com` no Auth (password `admin123`, papel admin) | A confirmar se ainda existe | **Verificar e apagar com prioridade** — é um acesso de administrador com password fraca, se ainda existir |
| `vercel.json`, `pnpm-workspace.yaml` no repositório | Removidos em 2026-09-29 (ver commit de limpeza) | — |

---

## 4. Assinaturas — o que precisa de decisão/aprovação da Direção

Conforme o mandato da função, qualquer compromisso financeiro (subscrições
pagas) precisa de autorização prévia. Candidatos identificados hoje:

- **Supabase Pro** — necessário para backup automático do banco de dados e
  MFA para os utilizadores. Sem isto, o sistema não tem rede de segurança
  real contra perda de dados.
- **Domínio `app.encivil.pt`** — se o registo não estiver já pago/ativo.
- Confirmar se Sentry, Resend ou Google AI Studio vão precisar de plano
  pago à medida que o uso crescer (todos têm planos gratuitos hoje, com limites).

---

## 5. Continuidade — checklist (estado em 2026-09-29)

Origem: `docs/11-transferencia-titularidade.md` (checklist completo lá).

| Item | Estado |
|---|---|
| Backup do código (GitHub, histórico completo) | ✅ |
| Backup da base de dados | ❌ Nunca foi feito — depende do login do Supabase CLI com a conta da organização |
| Exportação manual de tabelas de negócio (`/backup` no sistema, admin) | 🟡 Existe, mas tinha um erro (tabela `comb_viaturas` não existe — a corrigir) e não cobre todas as tabelas |
| 2FA nas contas novas | ❌ |
| Gestor de passwords partilhado + envelope de emergência para a Direção | ❌ |
| E-mail institucional definitivo (`ti@encivil.pt`) | ❌ Ainda no hotmail interino |
| Domínio `app.encivil.pt` ligado | ❌ |
| Projeto Vercel antigo desligado | ❌ |
| Documento de continuidade entregue à Direção | 🟡 Este documento é o rascunho — falta reunir os "A CONFIRMAR" e entregar |
| Declaração de propriedade formalizada | ❌ |

---

## 6. Fora do âmbito deste sistema

Tecnologia da empresa que não passa pelo ENCIVIL Gestão e sobre a qual não
tenho visibilidade direta — a preencher pela Direção/Mickael se for para
constar do inventário completo:

- **TOConline** (faturação/contabilidade) — já em uso; integração com o
  ENCIVIL Gestão foi deliberadamente adiada (ver `docs/12-plano-v3.md`, secção 1 ignorada)
- Telefonia, email de outros colaboradores, outras licenças de software —
  A CONFIRMAR se existem e se são geridas por este responsável

---

## 7. Perguntas em aberto (preencher antes de entregar à Direção)

1. Quem são hoje os titulares/administradores de cada conta acima (GitHub, Cloudflare, Supabase, Google AI Studio, Resend, Sentry, Anthropic)?
2. Existe algum gestor de passwords em uso? Se não, qual escolher?
3. Quais destas contas têm 2FA ativo?
4. O utilizador de teste `admin123` ainda existe no Auth do Supabase?
5. O plano do Supabase é Free ou Pro? Se Free, aprovar a mudança para Pro (backup + MFA)?
6. O domínio `encivil.pt` está registado em nome da empresa? Onde?
7. Existe orçamento definido para as assinaturas listadas em §4?
