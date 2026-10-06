# Redesign e fecho do ramo — 2026-10-06

## Alterações
- Tema neutro claro/escuro, preto ENCIVIL #04090F e azul #001C7D, fontes Geist locais com OFL, tokens semânticos, navegação, controlos, gráficos e impressão coerentes.
- Convenções atualizadas em CLAUDE.md e docs/06-ux-ui.md.
- Dois testes de menu adaptados a sidebar-primary; verificam rota, destaque ativo e ausência de destaque nos restantes links.
- SubempreiteiroFormPage envia orcamentoItemId na gravação inicial do artigo e recupera o vínculo do serviço na edição. Removidos SELECT e UPDATE adicionais na página.
- autoDados.ts movido para src/features/obras/lib, com imports atualizados e implementação preservada.

## Evidência
- Verificação final: `npm run typecheck`, `npm test` (104 ficheiros, 2096 testes) e `npm run build` concluídos com código 0. Avisos existentes de Node/localStorage e dimensões Recharts no JSDOM; sem falhas.
- Antes da correção: 2 testes de menu falhavam, 2092 passavam.
- Testes focados dos menus: 32 passaram. Regressões de Obras/subempreiteiros: 398 passaram; os dois testes novos falharam antes da correção.
- Revisão independente do redesign: sem problemas críticos/importantes; fontes, impressão e pares semânticos verificados. Contraste mínimo dos pares sólidos: 6,47:1 claro e 7,22:1 escuro.
- agent-browser em Vite local 127.0.0.1:5188: login claro/escuro a 390px; dashboard a 1440px; navegação por armazém, obras, subempreitadas, frota, abastecimento, colaboradores, relatórios e configurações no modo escuro. Sem exceções de página ou overflow horizontal nas rotas inspecionadas.
- Áreas autenticadas usaram sessão e respostas simuladas no navegador, com endpoint fictício e interceção de pedidos externos. Isto valida apresentação/navegação, não autenticação real ou operações de produção.

## Limites e publicação
Sem dados de produção alterados, migrations aplicadas ou push. A gravação legada de contrato e artigos continua em operações separadas; esta correção elimina só o vínculo posterior redundante. As migrations A/B de Obras requerem aplicação manual antes de publicar o frontend, conforme docs/20-subempreitadas-controlo.md.
