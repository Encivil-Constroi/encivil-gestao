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

Seguir a ordem vigente do `CLAUDE.md`: site → migrations → Edge Functions, com compatibilidade do site com o banco anterior durante a transição. Aplicar `supabase/migrations/20261003000000_obras_completo.sql` e as posteriores ainda pendentes, em ordem cronológica, no projeto Supabase correto; confirmar RPCs, políticas RLS, GRANTs e buckets antes da liberação operacional. O push para `main` desencadeia deploy automático na Cloudflare Pages. A publicação do site, isoladamente, não comprova a ativação das guardas SQL nem a homologação dos fluxos de escrita.

## Verificação

Executar `npm run typecheck`, `npm test`, `npm run build`, `npm run check:edge`, `npm run test:edge` e os testes de banco em `supabase/tests/obras-completo.test.mjs`. Verificar no browser com os papéis aplicáveis e uma obra de teste depois da publicação.

## Auditoria de produção — 07/10/2026

Relatório e limites de homologação: `docs/auditorias/2026-10-07-obras.md`. Migration aditiva: `20261007110000_obras_producao.sql`, após as migrations anteriores. Executar primeiro as consultas de preflight de arquivos faltantes no início do ficheiro; não apagar dados para corrigir inconsistências.

`obra_visao` devolve um composto único (objeto JSON), não uma lista. A tipagem local/serviço foi corrigida mantendo a assinatura SQL. Uploads pendentes bloqueiam conclusão de aferições/fotos/relatórios; edição e saída durante submissão são protegidas. Autores designados seguem as permissões do servidor, e caches são atualizados após mutações e descartados ao trocar de sessão.

Autoria de auto novo passa a ser atribuída pelo servidor. Evidências, documentos, faturas e fotos gerais novas precisam de objeto no bucket correto; arquivos vinculados não podem ser alterados/apagados. Registros antigos continuam legíveis e editáveis pelas regras existentes, mas nova submissão/verificação/aprovação/pagamento revalida os arquivos. GPS/hash enviados pelo browser não comprovam captura física; a API real de Storage e os fluxos por papel devem ser homologados antes da liberação operacional.

## Controlo de subempreitadas
Orçamento (EAP), auto-medição com verificação, evidências com GPS, glosas, alçadas, documentos e painel do CEO: ver `docs/20-subempreitadas-controlo.md`. Migrations A e B depois da `20261003000000`.
