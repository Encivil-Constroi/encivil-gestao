# ENCIVIL Gestão

ERP interno da ENCIVIL (empresa de construção civil, Portugal) — armazém,
obras, subempreiteiros, ferramentas, combustível/frota, RH e mais.

**Estado: em produção, multiutilizador.** [app.encivilconstroi.com](https://app.encivilconstroi.com)

---

## Objetivo do Sistema

Substituir folhas de cálculo e registos em papel por um sistema único onde
armazém, obras, ferramentas, combustível e RH ficam ligados à mesma obra,
com stock em tempo real, histórico auditável e alertas automáticos.

## Público-alvo e Papéis

| Papel | Pode |
|---|---|
| `admin` | Tudo — incluindo eliminar permanentemente e aprovação final |
| `gestor` | Gestão e aprovação na maioria dos módulos |
| `armazem` | Registar em armazém, ferramentas e combustível; sem gestão |
| `medicoes` | Registar em subempreitadas (contratos/autos); sem gestão |
| `mecanico` | Só a Frota: manutenções, checklists, prazos e condutores das viaturas |
| `motorista` | Só pede abastecimentos e vê os seus pedidos (aprovar é de `comb_aprovadores`) |
| `leitura` | Só consulta, em todos os módulos |

O papel é definido na tabela `profiles` e aplicado via Row Level Security —
não é apenas uma restrição de UI (`public.pode_escrever(modulo)` no
Postgres é a fonte real). Ver `docs/05-seguranca-e-acesso.md`.

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite 6 |
| Estilização | Tailwind CSS v4, shadcn/ui + Radix; tokens em `src/styles/theme.css` |
| Gráficos e mapas | Recharts, Leaflet |
| Roteamento | React Router v7, `lazy()` por rota (ver ADR-010) |
| PWA | vite-plugin-pwa / Workbox — instalável em iOS e Android, push notifications |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions) |
| IA | Google Gemini (leitura de faturas e fotos de abastecimento) |
| Hospedagem | Cloudflare Pages (deploy automático em push para `main`) |
| Monitorização | Sentry (erros frontend) |

## Módulos

Armazém e stock · Obras (painel, progresso, equipa, recursos e relatórios diários;
ver `docs/19-obras.md`) · Subempreiteiros (contratos, ocorrências e autos de medição
integrados em Obras) · Ferramentas (empréstimos + termo de responsabilidade) ·
Abastecimento (pedidos por QR com aprovação, histórico, bomba Polo 2 automatizada) ·
Frota (manutenção, checklists, prazos legais e condutor responsável por viatura) ·
Colaboradores, horários, faltas, picagem de ponto (GPS/geofence), EPIs e
formações · Faturas de fornecedor (classificação por IA) · Custos
consolidados e livro de obra digital · Exportação para a contabilidade ·
Alertas · Início por cargo, dashboard e relatórios · Auditoria · Gestão de
utilizadores (MFA) · Backup manual (exportação por tabela).

Lista completa e estado de cada fase: `docs/10-roadmap.md` e `docs/12-plano-v3.md`.

---

## Como Executar Localmente

### Pré-requisitos

- Node.js 22+ (CI usa Node 24 LTS)
- npm (não pnpm — o projeto usa `package-lock.json`)
- Acesso ao projeto Supabase

### Instalação

```bash
git clone https://github.com/Encivil-Constroi/encivil-gestao.git
cd encivil-gestao
npm install
```

### Configuração

```bash
cp .env.example .env.local
# Editar .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
```

### Executar em desenvolvimento

```bash
npm run dev          # http://localhost:5173
```

> ⚠️ Com o `.env.local` de produção (ou sem `.env.local`), `npm run dev` liga à
> **base de dados de produção**: só para consulta. Para testar com dados, usar
> o Supabase local (`npx supabase start`, precisa de Docker) com
> `VITE_SUPABASE_URL=http://127.0.0.1:54321` e a chave publicável local; dados
> fictícios e testes de carga em `scripts/carga/` (ver o `README.md` da pasta).
> Em dev, uma configuração preenchida mas inválida faz a app **falhar com erro**
> em vez de cair em produção (`src/integrations/supabase/config.ts`).

### Comandos úteis

```bash
npm run typecheck    # TypeScript — deve dar 0 erros
npm run lint         # ESLint sem avisos (corre no CI)
npm test             # Vitest: frontend (jsdom) + BD em Postgres em memória (PGlite); sem Supabase real
npm run build        # bundle de produção
npm run check:edge    # deno check nas Edge Functions
npm run test:edge     # testes Deno das Edge Functions
```

---

## Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SENTRY_DSN=            # opcional; vazio desativa o Sentry
VITE_VAPID_PUBLIC_KEY=      # chave pública Web Push (no Cloudflare Pages)
```

> **Regra inegociável:** nunca usar a chave `sb_secret_...` no frontend.
> Apenas `sb_publishable_...`, que é segura para expor — a RLS + GRANTs
> garantem o controlo de acesso real. Ver `docs/05-seguranca-e-acesso.md`.

---

## Estrutura do Código

Ver a secção "Estrutura" em `CLAUDE.md` para a árvore completa e
responsabilidades por camada. Resumo:

```
src/
├── app/          # Páginas, rotas, layout, componentes partilhados, hooks base (useAsync/useMutation, buscarTodas)
├── features/     # Lógica de negócio por módulo — sem novas importações entre módulos (exceções em CLAUDE.md)
├── integrations/supabase/   # Cliente, config.ts (guarda de dev) + tipos gerados (não editar types.ts à mão)
├── __tests__/    # Testes Vitest do frontend
└── build/        # Configuração de build testável (ex.: divisão de chunks do Vite)
supabase/
├── migrations/   # Todas as migrations SQL, em ordem cronológica (101 em 2026-11-12)
├── functions/    # Edge Functions (Deno) + _shared/
└── tests/        # Testes de BD num Postgres real em memória (PGlite)
scripts/carga/    # Seed, carga e concorrência — só contra Supabase local
docs/             # Ver docs/README.md (índice)
```

---

## Regras Críticas de Negócio

1. Entrada **soma** ao stock atual. Saída **subtrai**. Ajuste define o valor exato.
2. Saída não pode ser superior ao stock disponível — bloqueada pela RPC `registar_movimento`.
3. Histórico de movimentos **nunca é apagado fisicamente**.
4. Todos os relatórios são calculados a partir de `movimentos_stock`, não de `produtos.stock_atual`.
5. Destino/obra é **obrigatório** para saídas.
6. Mudança de papel de utilizador só via RPC dedicada (auditada) — nunca por update direto.

Detalhe completo em `docs/02-regras-de-negocio.md`.

---

## Segurança

Resumo — ver `docs/05-seguranca-e-acesso.md` para o detalhe completo:

- RLS ativa em todas as tabelas; GRANTs explícitos (a exposição automática de
  novas tabelas está desligada no projeto Supabase)
- RPCs sensíveis usam `SECURITY DEFINER` com `SET search_path = public` e
  verificação de papel no servidor via `public.pode_escrever()`/`public.auth_role()`
- `audit_log` regista mudanças de papel
- Headers de segurança em `public/_headers` (convenção Cloudflare Pages): CSP, HSTS, X-Frame-Options, etc.
- Pre-commit hook bloqueia commits com padrões de segredo (chave secreta, papel de serviço, JWTs longos) e corre o typecheck
- Pre-push hook corre `npm run build` antes de deixar o push sair
- CI: `npm audit` e gitleaks (segredos no histórico); backup da BD por workflow (`backup-bd.yml`)
- MFA TOTP (obrigatório para admin/gestor quando ligado) e logout automático após 30 min de inatividade
- Operação, backups, recuperação e incidentes: `docs/22-seguranca-operacao.md`; reportar falhas: `SECURITY.md`

Inventário de contas, segredos e assinaturas: `docs/13-infraestrutura-e-contas.md`.

---

## Documentação

Índice completo, com o estado de cada ficheiro (atual/histórico/obsoleto):
**`docs/README.md`**. Para começar:

| Documento | Para quê |
|---|---|
| `docs/PASSAGEM-DE-PROJETO.md` | Guia curto para quem continua o projeto |
| `docs/00-source-of-truth.md`, `docs/02-regras-de-negocio.md` | Verdade do produto e regras de stock |
| `docs/17-armazem.md` … `docs/20-subempreitadas-controlo.md`, `docs/15-abastecimento-v2.md` | Um doc por módulo |
| `docs/05-seguranca-e-acesso.md`, `docs/22-seguranca-operacao.md` | Papéis/RLS; backups, MFA, incidentes |
| `docs/09-implantacao.md` | Deploy e checklist de produção |
| `docs/13-infraestrutura-e-contas.md` | Contas, segredos, assinaturas |
| `docs/auditorias/2026-10-28-checkup-geral.md` | Último checkup (segurança, bugs, carga) e pendentes |
| `docs/adrs/` | Decisões arquiteturais |

Ler `CLAUDE.md` (regras obrigatórias de código) e `AGENTS.md` antes de
contribuir com IA.
