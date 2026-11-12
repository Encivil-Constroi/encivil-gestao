# Roadmap — Controle Armazém ENCIVIL

---

## Fase 1 — MVP (Entregue, em produção)

| # | Funcionalidade | Estado |
|---|---------------|--------|
| 1 | Autenticação real (Supabase Auth, JWT) | ✅ Produção |
| 2 | Dashboard com estatísticas | ✅ Produção |
| 3 | CRUD de Produtos (admin) | ✅ Produção |
| 4 | Registo de Entrada/Saída/Ajuste (RPC atómica) | ✅ Produção |
| 5 | Bloqueio de saída sem stock | ✅ Produção |
| 6 | Histórico de movimentos paginado | ✅ Produção |
| 7 | Alertas de stock baixo | ✅ Produção |
| 8 | Relatórios básicos | ✅ Produção |
| 9 | Configurações da empresa | ✅ Produção |
| 10 | Integração Supabase real (RLS, RPCs) | ✅ Produção |
| 11 | Deploy com CI/CD automático (Vercel até 2026-09; hoje Cloudflare Pages) | ✅ Produção |
| 12 | **Multiutilizador** (admin/gestor) — adiantado da Fase 2 | ✅ Produção |
| 13 | **PWA instalável** (iOS/Android) — adiantado da Fase 3 | ✅ Produção |

## Hardening de Segurança e Performance (Entregue, 2026-06-12 a 2026-06-22)

Não estava no plano original — surgiu de auditorias dedicadas. Ver `TASKS/SEGURANÇA/`, `TASKS/UX/`, `TASKS/PERFORMANCE/` para o detalhe de cada item.

| Área | Entregue |
|---|---|
| Segurança | RoleGuard, RLS + GRANTs a nível de coluna, RPCs auditadas, audit_log, headers HTTP (CSP/HSTS/etc.), auto-logout, dependências sem CVEs, pre-commit hook anti-segredos |
| Performance | Queries com colunas mínimas, paginação (histórico + movimentos por produto), eliminação de queries duplicadas, bundle único (sem stale-chunk) |
| UX | Paginação visual, links semânticos, pré-preenchimento de responsável, acesso de gestor a registo de movimentos |

---

## Fase 2 — Produtividade (estado em 2026-11-12)

Entregues desde então (ver `CLAUDE.md` e os docs de módulo): exportação Excel/CSV/PDF, obras como entidades, MFA (TOTP), fotos em movimentos, alertas por e-mail e push. Por fazer: código de barras, importação CSV em massa, focus trap em modais, dashboard por RPC única.

| # | Funcionalidade | Prioridade |
|---|---------------|------------|
| 1 | Exportação para Excel (.xlsx) | ✅ Entregue |
| 2 | Exportação para PDF | ✅ Entregue (relatórios e impressos) |
| 3 | Leitura de código de barras (câmara do telemóvel) | P1 |
| 4 | Importação de produtos em massa (CSV) | P1 |
| 5 | Obras cadastradas como entidades (não texto livre) | ✅ Entregue |
| 6 | MFA para contas admin | ✅ Entregue (TOTP, `/seguranca/mfa`; obrigatoriedade por interruptor) |
| 7 | Anexos e fotos em movimentos | P2 — fotos existem em artigos e ferramentas; em movimentos por confirmar |
| 8 | Notificações de stock baixo por e-mail | P2 — existe o resumo diário de alertas (`enviar-resumo-alertas`) |
| 9 | Focus trap em modais (acessibilidade) | P2 — diferido conscientemente, ver `TASKS/UX/backlog/` |
| 10 | Dashboard via RPC única (consolidar 5 queries) | P2 — diferido conscientemente, ROI insuficiente nesta escala |

---

## Fase 3 (v3.0) — ERP Completo — ver `docs/12-plano-v3.md`

Plano faseado de expansão aprovado em 2026-07-30; fases F0 a F9 implementadas (F9 = Frota). Decisão arquitectural: manter React PWA + Supabase (ver `docs/adrs/ADR-009.md`).

| Fase | Módulo | Semanas | Estado |
|---|---|---|---|
| F0 | Módulo de Colaboradores | 1–2 | `[CONCLUÍDA]` |
| F1 | Motor de Alertas e Manutenção Preventiva | 3–4 | `[CONCLUÍDA]` |
| F2 | Horário de Trabalho, Faltas, Conformidade Laboral | 5–8 | `[CONCLUÍDA]` |
| F3 | Picagem de Presenças MVP | 9–10 | `[CONCLUÍDA]` |
| F4 | EPIs e Formações | 11–12 | `[CONCLUÍDA]` |
| F5 | Picagem com Geofence (PostGIS) | 13–14 | `[CONCLUÍDA]` |
| F6 | Ingestão e Classificação de Faturas | 15–18 | `[CONCLUÍDA]` |
| F7 | Custeio Consolidado por Obra | 19–20 | `[CONCLUÍDA]` |
| F8 | Livro de Obra Digital e Guias de Transporte | 21–22 | `[CONCLUÍDA]` |
| F9 | Frota: manutenção, checklists e responsabilização | — | `[CONCLUÍDA]` |

Para implementar: ler `docs/12-plano-v3.md` — contém schema SQL, ficheiros a criar e critérios de conclusão para cada fase.

---

## Fase 4 — Integração e Mobilidade (anterior Fase 3)

| # | Funcionalidade | Notas |
|---|---------------|-------|
| 1 | Integração com sistema de faturação (Moloni, InvoiceXpress) | API externa |
| 2 | Encomendas automáticas ao atingir stock mínimo | Workflow |
| 3 | Alertas automáticos (SMS, WhatsApp) | Twilio/Z-API |
| 4 | Multi-armazém (central + obra) | Nova entidade |
| 5 | Gestão de fornecedores e histórico de preços | Nova entidade |
| 6 | Rastreabilidade de lotes | Novo campo |
| 7 | Testes automatizados | ✅ Entregue (Vitest, PGlite, Deno, carga) — ver `docs/08-testes.md` |
