# Plano — Módulo ARMAZÉM completo

> 2026-10-01. Decisões: um item "Armazém" no menu com separadores Visão geral ·
> Inventário · Movimentos · Ferramentas · Obras; fotos por câmara/ficheiro/colar
> (Ctrl+V), guardadas no bucket `armazem`; venda comercial com cliente, preço e
> n.º de fatura.

## Já feito (base)

- Migration `20261001000000_armazem_completo.sql` + `supabase/tests/armazem.test.mjs` (25 testes):
  `produtos.foto_path/localizacao`; `movimentos_stock.subtipo/fornecedor/numero_fatura/cliente/preco_unitario`;
  RPC `registar_movimento_armazem(p_produto_id, p_subtipo, p_quantidade, p_responsavel, p_obra_id, p_fornecedor,
  p_numero_fatura, p_cliente, p_preco_unitario, p_observacoes)`; RPC `armazem_materiais_por_obra(p_obra_id)`;
  `ferramentas.foto_path/marca/modelo/nova/data_compra/garantia_ate` (+ n.º de série único);
  empréstimo/devolução com `p_foto_entrega_path` / `p_foto_devolucao_path` **obrigatórias** (exceto devolução "perdida");
  bucket `armazem` (caminhos `produtos/<id>/<n>.<ext>`, `ferramentas/<id>/<entrega_|devolucao_|><n>.<ext>`).
  Subtipos: entrada `COMPRA` (fornecedor obrigatório, "ENCIVIL" para próprio), `DEVOLUCAO_OBRA` (obra), `PROPRIO_ENCIVIL`,
  `ACERTO`; saída `OBRA` (obra ativa), `VENDA` (cliente), `QUEBRA`; ajuste `INVENTARIO` (stock contado > 0).
- `src/app/lib/armazemDb.ts` — cliente tipado com as colunas/RPCs novas (usar `armazemDb` em vez de `supabase` onde forem precisas).
- `src/app/lib/fotosArmazem.ts` + `src/app/components/FotoInput.tsx` — envio de foto (câmara, ficheiro, Ctrl+V; `soCamera` para prova de estado).
- Rotas `/armazem/...` (+ redirecionamentos dos endereços antigos), `ArmazemLayout` (separadores + botões Entrada/Saída),
  stubs em `src/app/pages/armazem/*`, menu e navegação móvel.

## Tarefas paralelas

- **A — Inventário e produtos:** `InventarioPage`, `ProdutoFormPage` (página inteira — corrige o modal cortado), `ProdutoDetalhePage`.
- **B — Movimentos, obras e visão geral:** `MovimentoFormPage` (entrada/saída), `MovimentosPage`, `ObrasArmazemPage`, `VisaoGeralPage`.
- **C — Ferramentas:** `FerramentasPage`, `FerramentaFormPage`, `FerramentaDetalhePage`, `EmprestimoPage`, `DevolucaoPage`.

## Critérios de aceite

- Um só item "Armazém" no menu; tudo dentro dele; endereços antigos redirecionam.
- Entrada: tipo, artigo, stock atual visível, obra de origem (devolução), quantidade, fornecedor ou ENCIVIL, n.º fatura, observações.
- Saída: obra (em execução) ou venda (cliente, preço), quantidade, n.º fatura, observações; nunca abaixo de 0.
- Inventário visual com fotos e entrada/saída rápida em cada artigo.
- Ferramentas: n.º de série, marca/modelo, nova + garantia com alerta (≤ 30 dias / expirada); foto na entrega e na devolução;
  impossível emprestar em uso (mostra quem a tem); estados bem visíveis.
- Obras: o que está em cada obra em execução (materiais líquidos com valor + ferramentas emprestadas para a obra).
- Typecheck 0, Vitest local + Node 24, build, testes de banco; agent-browser local e Cloudflare.
