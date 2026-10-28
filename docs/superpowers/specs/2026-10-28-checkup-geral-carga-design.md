# Checkup geral (segurança + bugs) e testes de carga — Design

Data: 2026-10-28 · Estado: aprovado pelo utilizador ("execute tudo, avance")

## Intenção
O ENCIVIL Gestão está em produção e é usado todos os dias em obra. O utilizador quer
confiança total: nenhum furo de segurança conhecido, nenhum bug conhecido nos fluxos
que mexem com dinheiro, stock e pessoas, e evidência de que o sistema aguenta desde
poucos até muitos utilizadores em simultâneo.

## Objetivos
1. **Auditoria de segurança completa** com correções e testes que falham sem elas:
   - RLS de todas as tabelas/views (incluindo `security_invoker` de views), GRANTs
     (anon vs authenticated), funções `SECURITY DEFINER` (guardas de papel,
     `search_path`), Storage (buckets/policies), Edge Functions (auth, CORS, validação
     de entrada, segredos), CSP em `public/_headers`, espelho `MATRIZ_ESCRITA` × SQL,
     rotas sem `RoleGuard`, XSS (`dangerouslySetInnerHTML`, URLs vindas de dados),
     dependências npm com vulnerabilidades conhecidas (`npm audit`).
2. **Caça a bugs** módulo a módulo, prioridade pelo risco de negócio:
   1. Stock/movimentos/ferramentas/inventário (dinheiro e material)
   2. Faturas, autos, subempreitadas, custos, contabilidade (dinheiro)
   3. Abastecimento/bomba, frota (dinheiro + operação física)
   4. Picagens/colaboradores/EPIs/horários (pessoas, dados pessoais — NIF)
   5. Obras/livro de obra/relatórios, dashboard, alertas, notificações, PWA/offline
   Bug = comportamento que contradiz as regras de negócio (`docs/02`), os docs do
   módulo, ou que parte (exceção, dados errados, estado inconsistente, UI encravada).
3. **Testes de carga e concorrência** em três níveis, com relatório numérico
   (p50/p95/p99, taxa de erro, throughput, integridade dos dados no fim):
   - Leve: 10 utilizadores virtuais (escritório, dia normal)
   - Médio: 50 VUs (início de turno 7h30: picagens + saídas de material + pedidos
     de abastecimento + consultas)
   - Pesado: 200 → 500 VUs (fecho de mês: autos, faturas, relatórios e exportações
     em paralelo) até encontrar o ponto de rutura.
   - Concorrência crítica: N saídas simultâneas do mesmo artigo (stock nunca
     negativo, soma exata), numeração sem colisão (autos via `criar_auto_rpc`,
     códigos de produto/ferramenta/viatura/colaborador por sequência), picagens
     duplicadas, aprovação dupla de abastecimento, empréstimo duplo de ferramenta.
4. **Validação do frontend** com `agent-browser` contra o ambiente local, percorrendo
   os fluxos principais com uma conta por papel.

## Não-objetivos
- Funcionalidades novas, ecrãs novos, redesenho visual.
- Refactors grandes sem bug ou risco concreto por trás.
- Otimização prematura: só se otimiza o que a carga mostrar como gargalo real.

## Anti-objetivos (falhar mesmo que "funcione")
- Correr carga, criar utilizadores ou alterar dados **em produção**.
- Retirar acesso legítimo a quem o tem hoje (cada guarda espelha a regra existente).
- Quebrar o site em produção entre a publicação do site e a aplicação das migrations
  (site novo funciona com a BD antiga).
- Aplicar migrations em produção (é o utilizador, no SQL Editor).
- Push para `main` sem pedido explícito; nada é publicado sem o utilizador mandar.

## Restrições
- Todas as regras de `CLAUDE.md` (GRANT/RLS, `-- ROLLBACK`, idempotência, pt-PT na UI,
  `useAsync`/`useMutation`, sem `as any`, sem dependências novas entre módulos).
- Cada correção de regra/RLS traz teste de BD (PGlite) que falha sem a correção.
- Tudo fecha com `npm run typecheck` 0 erros, `npm test` verde, `npm run build`,
  `npm run check:edge && npm run test:edge`.

## Decisões tomadas (chamadas minhas, o utilizador delegou)
- **Ambiente de carga:** Supabase local via Docker (`npx supabase start`), com todas
  as migrations aplicadas, dados sintéticos realistas (≈ 15 obras, 300 colaboradores,
  2 000 artigos, 50 000 movimentos, 40 viaturas) e utilizadores de teste por papel
  criados pelo script de seed. Nunca produção.
- **Ferramenta de carga:** script Node próprio em `scripts/carga/` usando
  `@supabase/supabase-js` (já dependência) com VUs concorrentes e medição de
  latências — sem instalar k6/binários novos. A carga exercita o PostgREST/Auth/RPC
  locais tal como o browser faria (mesmas queries dos services).
- **Frontend no teste:** `npm run dev` com `VITE_SUPABASE_URL`/`KEY` apontados para o
  Supabase local por variáveis de ambiente do processo (sem alterar `.env.local`).
- **Organização:** trabalho num branch `checkup/2026-10-28`; auditoria em paralelo
  por domínio (subagentes), correções sequenciais por ordem de risco; relatório final
  em `docs/auditorias/2026-10-28-checkup-geral.md`.
- **O que os números de carga provam:** correção sob concorrência (integridade) e
  gargalos relativos no código/SQL (queries lentas, N+1, falta de índices, locks).
  Não provam a capacidade absoluta da produção: o local corre num portátil e não
  replica o tier do Supabase nem o Cloudflare. O relatório diz isto claramente e
  dá a estimativa de margem (consumo de ligações/CPU por VU) com essa ressalva.
  Não se cria staging.
- **Acesso mais largo do que os docs dizem:** é furo e corrige-se quando expõe
  dados pessoais (NIF, contactos, salários) ou permite escrita/aprovação fora do
  papel previsto em `pode_escrever`/RLS documentada. Leitura de dados operacionais
  não sensíveis mais larga do que o doc → só registo no relatório.
- **Dependências externas** (bomba/JEV, Shelly, IA de faturas/talões, Web Push,
  email, `pg_net`/`pg_cron`): o ambiente local não recebe segredos de produção;
  Edge Functions testam-se pelos testes Deno existentes e por pedidos sem segredos
  (devem falhar de forma controlada). Na carga, chamadas externas ficam de fora;
  os fluxos de abastecimento testam-se até à BD (estados e transições).
- **Entrega:** um branch, commits separados por domínio e severidade (segurança
  crítica primeiro), cada um verde por si. Merge/push para `main` (= deploy) e
  aplicação de migrations ficam como passo final explícito para o utilizador,
  com ordem descrita no relatório.
- **`npm audit`:** só correções sem versão major. Uma major só entra se a
  vulnerabilidade for Alta/Crítica **e** explorável no uso real do app; senão fica
  registada.
- **Severidade:** Crítica (fuga de dados/escrita indevida/stock errado) → corrigida
  sempre; Alta → corrigida; Média → corrigida se o risco de regressão for baixo;
  Baixa → registada no relatório.

## Deixado ao construtor
Escolha exata dos cenários de carga por fluxo, volumes do seed, formato do relatório,
ordem fina das correções dentro de cada prioridade.

## Entregáveis
1. Branch com as correções + testes novos, tudo verde.
2. Migrations novas (se houver) com ordem de aplicação.
3. `scripts/carga/` (seed + cenários + runner) reprodutível.
4. Relatório `docs/auditorias/2026-10-28-checkup-geral.md`: achados por severidade,
   correções, resultados de carga, riscos remanescentes, passos manuais.
