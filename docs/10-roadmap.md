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
| 11 | Deploy Vercel com CI/CD automático | ✅ Produção |
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

## Fase 2 — Produtividade (próximos passos)

| # | Funcionalidade | Prioridade |
|---|---------------|------------|
| 1 | Exportação para Excel (.xlsx) | P1 |
| 2 | Exportação para PDF | P1 |
| 3 | Leitura de código de barras (câmara do telemóvel) | P1 |
| 4 | Importação de produtos em massa (CSV) | P1 |
| 5 | Obras cadastradas como entidades (não texto livre) | P1 |
| 6 | MFA para contas admin | P1 — **bloqueado**: requer Supabase Pro |
| 7 | Anexos e fotos em movimentos | P2 |
| 8 | Notificações de stock baixo por e-mail | P2 |
| 9 | Focus trap em modais (acessibilidade) | P2 — diferido conscientemente, ver `TASKS/UX/backlog/` |
| 10 | Dashboard via RPC única (consolidar 5 queries) | P2 — diferido conscientemente, ROI insuficiente nesta escala |

---

## Fase 3 (v3.0) — ERP Completo — ver `docs/12-plano-v3.md`

Plano faseado de expansão aprovado em 2026-07-30. Decisão arquitectural: manter React PWA + Supabase (ver `docs/adrs/ADR-009.md`).

| Fase | Módulo | Semanas | Estado |
|---|---|---|---|
| F0 | Módulo de Colaboradores | 1–2 | `[CONCLUÍDA]` |
| F1 | Motor de Alertas e Manutenção Preventiva | 3–4 | `[ ]` |
| F2 | Horário de Trabalho, Faltas, Conformidade Laboral | 5–8 | `[ ]` |
| F3 | Picagem de Presenças MVP | 9–10 | `[ ]` |
| F4 | EPIs e Formações | 11–12 | `[ ]` |
| F5 | Picagem com Geofence (PostGIS) | 13–14 | `[ ]` |
| F6 | Ingestão e Classificação de Faturas | 15–18 | `[ ]` |
| F7 | Custeio Consolidado por Obra | 19–20 | `[ ]` |
| F8 | Livro de Obra Digital e Guias de Transporte | 21–22 | `[ ]` |

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
| 7 | Testes automatizados (Vitest) | Ver `docs/08-testes.md` |
