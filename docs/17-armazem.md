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
| Contagem de inventário | stock contado | fixa o stock (admin/gestor) |
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
