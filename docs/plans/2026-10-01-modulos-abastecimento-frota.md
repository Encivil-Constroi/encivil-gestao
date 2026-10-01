# Plano — Organização por módulos: ABASTECIMENTO e FROTA

> 2026-10-01. Decisões do utilizador: 1 item "Abastecimento" no menu com separadores;
> registo manual sai do dia a dia (só admin corrige/lança); viaturas passam para a
> Frota, com o QR na ficha da viatura; contingência da bomba fica para depois.
> Sem migrations, sem mudanças em Edge Functions (os links antigos redirecionam).

## Objetivo

| Módulo | Contém |
|---|---|
| **Abastecimento** `/abastecimento` | Pedidos (início) · Histórico · Análise · Bomba Polo 2 · Configuração; botão "Pedir combustível" no topo; ecrãs `/abastecimento/pedir` e `/abastecimento/pedido/:id` |
| **Frota** `/frota` | Cadastro de viaturas e máquinas (nova/editar/arquivar), QR por viatura, manutenção, checklists, prazos; ligação "Ver consumo" → Análise filtrada pela viatura |

Separadores por papel: motorista só Pedidos (os seus, sem barra de separadores);
quem aprova: Pedidos, Histórico, Análise, Bomba; gestor/armazém/leitura: Pedidos,
Histórico, Análise (+ Bomba se `podeCombustivel`); admin: todos + Configuração.

## Rotas

Novas: `/abastecimento` (layout + index Pedidos), `/abastecimento/historico`,
`/abastecimento/analise`, `/abastecimento/bomba`, `/abastecimento/configuracao` (admin),
`/abastecimento/pedir`, `/abastecimento/pedido/:id`,
`/abastecimento/registo/novo` e `/abastecimento/registo/:id` (admin — `AbastecimentoFormPage`),
`/frota/viatura/nova` e `/frota/viatura/:id/editar` (`VeiculoFormPage`).

Redirecionam (mantêm `?query` e o `:id`; push antigas, QR impressos e favoritos continuam a funcionar):
`/abastecer` → `/abastecimento/pedir` · `/abastecer/pedidos` → `/abastecimento` ·
`/abastecer/pedido/:id` → `/abastecimento/pedido/:id` · `/combustivel` → `/abastecimento` ·
`/combustivel/relatorio` → `/abastecimento/analise` · `/combustivel/configuracao` → `/abastecimento/configuracao` ·
`/combustivel/abastecimento*` → `/abastecimento/historico` · `/combustivel/veiculo` → `/frota/viatura/nova` ·
`/combustivel/veiculo/:id/editar` → `/frota/viatura/:id/editar` · `/pub/combustivel?v=` → `/abastecimento/pedir?v=`.

## Tarefas

**T0 — Esqueleto (eu, sequencial):** routes.tsx, redirects, `AbastecimentoLayout`
(cabeçalho + separadores NavLink + Outlet), Sidebar (1 item "Abastecimento" com
contador; motorista: "Pedir combustível" + "Os meus pedidos"; sai "Relatório
combustível"), MobileBottomNav e MainLayout (motorista isolado em `/abastecimento`),
links internos, SW e notificações.

**T1 — Agente Abastecimento (paralelo):** separador Histórico (lista por dia, mês,
viatura, Excel — extraída da antiga `CombustivelPage`; clique: registo com pedido →
`/abastecimento/pedido/:id`; sem pedido → admin abre `/abastecimento/registo/:id`;
admin vê "Lançar registo manual" discreto); Análise embutida (sem cabeçalho próprio,
lê `?viatura=`); Bomba e Configuração embutidas; `AbastecimentoFormPage` admin-only
e a voltar para o Histórico; apagar `CombustivelPage` e `PedidosPage`; Dashboard
"Pedir combustível"; testes.

**T2 — Agente Frota (paralelo):** `FrotaPage` com "Nova viatura" (`podeCombustivel`,
é a RLS de `comb_veiculos`); `FichaViaturaPage` com "Editar", "Imprimir QR"
(`/pub/imprimir-qr?v=&vn=&vc=`) e "Ver consumo" (`/abastecimento/analise?viatura=`);
`VeiculoFormPage` volta para `/frota` ou para a ficha; testes.

**T3 — Integração e validação (eu):** typecheck 0; Vitest local + Node 24; build;
check/test Deno; agent-browser no site local (cada papel: menu, separadores,
redirects, viatura nova → ficha → QR); docs (README, CLAUDE.md, doc 15); commit + push;
confirmar produção.

## Critérios de aceite

- Menu: nenhum item duplicado de combustível; "Abastecimento" e "Frota" únicos.
- Nenhum botão "Novo abastecimento" fora do admin.
- Todos os URLs antigos levam ao sítio certo, com o pedido/viatura preservados.
- Motorista continua isolado (só pedir e os seus pedidos).
- Mecânico continua só na Frota (sem botões de editar viatura).
- Suíte toda verde; build e arranque sem regressão de peso.
