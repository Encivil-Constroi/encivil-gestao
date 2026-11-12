# Requisitos Funcionais — Controle Armazém ENCIVIL

Versão: 1.0 | Data: 2026-06-11 | Nota (2026-11-12): requisitos do MVP de stock; os módulos seguintes estão em `docs/17-armazem.md`, `docs/19-obras.md`, `docs/18-frota.md`, `docs/15-abastecimento-v2.md` e `docs/12-plano-v3.md`.

---

## Módulo: Autenticação

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| AUTH-01 | O sistema deve apresentar uma página de login com campos de e-mail e palavra-passe | P0 | Página de login acessível em `/login` com campos obrigatórios validados |
| AUTH-02 | O utilizador deve autenticar-se com e-mail e palavra-passe via Supabase Auth | P0 | Login com credenciais válidas redireciona para o Dashboard |
| AUTH-03 | O sistema deve bloquear acesso a todas as rotas internas sem sessão ativa | P0 | Tentativa de acesso a `/` sem sessão redireciona para `/login` |
| AUTH-04 | O utilizador deve conseguir terminar sessão | P0 | Botão de logout visível e funcional, redireciona para `/login` |
| AUTH-05 | A sessão deve persistir entre recarregamentos da página | P1 | Após F5, utilizador mantém sessão ativa |
| AUTH-06 | Credenciais inválidas devem mostrar mensagem de erro clara | P0 | Mensagem "E-mail ou palavra-passe incorretos" visível |
| AUTH-07 | Sistema deve suportar 7 papéis (`admin`, `gestor`, `armazem`, `medicoes`, `mecanico`, `motorista`, `leitura`; originalmente só admin e gestor) com permissões distintas aplicadas no servidor (RLS), não apenas na UI | P0 | Gestor autenticado não consegue criar/editar produto mesmo chamando a API diretamente |
| AUTH-08 | Sessão deve terminar automaticamente após período de inatividade | P1 | 30 min sem interação → logout automático com aviso |

---

## Módulo: Dashboard

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| DASH-01 | Mostrar total de produtos ativos no sistema | P0 | Contador correto e atualizado em tempo real |
| DASH-02 | Mostrar total de entradas registadas hoje | P0 | Contagem baseada em movimentos do dia atual |
| DASH-03 | Mostrar total de saídas registadas hoje | P0 | Contagem baseada em movimentos do dia atual |
| DASH-04 | Mostrar lista de produtos com stock baixo ou sem stock | P0 | Lista ordenada por criticidade (sem stock primeiro) |
| DASH-05 | Mostrar os últimos 8 movimentos de stock | P1 | Tabela com data, produto, tipo, quantidade e responsável |
| DASH-06 | Disponibilizar ações rápidas para registar entrada e saída | P0 | Botões "Registar Entrada" e "Registar Saída" visíveis |
| DASH-07 | Clicar num alerta de stock deve navegar para o detalhe do produto | P1 | Clique em produto com alerta abre `/produtos/:id` |

---

## Módulo: Produtos

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| PROD-01 | Criar novo produto com código, nome, categoria, unidade, stock mínimo | P0 | Formulário valida campos obrigatórios; produto aparece na lista |
| PROD-02 | Listar todos os produtos ativos com stock atual e estado | P0 | Lista paginada com pesquisa por nome/código |
| PROD-03 | Editar dados de um produto existente | P0 | Alterações guardadas corretamente; stock atual não é editável diretamente |
| PROD-04 | Ver página de detalhe de um produto com histórico de movimentos | P1 | Página `/produtos/:id` com dados completos e últimos movimentos |
| PROD-05 | Desativar produto sem apagar histórico | P0 | Produto desativado some da lista de seleção de movimentos mas mantém-se no histórico |
| PROD-06 | Filtrar produtos por categoria | P1 | Dropdown de categoria filtra a lista corretamente |
| PROD-07 | Pesquisar produtos por nome ou código | P0 | Campo de pesquisa filtra em tempo real |
| PROD-08 | Indicador visual de stock baixo e sem stock na lista | P0 | Badge colorido por estado: normal, baixo, sem stock |

---

## Módulo: Movimentos

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| MOV-01 | Registar movimento de entrada (aumenta stock) | P0 | Stock atual do produto incrementado pela quantidade |
| MOV-02 | Registar movimento de saída (diminui stock) | P0 | Stock atual do produto decrementado pela quantidade |
| MOV-03 | Registar movimento de ajuste (corrige stock) | P0 | Stock atualizado para valor definido ou com diferença aplicada |
| MOV-04 | Validar quantidade > 0 antes de guardar | P0 | Mensagem de erro se quantidade <= 0 |
| MOV-05 | Bloquear saída quando quantidade > stock disponível | P0 | Mensagem clara "Stock insuficiente. Disponível: X unidades" |
| MOV-06 | Atualizar stock_atual do produto automaticamente após movimento | P0 | Stock reflete movimento imediatamente |
| MOV-07 | Registar data e hora automaticamente (Europe/Lisbon) | P0 | Campo created_at preenchido automaticamente |
| MOV-08 | Registar responsável pelo movimento (obrigatório) | P0 | Campo responsável obrigatório; pode ser o utilizador autenticado |
| MOV-09 | Destino/obra obrigatório para saídas | P0 | Validação impede guardar saída sem destino/obra |
| MOV-10 | Campo de observação opcional em qualquer movimento | P1 | Campo textarea presente, não obrigatório |
| MOV-11 | Guardar stock_antes e stock_depois em cada movimento | P0 | Campos stock_antes e stock_depois preenchidos automaticamente |
| MOV-12 | Confirmação visual após registar movimento com sucesso | P0 | Toast/alerta de sucesso com resumo do movimento |

---

## Módulo: Histórico

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| HIST-01 | Listar todos os movimentos em ordem cronológica decrescente | P0 | Lista completa com mais recente primeiro |
| HIST-02 | Filtrar movimentos por intervalo de datas | P1 | Seletor de data início e fim funcional |
| HIST-03 | Filtrar movimentos por produto | P1 | Dropdown ou pesquisa por produto |
| HIST-04 | Filtrar movimentos por tipo (entrada/saída/ajuste) | P1 | Filtro de tipo funcional |
| HIST-05 | Filtrar movimentos por responsável | P1 | Dropdown ou pesquisa por responsável |
| HIST-06 | Filtrar movimentos por destino/obra | P1 | Campo de pesquisa por obra |
| HIST-07 | Mostrar stock_antes e stock_depois em cada linha | P1 | Colunas visíveis na tabela de histórico |

---

## Módulo: Relatórios

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| REL-01 | Relatório diário de movimentos | P1 | Filtrado pelo dia atual; mostra entradas, saídas e quantidades |
| REL-02 | Relatório semanal de movimentos | P1 | Últimos 7 dias; agrupado por dia |
| REL-03 | Relatório mensal de movimentos | P1 | Mês atual; totais por semana |
| REL-04 | Relatório anual de movimentos | P2 | Ano atual; totais por mês |
| REL-05 | Relatório por produto | P1 | Seleção de produto; histórico de consumo e entradas |
| REL-06 | Relatório por categoria | P1 | Seleção de categoria; totais por produto |
| REL-07 | Relatório por obra/destino | P1 | Filtro por obra; total de materiais consumidos por obra |
| REL-08 | Exportação para Excel | P2 (entregue) | Botão "Exportar Excel" gera ficheiro .xlsx (`exportXlsx`; células com `=`, `+`, `-`, `@` neutralizadas) |
| REL-09 | Exportação para PDF | P2 (entregue) | Botão "Exportar PDF" gera ficheiro .pdf (`src/app/lib/pdf`) |

---

## Módulo: Configurações

| Código | Descrição | Prioridade | Critério de Aceitação |
|--------|-----------|------------|----------------------|
| CONF-01 | Editar nome da empresa | P1 | Formulário com campo nome; guardado corretamente |
| CONF-02 | Fazer upload de logótipo | P2 | Campo de upload; imagem visível no menu lateral |
| CONF-03 | Definir nome do responsável de armazém | P1 | Campo editável; usado por defeito em movimentos |
| CONF-04 | Definir stock mínimo padrão para novos produtos | P1 | Valor numérico; aplicado automaticamente ao criar produto |
