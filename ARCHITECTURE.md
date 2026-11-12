# Arquitetura — ENCIVIL Gestão

> A **constituição** do sistema. Qualquer decisão de estrutura, novo módulo ou
> alteração de fronteiras deve respeitar este documento. Se algo aqui deixar de
> fazer sentido, atualiza-se este ficheiro **primeiro**, depois o código.

---

## 1. Filosofia: Monólito Modular (não microserviços)

Uma aplicação, uma base de dados, **módulos de fronteiras claras**. Ganha-se a
separação ("cada coisa no seu sítio, não misturar") sem a complexidade
operacional dos microserviços (rede entre serviços, consistência eventual,
múltiplos deploys, observabilidade distribuída) — que não se justifica para uma
PME com um responsável técnico.

> **Regra de ouro:** modular por dentro, monólito por fora. Separação lógica
> forte, deploy simples. Só se separa um módulo em serviço próprio quando *esse*
> módulo o exigir (ex.: faturação certificada pela AT).

---

## 2. Mapa de Módulos

A **OBRA é a entidade central** — quase tudo se liga a uma obra (`obra_id`).

```
              ┌──────────────────── NÚCLEO ────────────────────┐
              │  Auth · Perfis · Permissões · Config · Auditoria │
              │            Notificações · Relatórios             │
              └───────────────────────┬─────────────────────────┘
                      ╔═══════════════╧═══════════════╗
                      ║      OBRAS (entidade central)  ║
                      ╚═══════════════╤═══════════════╝
      ┌──────────┬───────────┬────────┼─────────┬────────────┬──────────┐
   Armazém   Ferramentas  Subempreit. Abastecim.   Frota      RH / Horas
   (stock)   (empréstimos) (autos)    (comb_*)   (veiculo_*)  (picagens)
      └──────────┴───────────┴────CUSTOS POR OBRA──┴────────────┴─────────┘
                         (job costing — consolida tudo)
```

| Módulo | Estado | Tabelas (prefixo) |
|---|---|---|
Estado em 2026-11-12 (todos em produção, exceto onde indicado):

| Módulo | Estado | Tabelas (prefixo) |
|---|---|---|
| Núcleo (auth, perfis, config, auditoria, segurança) | ✅ | `profiles`, `configuracoes_empresa`, `audit_log`, `eventos_seguranca`, `seguranca_config` |
| Obras | ✅ | `obras`, `obra_*` (equipa, fases, orçamento EAP, relatórios diários, fotos), `guias_transporte`, `registos_obra` (livro de obra) |
| Armazém | ✅ | `produtos`, `movimentos_stock` |
| Ferramentas | ✅ | `ferramentas`, `emprestimos_ferramentas` |
| Subempreitadas | ✅ | `subempreiteiros`, `subempreiteiro_artigos`, `autos_medicao`, `auto_*`, `sub_*`, `subs_config` |
| Abastecimento | ✅ | `comb_*`, `pump_*` (bomba Polo 2) |
| Frota | ✅ | `veiculo_*`, `frota_*` (usa `comb_veiculos` como cadastro de viaturas) |
| RH | ✅ | `colaboradores*`, `horario*`, `picagens`, `faltas`, `resumo_assiduidade_dia`, `*_epi`, `formacoes_colaborador`, `custo_hora_colaborador` |
| Faturas e contabilidade | ✅ | `faturas_fornecedor`, `linhas_fatura`, `regras_classificacao` |
| Alertas e notificações | ✅ | `alertas`, `regras_alerta`, `push_subscriptions` |
| Custos por Obra (job costing) | ⭐ | RPC `custos_consolidados_por_obra` — sem tabelas próprias |
| Compras / faturação legal | — | fora de âmbito (`docs/12-plano-v3.md`) |

⭐ **Custos por Obra** é a joia da coroa: consolida materiais + subempreiteiros +
combustível + mão-de-obra de uma obra e compara com o orçamento → custo real vs.
previsto. É o que dá consciência de margem ao dono.

---

## 3. Fronteiras de Código (frontend)

```
src/
  app/components/ ← UI partilhada (PageHeader, SeparadoresNav, FiltroChips, CampoSelect…) e ui/ (shadcn)
  app/lib/        ← kernel comum: useAsync, useMutation, buscarTodas, format, export*, stockUtils…
  integrations/supabase/ ← cliente, config.ts, types.ts (gerado)
  features/
    <módulo>/    ← services/, hooks/, components/, lib/ próprios do módulo (+ db.ts, index.ts)
    auth/        ← sessão, papéis, MATRIZ_ESCRITA (espelho de pode_escrever)
  app/pages/     ← rotas, layout, páginas (COMPOSIÇÃO — sem lógica de negócio)
```

**Leis de fronteira:**
1. Um módulo só importa de `features/auth`, `@/app/lib`, `@/app/components` e `@/integrations`.
   Partilha → `src/app/lib` ou `src/app/components`. Exceções históricas (não alargar): `obras` é
   núcleo de subempreiteiros, autos, faturas, picagens, livro-obra, custos, contabilidade e dashboard;
   `colaboradores` ↔ `horarios`/`picagens`/`epis`.
2. Um módulo pode referenciar outro **só por id** (ex.: `obra_id`) e através dos
   *services públicos* do outro, nunca dos seus internos.
3. `app/pages/` compõe UI; a lógica vive nos `hooks`/`services` do módulo.
4. A fronteira é a **pasta**. Se dois módulos começam a importar-se, ou há um
   kernel comum em falta, ou a fronteira está errada.

---

## 4. Backend — as leis invioláveis

1. **Uma verdade por facto.** Zero duplicação. `obra_id` liga tudo.
2. **Escritas multi-tabela só via RPC `SECURITY DEFINER`** (transação atómica).
   Ex.: `registar_movimento`, `registar_emprestimo_ferramenta`, `validar_auto`.
3. **RLS em todas as tabelas + GRANT explícito** (o projeto tem "expose new
   tables" OFF — cada tabela/sequência/RPC nova exige GRANT na mesma migration).
4. **Imutabilidade onde importa** via RLS por estado: movimentos são imutáveis;
   contratos e autos ficam imutáveis após `validado` (UPDATE/DELETE só em
   `rascunho`; a passagem a `validado` só pela RPC de validação, admin-only).
   Os autos seguem `rascunho → submetido → verificado → validado` (coluna `workflow`,
   `docs/20-subempreitadas-controlo.md`).
5. **Auditoria** (`audit_log`) nas ações sensíveis (validações, alterações de
   papel, apagamentos).
6. **Migrations** versionadas, para a frente, auto-contidas (schema + RLS +
   grants juntos), idempotentes e com bloco `-- ROLLBACK` comentado no fim.
   Publicação sempre **site → migrations → Edge Functions** (o site novo
   funciona com a BD antiga).
7. **Dinheiro em `NUMERIC`, nunca float.** Enums de estado consistentes
   (`rascunho`/`validado`).
8. **Organização por convenção de nomes** (`obra_*`, `sub_*`/`subs_*`, `auto_*`,
   `comb_*`, `pump_*`, `veiculo_*`, `frota_*`, `colaboradores*`) em vez de schemas Postgres separados — no Supabase,
   schemas separados custam configuração de exposição sem ganho a esta escala.

---

## 5. Segurança & Permissões (RBAC)

**A RLS é a segurança real; a UI (esconder/desativar botões) é só conforto.**
Nunca confiar apenas na UI.

### Papéis

| Papel | Descrição |
|---|---|
| `admin` | Tudo + gestão de utilizadores + **validações** |
| `gestor` | Opera todos os módulos (sem gestão de utilizadores nem validação) |
| `armazem` | Armazém + Ferramentas (escrita); resto leitura |
| `medicoes` | Subempreitadas + Autos (escrita); resto leitura |
| `mecanico` | Só a Frota (manutenções, checklists, prazos) |
| `motorista` | Só pede abastecimentos e vê os seus pedidos |
| `leitura` | Só ver + relatórios |

### Matriz (papéis × módulos × ações)

Escrita = `public.pode_escrever(modulo)` (definição vigente em `20260929030000_fase9_frota.sql`).

| Papel | Armazém | Ferramentas | Combustível | Obras | Subempr./Autos | Frota | Validar | Utilizadores |
|---|---|---|---|---|---|---|---|---|
| admin | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✅ | ✅ |
| gestor | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | — | — |
| armazem | ✏️ | ✏️ | ✏️ | 👁️ | 👁️ | — | — | — |
| medicoes | 👁️ | 👁️ | 👁️ | 👁️ | ✏️ | — | — | — |
| mecanico | — | — | — | — | — | ✏️ | — | — |
| motorista | — | — | pede para si | — | — | — | — | — |
| leitura | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ | — | — |

`colaboradores` (RH) não passa por `pode_escrever`: policy própria (`admin`, `gestor`).
Leitura (👁️) e menus por papel: confirmar no código (`src/features/auth/lib/permissoes.ts`, `Sidebar`) — a tabela acima resume a escrita.

- **Autorizar abastecimentos** não é de um papel: é de `comb_aprovadores` (o CEO
  e quem ele designar; sem ninguém designado, os admin) — ver `docs/15-abastecimento-v2.md`.

- **Menor privilégio:** cada papel só o que precisa.
- **Validação = cadeado do admin** (padrão rascunho→validado já implementado).
- Fonte única da verdade: funções SQL `public.pode_escrever(modulo)` / `public.auth_role()`;
  espelho no frontend em `MATRIZ_ESCRITA` (`src/features/auth/lib/permissoes.ts`), validado
  pelo teste `supabase/tests/permissoes-espelho.test.mjs`.
- MFA TOTP (obrigatório para admin/gestor quando `seguranca_config` o liga) e logout por inatividade (30 min).
- *(Futuro)* âmbito por obra: um utilizador só vê as obras que lhe são atribuídas.

---

## 6. UX / Usabilidade

1. **Duas lentes:** por módulo (menu lateral) **e** por obra (**Ficha de Obra**
   agregadora — tudo de uma obra num só ecrã).
2. **Menu agrupado por secções** (Operação · Obras · Gestão) — escala para 15+
   módulos sem virar uma lista infinita.
3. **Consistência = velocidade.** Todos os módulos seguem o mesmo padrão:
   `Lista → Detalhe → Formulário`, pesquisa com combobox, fluxo
   `Rascunho → Validado`, mobile-first, operação em <10s.
4. **Menu por papel:** cada utilizador só vê os módulos que pode usar.
5. **Componentes de página partilhados** (desde 2026-11): `PageHeader`,
   `SeparadoresNav`, `FiltroChips`, `CampoSelect`, `EmptyState` e duas larguras
   (`LARGURA_PAGINA`, `LARGURA_FORMULARIO`) — ver `CLAUDE.md` › Identidade visual.
6. **Resiliência offline** para operações de campo (fila local nos
   movimentos e nas picagens, com `client_id` para não duplicar; padrão a reutilizar).

---

## 7. Roadmap

Fundação, Combustível/Abastecimento, Custos por Obra, Frota e RH estão entregues
(2026-11-12). Último checkup geral: `docs/auditorias/2026-10-28-checkup-geral.md`
(pendentes na §6). Ideias futuras: `docs/melhorias-futuras.html`; plano faseado
e exclusões (faturação, ecommerce, pagamentos): `docs/12-plano-v3.md`.

---

## 8. Custos por Obra (job costing) — como TODOS os dados se ligam

O número que interessa ao CEO, por obra: **quanto custou de verdade vs. quanto
vamos receber → margem (lucro)**. A OBRA é o ponto de encontro de tudo.

```
                          ┌───────────────────────────┐
                          │           OBRA            │
                          │   orcamento (€ cliente)   │
                          └─────────────┬─────────────┘
             obra_id / executado        │        obra_id
        ┌──────────────────┬────────────┼────────────┬──────────────────┐
        ▼                  ▼                          ▼                  ▼
  MOVIMENTOS (saída)  SUBEMPREITEIROS            ABASTECIMENTOS      (futuro:
  × produtos.custo    → AUTOS validados          comb × custo         RH/horas)
  = CUSTO MATERIAIS   = CUSTO SUBEMPREITEIROS    = CUSTO COMBUSTÍVEL
        └──────────────────┴─────────── + ───────┴──────────────────┘
                                   ║
                          CUSTO REAL DA OBRA
                                   ║
                    MARGEM = orcamento − custo real
```

**As ligações (todas por CHAVE, não por texto):**
| Fonte de custo | Como liga à obra | Como se valoriza |
|---|---|---|
| **Materiais** | `movimentos_stock.obra_id` (saídas) | `quantidade × produtos.custo_unitario` |
| **Subempreiteiros** | `subempreiteiros.obra_id` | soma dos `autos_medicao` **validados** (`valor_periodo`) |
| **Combustível** | `comb_abastecimentos.obra_id` | soma de `custo_total` |
| **Orçamento** | `obras.orcamento` | valor contratado com o cliente |

**Read-model:** `features/custos/services/custosService.ts` (`custoObra`,
`custosMateriaisCombustivelPorObra`, `custoConsolidado`) é a camada de composição.
`custoConsolidado` chama a RPC `custos_consolidados_por_obra` (definição vigente em
`20261028120500_checkup_custos_stock.sql`), que devolve cinco parcelas por período:
materiais, mão de obra, combustível, fornecedores e subempreiteiros, comparadas com
os orçamentos por parcela da obra. Alimenta: a **Ficha de Obra** (P&L: Orçamento · Custo Real · Margem +
repartição) e o **Relatório de Obras** (P&L de todas as obras, exportável em PDF).

> Nota: só saídas com `obra_id` (obra escolhida no cadastro) entram no custo de
> materiais — daí a saída de stock passar a pedir a **obra de destino**. Saídas
> antigas em texto livre (`destino_obra`) não têm custo imputado.

## 9. Hospedagem (nota de longo prazo)

- **Hoje (desde 2026-09):** frontend estático no Cloudflare Pages (deploy
  automático de `main`, domínio `app.encivilconstroi.com`) + Supabase gerido.
  A Vercel (Hobby, só não-comercial) é legado — remote `antigo-vercel`, nunca dar push.
- **Longo prazo:** VPS única (ex.: OVH) a consolidar todos os sistemas, com
  Docker + Caddy (HTTPS) + firewall + backups automáticos fora do servidor +
  atualizações automáticas. Dados na UE (RGPD). Só quando houver 2+ sistemas a
  justificar e alguém a manter o servidor.
- ⚠️ Software que **emite faturas legais** pode exigir certificação pela AT —
  questão legal independente do hosting.
