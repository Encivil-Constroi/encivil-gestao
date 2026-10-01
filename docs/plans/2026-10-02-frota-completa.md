# Plano — Módulo FROTA completo (uma só aba)

> 2026-10-02. Baseado nos prints do FlutterFlow (`_referencia/capturas/.../FROTA` e
> `FROTA_VIATURAS_MAQUINAS`) e no pedido da Direção. Decisões: um item "Frota" no menu com
> separadores Visão geral · Viaturas e máquinas · Entregas · Manutenção · Configuração;
> viaturas e máquinas na mesma lista (horas em vez de km nas máquinas); estado Livre / Em uso / Oficina.

## Já feito (base)
- Migration `20261002000000_frota_completa.sql` + `supabase/tests/frota-completa.test.mjs` (45 testes):
  - `comb_veiculos`: marca, modelo, `estado_operacional` (LIVRE/EM_USO/OFICINA), `obra_atual_id`, última revisão,
    `km_registo` (estado à chegada), `seguro_foto_path`, `ipo_foto_path`; sincronização automática do estado com a atribuição.
  - `veiculo_entregas` + RPC `entregar_viatura` / `devolver_viatura` (combustível, líquidos, pneus, limpeza, inventário de segurança, mapa de danos, devolução ligada à entrega, oficina).
  - `definir_estado_viatura` (Livre ↔ Oficina), `frota_guardar_viatura` (registar/atualizar, matrícula única), `frota_arquivar_viatura`.
  - `editar_manutencao` com histórico antes/depois e recálculo do prazo; última revisão sempre atualizada.
  - `frota_resumo_viaturas` (lista com estado, condutor, obra, seguro, IPO), `frota_linha_tempo(viatura)`, `frota_historico_manutencoes(...)`, `frota_listar_entregas(...)`.
  - Bucket `frota-docs`: `viaturas/<viatura>/<seguro_|ipo_><n>.<ext>` (a viatura pode ainda não existir).
- `src/features/frota/db.ts` — tipos novos; `FrotaLayout` com separadores; rotas `/frota/...` e stubs em `src/features/frota/components/`.

## Rotas
`/frota` (Visão geral) · `/frota/viaturas` · `/frota/entregas` · `/frota/manutencao` · `/frota/configuracao` ·
`/frota/viatura/nova` · `/frota/viatura/:id` (ficha) · `/frota/viatura/:id/editar` · `/frota/entregar?viatura=` ·
`/frota/devolver?viatura=` · `/frota/manutencao/nova?viatura=` · `/frota/manutencao/:id/editar` ·
`/frota/viatura/:id/checklist` · `/frota/viatura/:id/configurar` · `/frota/catalogo` · `/frota/notificacoes`.

## Tarefas paralelas
- **F1 — Visão geral, lista, registo e ficha:** `FrotaDashboardPage`, `ViaturasListaPage`, `ViaturaFormPage` (substitui `src/app/pages/VeiculoFormPage.tsx`), `FichaViaturaPage` (estado inicial vs atual, linha do tempo, documentos com foto), apagar `FrotaPage`.
- **F2 — Entrega e devolução:** `EntregaFormPage`, `EntregasPage`, componente do mapa de danos.
- **F3 — Manutenção e ficha de revisão:** `ManutencaoPage` (lista + histórico), `ManutencaoFormPage` (registar/editar), `FrotaConfigPage`, ficha de revisão (checklist) reorganizada, apagar `RegistarManutencaoPage`.

## Critérios de aceite
- Lista: Todos / Livres / Em uso / Oficina, pesquisa por matrícula/modelo/condutor, filtro por obra, viaturas e máquinas; mostra o colaborador.
- Entrega só de viatura livre (a em uso mostra quem a tem; a na oficina é recusada); obra opcional; condutor da base de colaboradores; data, km/horas, combustível, líquidos, pneus, limpeza, inventário, mapa de danos, observações; devolução com a mesma lógica.
- Registo de viatura com marca/modelo, tipo, matrícula, km/horas, última revisão, seguro e IPO com foto.
- Ficha com estado à chegada vs atual e linha do tempo (entregas, manutenções, abastecimentos, quem fez).
- Manutenção: registar (puxa última revisão e km), tipo da lista ou específico, editar com histórico, histórico filtrável e detalhe por dia com o utilizador.
- Mecânico continua isolado na Frota; typecheck 0, Vitest local + Node 24, build, banco; agent-browser local e Cloudflare.
