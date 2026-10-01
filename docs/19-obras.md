# 19 — Módulo Obras

> Desenho funcional e contrato SQL: `docs/superpowers/specs/2026-10-03-obras-completo-design.md`. Plano de implementação: `docs/plans/2026-10-03-obras-completo.md`. Migration: `supabase/migrations/20261003000000_obras_completo.sql`.

## Navegação

O menu tem um único item **Obras** (`/obras`), com separadores **Painel**, **Obras**, **Relatórios diários** e **Subempreitadas**. O painel reúne as obras e os indicadores de progresso, prazo, custos, recursos e ocorrências. A ficha de cada obra (`/obras/:id`) reúne Resumo, Progresso, Equipa, Frota, Ferramentas, Materiais, Subempreitadas, Relatórios, Fotos e Atividade. Os endereços antigos de subempreiteiros e autos redirecionam para os novos endereços em `/obras`.

Os serviços e hooks herdados de contratos, autos, pagamentos e retenções residem em `src/features/obras/legacy/`. Os caminhos antigos de `features/autos` e `features/subempreiteiros` reexportam esta lógica para manter as importações existentes sem duplicar regras de negócio.

## Regras principais

- A obra pode estar planeada, ativa, suspensa ou concluída. O progresso privilegia as fases ponderadas, depois a última aferição com percentagem e, por último, as subempreitadas. O painel mostra progresso esperado e saúde da obra segundo prazo, desvio, ocorrências e custo.
- Admin e gestor gerem a obra, equipa e autores designados. Admin, gestor e medições registam aferições e ocorrências. Os autores designados também podem registar relatórios diários e fotos da obra, conforme as políticas da base de dados. Só admin pode reabrir um relatório submetido, com motivo.
- O relatório diário pode ser guardado como rascunho. Para submeter exige clima, trabalhos, presença da equipa e, se houver ocorrências, descrição e fotografia. Depois de submetido, fica imutável até ser reaberto.
- A ficha cruza a obra com entregas de Frota, empréstimos de Ferramentas, movimentos do Armazém e picagens da Equipa por funções SQL de leitura. Não altera diretamente o stock nem o histórico de movimentos.
- Fotos ficam no bucket `obras`; contratos de subempreitadas ficam no bucket privado `obras-contratos`, consultados por URL assinada. O mapa usa Google Maps sem chave: coordenadas, link longo ou localização GPS, com pré-visualização e navegação.

## Publicação

Aplicar primeiro `supabase/migrations/20261003000000_obras_completo.sql` no projeto Supabase correto e confirmar as RPCs, políticas RLS, GRANTs e buckets. Só depois publicar o frontend: as novas páginas chamam as funções da migration. O push para `main` desencadeia deploy automático na Cloudflare Pages, pelo que não se deve fazer antes de confirmar a migration.

## Verificação

Executar `npm run typecheck`, `npm test`, `npm run build`, `npm run check:edge`, `npm run test:edge` e os testes de banco em `supabase/tests/obras-completo.test.mjs`. Verificar no browser com os papéis aplicáveis e uma obra de teste depois da publicação.
