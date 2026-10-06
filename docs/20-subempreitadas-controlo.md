# 20 — Controlo de subempreitadas e auto-medição

> Desenho: `docs/superpowers/specs/2026-10-04-controlo-subempreitadas-design.md`. Plano: `docs/plans/2026-10-04-controlo-subempreitadas.md`.
> Migrations: `20261004000000_subs_orcamento_docs_evidencias.sql` (A) e `20261004010000_subs_medicao_workflow_glosas_painel.sql` (B).

## Ordem de publicação
1. Aplicar no SQL Editor do Supabase, por esta ordem: `20261003000000_obras_completo.sql` (se ainda não estiver), A, B.
2. Só depois publicar o frontend (o push para `main` faz deploy).

## Regras para o CEO
1. Não se contrata acima do orçamento de controlo (EAP) por item, com a tolerância definida.
2. Não se mede mais do que o contratado nem do que o subempreiteiro pediu. Os preços do contrato não mudam.
3. O auto segue: Rascunho → Submetido → Verificado → Aprovado → Fatura guardada → Pago. Depois de submetido, só muda pelo fluxo.
4. Verificar exige checklist completo e fotografias válidas: câmara, hora do servidor, GPS dentro do raio da obra, precisão aceitável, sem repetição (hash).
5. Quem cria o auto não o aprova (admin isento). Acima do limite de alçada (10 000 €, configurável) ou com trabalhos a mais, aprova só o admin.
6. Glosas reduzem o certificado (valor medido − glosas). Retenção de garantia (5 % por defeito) calcula-se sobre o certificado.
7. Pagar exige: fatura do subempreiteiro guardada, documentos legais em dia e nenhuma ocorrência grave de qualidade/segurança por resolver. Exceções só do admin, com motivo e registo.
8. A retenção só se liberta até ao valor retido.

## Faturas
O ERP **não emite faturas**. Só guarda a do subempreiteiro (número, data, valor e ficheiro PDF/foto no bucket privado `obras-contratos`). Valor diferente do aprovado = aviso, não bloqueia. Valores sem IVA.

## Documentos (Portugal)
Certidão da Segurança Social, certidão das Finanças (AT), seguro de acidentes de trabalho, alvará/título IMPIC (obrigatórios por defeito) e seguro de responsabilidade civil. Configuração (admin): prazos, alçada, retenção, raio e precisão do GPS.

## Fica de fora
- Portal próprio do subempreiteiro (não há login externo; a equipa regista o pedido em nome dele).
- Deteção de GPS falso: o browser não permite. Mitigado por câmara obrigatória, raio, precisão, hora do servidor e hash anti-reutilização.
- Emissão de faturas e SAF-T.

## Painel do CEO
`/obras/subempreitadas` (todas as obras) e aba Subempreitadas da ficha (por obra): contratado, certificado, pago, por pagar, retenção, em aprovação, glosado e taxa de glosa; desvio físico-financeiro; passivo documental; fluxo de caixa de 12 semanas; alertas.

## Testes
`supabase/tests/subs-controlo-a.test.mjs`, `subs-controlo-b.test.mjs` (Postgres em memória) e `src/__tests__/features/obras/`.
