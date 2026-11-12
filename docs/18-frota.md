# 18 — Módulo Frota

> 2026-10-02. Um só item "Frota" no menu (`/frota`). Migration
> `20261002000000_frota_completa.sql`. Plano: `docs/plans/2026-10-02-frota-completa.md`.
> Viaturas **e máquinas** (horas em vez de km) no mesmo módulo.

## Separadores

| Separador | Para quê |
|---|---|
| **Visão geral** | Total · Livres · Em uso · Oficina (clicáveis), alertas, "quem tem o quê", últimas entregas e manutenções |
| **Viaturas e máquinas** | Lista com matrícula, modelo, **estado**, **colaborador alocado**, obra, leitura e pastilhas de revisão/seguro/IPO; filtros Todos / Livres / Em uso / Oficina, Viaturas / Máquinas, obra e pesquisa |
| **Entregas** | Entregar e devolver viaturas; histórico com detalhe e comparação entrega × devolução |
| **Manutenção** | Em oficina e a vencer · Histórico rigoroso de toda a frota · Ficha de revisão (checklist) |
| **Configuração** | Ficha-modelo da revisão (itens e intervalos) e notificações (admin) |

## Estado de cada viatura

**Livre → Em uso** (entrega) **→ Livre** (devolução) e **Livre ↔ Oficina**. Uma viatura
em uso não vai para a oficina nem se arquiva; uma na oficina não se entrega; uma em uso
mostra quem a tem. O estado acompanha sozinho a atribuição do condutor.

## Entrega e devolução

Condutor (da base de colaboradores), obra (opcional, só obras em execução), data,
km ou horas (nunca abaixo do último registado), combustível (Reserva · ¼ · ½ · ¾ · Cheio),
AdBlue, óleo, líquido de refrigeração, pneus, limpeza, inventário de segurança
(colete, triângulo, documentos/seguro, macaco e chave de rodas), **mapa de danos** em 5
vistas (toque para marcar), observações. A devolução segue a mesma lógica, mostra a
entrega ao lado, separa os danos novos e permite enviar a viatura direto para a oficina.

## Registo e ficha da viatura

Marca, modelo, tipo, matrícula (única), km/horas atuais (estado à chegada), última
revisão (data e leitura), **seguro e IPO com data e foto** (consulta rápida, ecrã inteiro,
para mostrar à GNR). A ficha compara o estado à chegada com o atual e tem a **linha do
tempo desde o registo**: entregas, devoluções, manutenções (e correções), checklists e
abastecimentos, com quem fez cada um.

## Manutenção (gerida pelo mecânico chefe)

Registar: viatura por matrícula (puxa a última revisão e a leitura atual), data, km/horas,
**tipo da lista do catálogo ou "outro"**, custo, oficina, observações. **Editar** corrige
o registo e guarda antes/depois e quem corrigiu. O histórico filtra por viatura, período e
tipo; abre o que foi feito nesse dia, com o utilizador; exporta Excel. Uma revisão
periódica atualiza sozinha a "última revisão" da viatura.

## Permissões

Escrevem na Frota: admin, gestor e mecânico (registar viaturas também o armazém, como antes).
Leitura: todos menos o motorista. O mecânico continua isolado na Frota.

## Notas

- Fotos do seguro/IPO: bucket `frota-docs` (URL público não adivinhável, como as outras fotos).
- Tipos de veículo: viatura, máquina, gerador, outro (a restrição da base de dados
  `ck_veiculo_tipo` não aceita carrinha/camião; acrescentar exige uma migration).
- Endereços antigos redirecionam (`/frota/viatura/:id/manutencao` → registo de manutenção).

## Publicação

1. SQL Editor: `supabase/migrations/20261002000000_frota_completa.sql`.
2. Site: push para `main` (sem Edge Functions novas). **Aplicar a migration antes do push:** a
   lista da frota passa a usar colunas e funções novas.

## Estado atual (2026-11-12)

**Rotas** (`src/app/routes.tsx`): `/frota` (Visão geral), `/frota/viaturas`, `/frota/entregas`, `/frota/manutencao`, `/frota/configuracao`;
`/frota/viatura/nova|:id|:id/editar|:id/configurar|:id/checklist|:id/imprimir`, `/frota/entregar`, `/frota/devolver`,
`/frota/manutencao/nova|:id/editar`, `/frota/catalogo`, `/frota/notificacoes` (só admin, `RoleGuard`).

**Quem escreve:** `pode_escrever('frota')` = admin, gestor, mecânico (`20260929030000_fase9_frota.sql`, vigente; espelho `MATRIZ_ESCRITA`).
O mecânico fica isolado na Frota; o motorista não vê a Frota.

**Edge Function:** `send-push-frota` (push dos alertas da frota só a `frota_alerta_destinatarios`; chamada pelo pg_cron com o cabeçalho `x-frota-secret` (segredo gerado na BD)).

**Relação com o Abastecimento:** viaturas e QR vivem aqui; o consumo abre a Análise filtrada (`docs/15-abastecimento-v2.md`).
A viatura atribuída ao colaborador (conta ligada) pré-preenche o pedido de combustível.

**UI (2026-11):** cabeçalho `PageHeader`, `SeparadoresNav`, chips `FiltroChips` com contagem e datas por extenso (`docs/06-ux-ui.md`).
Prazos de revisão/seguro/IPO calculados em `src/app/lib/prazoFrota.ts`.

**Testes:** `supabase/tests/frota.test.mjs`, `frota-completa.test.mjs`; `src/__tests__/features/frota/`.
