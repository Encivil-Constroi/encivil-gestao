# ENCIVIL Gestão

ERP interno da ENCIVIL (empresa de construção civil, Portugal) — armazém,
obras, subempreiteiros, ferramentas, combustível/frota, RH e mais.

**Estado: em produção, multiutilizador.** [encivil-gestao.pages.dev](https://encivil-gestao.pages.dev)

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
| `leitura` | Só consulta, em todos os módulos |

O papel é definido na tabela `profiles` e aplicado via Row Level Security —
não é apenas uma restrição de UI (`public.pode_escrever(modulo)` no
Postgres é a fonte real). Ver `docs/05-seguranca-e-acesso.md`.

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite 6 |
| Estilização | Tailwind CSS v4 |
| Roteamento | React Router v7, `lazy()` por rota (ver ADR-010) |
| PWA | vite-plugin-pwa / Workbox — instalável em iOS e Android, push notifications |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions) |
| IA | Google Gemini (leitura de faturas e fotos de abastecimento) |
| Hospedagem | Cloudflare Pages (deploy automático em push para `main`) |
| Monitorização | Sentry (erros frontend) |

## Módulos

Armazém e stock · Obras (entidade central) · Subempreiteiros (contratos +
autos de medição) · Ferramentas (empréstimos + termo de responsabilidade) ·
Combustível (abastecimentos por QR, viaturas, bomba Polo 2 automatizada) ·
Frota (manutenção, checklists, prazos legais e condutor responsável por viatura) ·
Colaboradores, horários, faltas, picagem de ponto (GPS/geofence), EPIs e
formações · Faturas de fornecedor (classificação por IA) · Custos
consolidados e livro de obra digital · Alertas de manutenção · Dashboard e
relatórios · Backup manual (exportação por tabela).

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
npm run dev
```

### Comandos úteis

```bash
npm run typecheck    # TypeScript — deve dar 0 erros
npm test             # Vitest (unitários + integração, sem Supabase)
npm run build        # bundle de produção
npm run check:edge    # deno check nas Edge Functions
npm run test:edge     # testes Deno das Edge Functions
```

---

## Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> **Regra inegociável:** nunca usar a chave `sb_secret_...` no frontend.
> Apenas `sb_publishable_...`, que é segura para expor — a RLS + GRANTs
> garantem o controlo de acesso real. Ver `docs/05-seguranca-e-acesso.md`.

---

## Estrutura do Código

Ver a secção "Arquitetura" em `CLAUDE.md` para a árvore completa e
responsabilidades por camada. Resumo:

```
src/
├── app/          # Páginas, rotas, layout, hooks base (useAsync/useMutation), tipos partilhados
├── features/     # Lógica de negócio por módulo — um módulo nunca importa de outro
├── integrations/supabase/   # Cliente Supabase + tipos gerados (não editar types.ts à mão)
└── build/        # Configuração de build testável (ex.: divisão de chunks do Vite)
supabase/
├── migrations/   # Todas as migrations SQL, em ordem cronológica
├── functions/    # Edge Functions (Deno)
└── tests/        # Testes de banco num Postgres real em memória (PGlite)
docs/             # Especificação, arquitetura, segurança, ADRs — ver "Documentação" abaixo
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

Inventário de contas, segredos e assinaturas: `docs/13-infraestrutura-e-contas.md`.

---

## Documentação

```
docs/
  00-source-of-truth.md       ← Ler sempre primeiro
  01-requisitos-funcionais.md
  02-regras-de-negocio.md
  03-modelo-de-dados.md
  04-arquitetura.md
  05-seguranca-e-acesso.md     ← Modelo de papéis, RLS, RPCs, audit log
  06-ux-ui.md
  07-relatorios.md
  08-testes.md
  09-implantacao.md            ← Deploy, variáveis de ambiente, checklist de produção
  10-roadmap.md
  11-transferencia-titularidade.md  ← Migração para contas da empresa
  12-plano-v3.md                ← Plano faseado da expansão ERP
  13-infraestrutura-e-contas.md ← Contas, segredos, assinaturas — para a Direção
  plano-seguranca-desempenho.md ← Plano de correções em curso
  specs/SPEC-*.md               ← Spec funcional por módulo
  adrs/ADR-*.md                 ← Decisões arquiteturais
  archive/                      ← Material histórico superado (backlog inicial, brief original)
```

Ler `CLAUDE.md` (regras obrigatórias de código) e `AGENTS.md` antes de
contribuir com IA.
