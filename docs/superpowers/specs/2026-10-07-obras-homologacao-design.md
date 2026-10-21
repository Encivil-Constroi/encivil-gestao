# Obras — fechamento de produção e homologação

## Objetivo e entendimento

O usuário exige Obras operacional para engenheira e engenheiro, com abertura, aferições, fotografias e relatórios consistentes. Informou que aplicou todas as migrations anteriores e autorizou planejamento e execução automáticos, com subagentes e navegador. Esta rodada parte do merge 5ba4e4d; não repete tarefas concluídas no snapshot anterior.

Critérios concretos: gates da versão integrada aprovados; operações reais Auth/PostgREST/Storage em Supabase local com papéis de engenharia; leitura do frontend Cloudflare; negação de ações indevidas; ausência de perda de edição/upload; ausência de linhas de auto alteradas após submissão concorrente. Produção não recebe registros fictícios nem alteração de papel para testes.

## Alternativas e decisão

1. Repetir apenas mocks/PGlite: rápido, mas deixa a API Storage e autenticação sem aferição real.
2. Usar Supabase local completo mais leitura Cloudflare: escolhido, cobre gravações e permissões reais sem modificar registros da empresa.
3. Criar registros na empresa usando a conta admin: descartado; não valida engenharia e altera dados reais.

Mantém-se React/hooks/serviços, contratos RPC e Supabase como fonte de verdade. Correções são pequenas e isoladas, sem reescrita ou novos módulos ERP. Auth só muda no necessário para impedir perfil/cache de outra identidade. Relatórios conservam autor/imutabilidade e autos preservam fluxo e totais.

## Falhas desta rodada

- Trigger de linhas lê workflow sem lock: uma sessão muda quantidade enquanto outra submete o pai. Reprodução real deixou workflow submetido, valor_periodo 100 e soma_linhas 9990.
- Respostas de perfil anteriores e limpeza parcial de cache exigem proteção de identidade na autenticação integrada.
- Bypass de navegação de relatório não pode sobreviver a reabertura/edição seguinte.
- Gestor/admin designado com MFA pendente não pode recuperar escrita por ser tratado como leitura: `pode_relatar_obra` também deve negar `mfa_em_falta()`, preservando leitura real designada.
- Validação anterior precisa ser completada com API real de arquivos, autenticação por papel e frontend da versão integrada.
- `client.ts` só aceita URL hospedada e ignora loopback do desenvolvimento: aceitar localhost/127.0.0.1 somente em DEV e selecionar URL/chave como par, sem misturar chave local e URL de produção. Antes de gravações, confirmar URL efetiva no navegador.

## Banco, segurança e dados

Migrations já aplicadas são imutáveis. Uma migration nova, após 20261008070000, serializa linhas com o lock do auto pai antes de verificar workflow, incluindo troca de auto_id com ordem estável e respeito às regras de cascata existentes. Idempotente, transacional, search_path fixo, permissões mínimas e rollback comentado. Não elimina dados, não remove RLS, não concede novo bypass.

Testes funcionais locais usam tokens dos usuários e RLS. Credencial administrativa local só provisiona usuários fictícios; não realiza as operações de domínio em seu lugar. Não gravar tokens/senhas de produção em arquivos/logs. Datas Europe/Lisbon; mensagens pt-PT.

## Concorrência, integrações e observabilidade

Serializar UPDATE/DELETE/INSERT de linhas com submissão nas duas ordens em sessões READ COMMITTED. Invalidar respostas de perfil/cache por versão de identidade, inclusive logout offline e componente montado. Restringir bypass de navegação à transição pretendida. Em Storage verificar bytes depois de DELETE/upsert/move recusados, não apenas status SQL. Não existe automação física neste escopo.

Manter Sentry, eventos e auditoria SQL existentes; registrar apenas contagens/status/IDs fictícios nos artefatos. Monitorar timeouts de setup sem aumentar limites para esconder falhas.

## Liberação e limites

O trabalho inclui código e validação. CLAUDE.md proíbe aplicação de migrations em produção pelo agente e commit/push sem pedido específico; preparar mudança e evidência concretas. A informação de que migrations anteriores foram aplicadas não autoriza editar seus arquivos nem comprova aplicação de uma migration criada nesta rodada. Não declarar uma versão publicada corrigida com base no frontend local.

Rollback lógico: sem perda de dados, preferir correção progressiva; documentar rollback da guarda nova e risco de reabrir a corrida, não executá-lo. Critério de fechamento: nenhuma falha importante conhecida fica escondida e cada fluxo crítico tem evidência verificável na versão entregue.
