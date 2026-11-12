# Índice da documentação — `docs/`

Revisto em 2026-11-12. Uma linha por ficheiro ou subpasta: o que é e o estado.
Estados: **atual** (descreve o sistema de hoje) · **referência** (atual, mas de consulta pontual) ·
**histórico** (registo de uma decisão, plano ou auditoria já feitos; não descreve o estado de hoje) ·
**obsoleto** (substituído; manter só pelo valor histórico). Em caso de dúvida, **o código manda**.

Para começar: `PASSAGEM-DE-PROJETO.md` → `../CLAUDE.md` → doc do módulo.

## Raiz do repositório

| Ficheiro | O que é | Estado |
|---|---|---|
| `../README.md` | Apresentação, stack, como correr localmente | atual |
| `../CLAUDE.md` | Regras completas do projeto (para pessoas e IA) | atual — fonte principal |
| `../AGENTS.md` | Resumo do `CLAUDE.md` para outras ferramentas de IA | atual (em conflito vale o `CLAUDE.md`) |
| `../ARCHITECTURE.md` | Monólito modular, mapa de módulos, RBAC, custos por obra | atual |
| `../SECURITY.md` | Como reportar uma vulnerabilidade | atual |

## Guias e documentos de base (`docs/`)

| Ficheiro | O que é | Estado |
|---|---|---|
| `PASSAGEM-DE-PROJETO.md` | Guia curto para quem continua o projeto (o `.pdf` é a mesma coisa impressa) | atual |
| `00-source-of-truth.md` | Verdade principal do produto (armazém e regras gerais) | atual |
| `01-requisitos-funcionais.md` | Requisitos do MVP de stock (2026-06) | referência — só o MVP; módulos seguintes nos docs 15–20 |
| `02-regras-de-negocio.md` | Regras de stock e movimentos (RN-*) | atual |
| `03-modelo-de-dados.md` | Modelo de dados | referência — o esquema real são as migrations |
| `04-arquitetura.md` | Stack e organização do código | atual (visão de módulos em `ARCHITECTURE.md`) |
| `05-seguranca-e-acesso.md` | Papéis, RLS, RPCs, audit log | atual |
| `06-ux-ui.md` | Guia de interface e identidade visual | atual (tokens em `src/styles/theme.css`) |
| `07-relatorios.md` | Relatórios de stock | referência |
| `08-testes.md` | Plano de testes manuais (T-*) | referência — testes automáticos em `src/__tests__` e `supabase/tests` |
| `09-implantacao.md` | Deploy (Cloudflare Pages), variáveis, checklist de produção | atual |
| `10-roadmap.md` | Fases entregues e por fazer | referência |
| `11-transferencia-titularidade.md` | Plano de passagem das contas para a ENCIVIL (2026-07) | histórico — estado vigente no doc 13 |
| `12-plano-v3.md` | Plano faseado da expansão ERP (RH, alertas, faturas, custeio) e exclusões | referência |
| `13-infraestrutura-e-contas.md` | Contas, segredos, assinaturas, titularidade | atual |
| `14-referencia-flutterflow.md` | O que aproveitar do protótipo FlutterFlow (2026-09-30) | histórico |
| `16-jev-gateway.md` | Gateway JEV no desenvolvimento com IA (não faz parte do ERP) | referência — uso atual por confirmar |
| `22-seguranca-operacao.md` | Operação: backups, MFA, rotação de segredos, recuperação, incidentes | atual |
| `plano-seguranca-desempenho.md` | Plano de segurança e desempenho iniciado em 2026-09-29 | histórico — tabela "Estado" no fim do ficheiro |
| `superpowers.md` | Instalação e versão das skills Superpowers (`.agents/skills/`) | atual |
| `melhorias-futuras.html` | Ideias e melhorias por fazer | referência |
| `modulos-encivil.html` | Mapa visual dos módulos (2026-09-25) | histórico — anterior a Frota e Abastecimento v2 |
| `21b-shelly-ligacao-bomba-polo2.html` | Esquema de ligação do Shelly Pro 3 à bomba Polo 2 | referência |

## Docs de módulos

| Ficheiro | Assunto |
|---|---|
| `15-abastecimento-v2.md` | Abastecimento: pedido com conta, aprovação, bomba Polo 2, relatório |
| `17-armazem.md` | Armazém: artigos, entradas/saídas, ferramentas, inventário, fotos |
| `18-frota.md` | Frota: viaturas e máquinas, entregas, manutenção, revisão |
| `19-obras.md` | Obras: ficha, relatórios diários, equipa, orçamento, publicação |
| `20-subempreitadas-controlo.md` | Controlo de subempreitadas e auto-medição |
| `21-shelly-pro3-bomba.md` | Shelly Pro 3 na bomba Polo 2: instalação e operação |

## Subpastas

| Pasta | O que é | Estado |
|---|---|---|
| `specs/` | SPEC-* do armazém original (auth, dashboard, produtos, movimentos, histórico, relatórios, configurações, mobile, PWA) | referência — base do MVP; módulos novos nos docs 15–20 |
| `adrs/` | Decisões arquiteturais ADR-001 a ADR-010 | atual, exceto ADR-004 e ADR-008 (substituídas; ADR-008 pela ADR-010) |
| `plans/` | Planos de implementação de 2026-10 (armazém, frota, obras, subempreitadas, dashboard, início por cargo, relatórios CEO, Shelly, CLAUDE.md) | histórico — executados |
| `superpowers/specs/` | Desenhos (design docs) de 2026-10 (identidade visual, obras, subempreitadas, segurança 2026, checkup…) | histórico; em conflito com `specs/` vale o mais recente |
| `superpowers/plans/` | Planos de 2026-10/11, incl. pente fino, checkup geral e `2026-11-02-design-polimento.md` | histórico — executados; o de design descreve os componentes partilhados atuais |
| `superpowers/2026-10-06-validacao-redesign.md` | Registo do redesign e fecho do ramo (2026-10-06) | histórico |
| `auditorias/` | Auditorias de obras (2026-10-07/08) e checkup geral `2026-10-28-checkup-geral.md` | histórico; o checkup de 2026-10-28 é o mais recente e lista os pendentes |
| `auditorias/2026-10-28/` | Achados detalhados do checkup: triagem (`00-triagem.md`) e áreas A1–A5 | histórico |
| `archive/` | Backlog inicial (`TASKS*`), estrutura antiga e brief original | obsoleto — ver `archive/README.md` |
| `licenses/` | Licença das skills Superpowers | referência |
