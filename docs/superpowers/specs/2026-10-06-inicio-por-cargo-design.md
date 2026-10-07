# Página inicial por cargo — desenho

Data: 2026-10-06 · Estado: aprovado pelo utilizador (execução autónoma pedida) · Caminho: arquitetural

## Objetivo
`/` deixa de ser o mesmo Dashboard para todos. O **Dashboard executivo** (P&L de obras, stock, movimentos) é só do CEO
(`admin`). Cada outra pessoa abre um **painel pessoal** montado só com o que o seu cargo pode usar. O painel muda sozinho
quando o RH altera as permissões (a aba Recursos Humanos já traduz os interruptores num papel via `promover_role`).

## Fluxo atual (resumo)
- Papel único por conta (`role_utilizador`: admin, gestor, armazem, medicoes, mecanico, motorista, leitura). Os
  interruptores do RH (`permissoes.ts`) só escolhem esse papel; a RLS aplica-o. Sem tabela nova de permissões.
- `routes.tsx` índice → `DashboardPage` para todos. `MainLayout` obriga mecânico a `/frota` e motorista a
  `/abastecimento/pedir` (nunca veem `/`). `Sidebar`/`MobileBottomNav` filtram por papel.
- Viatura atribuída: `veiculo_atribuicoes` (colaborador↔viatura) + RPC existente `meu_contexto_abastecimento()` devolve
  colaborador, viatura atribuída, km atual e pedido em curso. Abastecimentos: `comb_abastecimentos` (leitura aberta a quem
  não é motorista; motorista só os seus).

## Decisões
1. **Sem migration, sem alteração de RLS/RPC.** Tudo reutiliza contratos existentes. A UI é só conforto; a segurança
   continua na RLS (nada novo é exposto, só reorganizado).
2. **`admin` = CEO** → `DashboardPage` inalterado. `gestor` (encarregado) recebe painel pessoal com todas as secções dos
   módulos que gere. (Pressuposto: o CEO é o `admin`; documentado para correção fácil em `ehPainelExecutivo`.)
3. **Painel por secções (registo dinâmico).** Função pura `secoesDoInicio(capacidades)` devolve a lista ordenada de
   secções; o componente só renderiza o que ela devolve. Para mudar quem vê o quê edita-se uma função testada.
4. Secções: `veiculo` (carro atribuído: km, consumo L/100 km, litros e custo do mês, pedido em curso, últimos pedidos),
   `armazem`, `frota`, `combustivel` (pedidos à espera de decisão), `obras`. Cabeçalho de identidade (nome, cargo, obra)
   a partir do colaborador ligado à conta.
   - mecânico → frota (+ veiculo se tiver carro); armazém → armazem + combustivel (+ veiculo); motorista → veiculo + pedir;
     medições → obras; leitura → só consulta (+ veiculo se tiver carro, sem botão de pedir); gestor → todas.
5. **Navegação.** Mecânico e motorista passam a poder abrir `/` (o seu Início); resto do isolamento mantém-se. O item
   "Dashboard" chama-se "Início" para quem não é admin; aparece também nos menus restritos (lateral e móvel).
6. Fora de âmbito (seguimentos): restringir menus do papel `leitura`; avisos de seguro/IPO ao condutor sem frota
   (requer RPC própria); consumo por RPC no servidor.

## Contratos tocados
- Novo: `listarAbastecimentosVeiculo(veiculoId, desde)` (`combustivel/services/pedidosService`) + hook; novo
  `buscarMeuColaborador(userId)` (`colaboradores/services`) + hook. Só leituras com colunas explícitas, sem N+1.
- Alterado: `MainLayout` (regex de rotas permitidas), `Sidebar`, `MobileBottomNav`, `routes.tsx` (índice).
- Testes existentes de isolamento (`/` do mecânico/motorista, menus) mudam de expectativa — mudança de comportamento
  intencional, não regressão.

## Erros e estados
Cada secção tem `loading` (skeleton), `error` (mensagem pt-PT + tentar de novo, não derruba as outras) e vazio. Perfil sem
papel (falha de rede) → painel mínimo (menor privilégio). Sem carro: mensagem clara e, se pode pedir, atalho de pedido.

## Critérios de aceite
- admin vê o Dashboard atual; nenhum outro papel o vê em `/`.
- Cada papel vê exatamente as secções da decisão 4; mudar o papel muda o painel sem código.
- Mecânico/motorista abrem `/` sem redirecionamento; `/produtos` etc. continuam bloqueados.
- typecheck 0 erros, testes e build verdes; fluxo validado no navegador (público + o possível sem credenciais).
- Rollback: reverter o commit (sem dados/migrations envolvidos).
