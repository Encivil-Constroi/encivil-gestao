# TASKS.md — Histórico e Redirecionamento

> **Este ficheiro está obsoleto.** Descrevia o backlog de implementação inicial (TASK-001 a TASK-011), todo concluído. O backlog ativo de melhorias incrementais vive em `TASKS/` (com subpastas `SEGURANÇA/`, `UX/`, `PERFORMANCE/`, cada uma com `backlog/` e `done/`).

## O que aconteceu às tarefas originais

Todas as TASK-001 a TASK-011 (integração Supabase, RLS, Auth, CRUD produtos, movimentos, histórico, dashboard, relatórios, configurações, detalhe de produto) estão **concluídas e em produção**. Ver `docs/10-roadmap.md` para o estado atual por funcionalidade.

Dos itens P2 listados originalmente:

| Tarefa original | Estado |
|---|---|
| TASK-020 Exportação Excel | Ainda pendente — `docs/10-roadmap.md` Fase 2 |
| TASK-021 Exportação PDF | Ainda pendente — `docs/10-roadmap.md` Fase 2 |
| TASK-022 Multiutilizador (admin/operador/visualizador) | **Concluído** — implementado como admin/gestor |
| TASK-023 Leitura de código de barras | Ainda pendente — Fase 2 |
| TASK-024 Importação CSV | Ainda pendente — Fase 2 |
| TASK-025 Obras como entidades | Ainda pendente — Fase 2 |
| TASK-026 Notificações por e-mail | Ainda pendente — Fase 2 |
| TASK-027 PWA com suporte offline | **Concluído** — instalável em iOS/Android |
| TASK-028 Integração com faturação | Ainda pendente — Fase 3 |

## Onde encontrar o backlog ativo

```
TASKS/
├── README.md              ← Convenções do sistema de tasks
├── SEGURANÇA/
│   ├── backlog/           ← Pendente
│   └── done/               ← 7 tarefas concluídas (RoleGuard, RLS, RPCs, audit log, headers...)
├── UX/
│   ├── backlog/           ← 1 pendente (focus trap em modais — diferido conscientemente)
│   └── done/               ← 6 tarefas concluídas
└── PERFORMANCE/
    ├── backlog/           ← 1 pendente (RPC única dashboard — diferido conscientemente)
    └── done/               ← 5 tarefas concluídas
```

Cada ficheiro de tarefa segue o padrão `P{0-3}-{PRIORIDADE}_{descrição}.md` e documenta problema, solução e critérios de aceitação. Tarefas em `backlog/` que foram conscientemente diferidas incluem justificação explícita de ROI/contexto.
