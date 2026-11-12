# 17 — Módulo Armazém

> 2026-10-01. Um só item "Armazém" no menu (`/armazem`). Migration
> `20261001000000_armazem_completo.sql`. Plano: `docs/plans/2026-10-01-armazem-completo.md`.

## Separadores

| Separador | Para quê |
|---|---|
| **Visão geral** | Valor em stock, artigos em falta, ferramentas emprestadas e em atraso, garantias a terminar, últimos movimentos |
| **Inventário** | Artigos com foto, stock e estado (ok / baixo / sem stock); entrada e saída rápidas em cada artigo |
| **Movimentos** | Histórico de entradas e saídas com o tipo, obra, fornecedor/cliente e n.º de fatura; Excel |
| **Ferramentas** | Estado bem visível (disponível / emprestada / em atraso / manutenção), n.º de série, garantia |
| **Obras** | O que está em cada obra em execução: materiais (enviado − devolvido, com valor) e ferramentas emprestadas |

No topo: **Entrada** e **Saída** (admin, gestor, armazém).

## Entradas e saídas

| Tipo | Pede | Efeito |
|---|---|---|
| Compra a fornecedor | fornecedor (ou ENCIVIL), preço opcional, n.º fatura | +stock; o preço passa a ser o custo do artigo |
| Devolução de obra | a obra | +stock; desconta no custo de materiais da obra |
| Stock próprio ENCIVIL | — | +stock |
| Acerto | — | +stock |
| Contagem de inventário | stock contado | fixa o stock (a RPC aceita todos os papéis com escrita em armazém, incluindo `armazem`; decisão de negócio A3-10 por confirmar) |
| Para obra | obra **em execução** | −stock; conta no custo da obra |
| Venda comercial | cliente, preço de venda opcional, n.º fatura | −stock; não conta como custo de obra |
| Quebra / perda | — | −stock |

Nunca deixa o stock abaixo de zero. Tudo atómico numa RPC
(`registar_movimento_armazem`), com o mesmo bloqueio e histórico de sempre.

## Ferramentas

- N.º de série único (ignora maiúsculas e espaços), marca, modelo, foto.
- Se for **nova**: data de compra e **garantia do fabricante**, com alerta quando
  termina em 30 dias ou menos, e quando já terminou.
- **Empréstimo:** só ferramentas disponíveis; uma em uso mostra quem a tem e desde
  quando, e o servidor recusa. **Foto do estado obrigatória** na entrega (só câmara).
- **Devolução:** foto obrigatória do estado em que voltou (exceto "perdida");
  danificada → manutenção; perdida → inativa. O histórico mostra as duas fotos lado a lado.

## Fotos

Bucket `armazem` (público, 10 MB, só imagens). Artigos: câmara, ficheiro ou
**colar (Ctrl+V)** uma imagem copiada da internet — fica guardada no nosso
storage. Prova de estado das ferramentas: só câmara.

## Endereços antigos

`/produtos`, `/produtos/:id`, `/novo-movimento`, `/historico`, `/ferramentas…`
redirecionam para o sítio novo.

## Publicação

1. SQL Editor: `supabase/migrations/20261001000000_armazem_completo.sql`.
2. Site: push para `main`. (Sem Edge Functions novas.)

**Atenção à ordem:** com a migration aplicada e o site ainda antigo, os empréstimos
e devoluções falham (a foto passou a ser obrigatória). Aplicar a migration e fazer
o push seguidos.

## Estado atual (2026-11-12)

**Rotas** (`src/app/routes.tsx`): `/armazem` (Visão geral), `/armazem/inventario`, `/armazem/movimentos`,
`/armazem/ferramentas`, `/armazem/obras`; formulários em `/armazem/produto/novo|:id|:id/editar`,
`/armazem/movimento/entrada|saida`, `/armazem/ferramenta/nova|emprestimo|:id|:id/editar|:id/devolucao`.
O Início (`/`) tem um painel pessoal do armazém com atalhos de saída e entrada.

**Quem escreve:** `pode_escrever('armazem')` e `pode_escrever('ferramentas')` = admin, gestor, armazém
(definição vigente em `20260929030000_fase9_frota.sql`; espelho `MATRIZ_ESCRITA`). Leitura (por confirmar por papel): ver `docs/05-seguranca-e-acesso.md`.
A RLS é a segurança real.

**RPCs principais:** `registar_movimento_armazem` (com `p_client_id`: reenvio da fila offline não duplica),
`criar_produto(jsonb)` (stock inicial entra como movimento de entrada), `armazem_materiais_por_obra`,
`custos_materiais_por_obra`, `produtos_em_alerta`. Tabelas: `produtos`, `movimentos_stock`, ferramentas e empréstimos.

**Regras reforçadas** (migrations `20261020110000` e `20261028120500`):
- `movimentos_stock`: sem UPDATE, DELETE nem TRUNCATE para a API; um só INSERT por movimento.
- `stock_atual` e `codigo` não se gravam por INSERT/UPDATE direto em `produtos`; o stock só muda por movimentos.
- A unidade do artigo fica bloqueada depois do primeiro movimento (RN-UNID-02), também no formulário.
- Devolução de obra limitada ao líquido enviado para essa obra; empréstimo de ferramenta: só um ativo por ferramenta, escrita só por RPC.
- Custos de materiais descontam as devoluções (`DEVOLUCAO_OBRA`) e cortam por dia de Lisboa — o mesmo número no P&L,
  dashboard e custos consolidados.
- Índice `movimentos_stock (tipo, created_at DESC)` para as contagens do dashboard.
- Listas e exportações paginadas com `buscarTodas` (`src/app/lib/buscarTodas.ts`): sem corte silencioso nas 1000 linhas.
- Faturas de fornecedor lançadas geram os movimentos de entrada do armazém, ligados à linha (`movimento_id`) e imutáveis (ver `docs/12-plano-v3.md`).
