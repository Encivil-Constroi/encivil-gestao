# Documentação UX/UI — Controle Armazém ENCIVIL

---

## Princípios de Interface

1. **Rapidez acima de tudo** — Registar uma saída em menos de 10 segundos. Formulários mínimos.
2. **Clareza visual** — Utilizador com pouca experiência informática deve entender imediatamente o que fazer.
3. **Feedback imediato** — Cada ação confirma resultado (toast de sucesso, alerta de erro).
4. **Hierarquia clara** — As ações mais frequentes (entrada/saída) estão sempre acessíveis.
5. **Alertas proativos** — Stock baixo é visível sem o utilizador precisar de procurar.

---

## Paleta de Cores ENCIVIL

Tema neutro inspirado na referência Vercel, com identidade ENCIVIL. Valores vigentes em `src/styles/theme.css` (atualização de outubro de 2026).

| Token | Uso | Claro | Escuro |
|-------|-----|-------|--------|
| `--primary` | Ação principal | `#04090F` | `#F4F5F6` |
| `--brand` | Azul oficial | `#001C7D` | `#001C7D` |
| `--info` | Informação | `#001C7D` | `#93B4FF` |
| `--success` | Entradas, confirmações | `#166534` | `#4ADE80` |
| `--destructive` | Saídas, erros | `#B91C1C` | `#F87171` |
| `--warning` | Stock baixo, alertas | `#92400E` | `#FBBF24` |
| `--background` | Fundo | `#FAFAFA` | `#04090F` |
| `--card` | Painéis | `#FFFFFF` | `#10161E` |
| `--muted-foreground` | Texto secundário | `#606872` | `#A3ABB5` |

Usar sempre o `*-foreground` correspondente sobre fundos semânticos sólidos; não fixar branco, pois o modo escuro inverte os pares. Sidebar ativa usa os tokens `sidebar-primary`/`sidebar-primary-foreground`. Campos usam `input-background` e fronteira `input`, com foco `ring`.

Geist e Geist Mono são alojadas localmente em `public/fonts/`, com licença OFL. Raio base 8px, sombras neutras, superfícies consistentes em todas as áreas. Logótipo original preservado, apresentado em monocromático na navegação/autenticação. Respeitar `prefers-reduced-motion`.

Gráficos usam `chart-1..5` (azul, verde, vermelho, âmbar, púrpura), `chart-grid` e `chart-text`; distinguir séries também por legendas. Documentos para impressão mantêm fundo branco e tinta escura explícitos, independentemente do tema. Cores externas (por exemplo, WhatsApp) são exceções intencionais.

---

## Componentes de Estado

### Loading
- Spinner centralizado com texto "A carregar..."
- Skeleton loaders para tabelas (evitar flash de conteúdo vazio)

### Estado Vazio
- Ícone relevante + mensagem descritiva + ação sugerida
- Ex: "Ainda não há produtos. Adicione o primeiro produto."

### Erros
- Toast vermelho com mensagem clara do problema
- Formulários: mensagem por baixo do campo em erro, campo com borda vermelha

### Confirmações
- Toast verde "Movimento registado com sucesso"
- Toast verde "Produto guardado"
- Dialog de confirmação para ações destrutivas (ex: desativar produto)

### Alertas de Stock
- Badge amarelo "Stock Baixo" — visível na lista e no detalhe
- Badge vermelho "Sem Stock" — visível na lista e no detalhe
- Widget dedicado no Dashboard com lista de alertas

---

## Telas

### Login

**Objetivo:** Autenticar o utilizador de forma simples e segura.

**Componentes:**
- Logótipo ENCIVIL
- Campo e-mail
- Campo palavra-passe (com toggle mostrar/ocultar)
- Botão "Entrar" (destaque com o par `primary`/`primary-foreground`)
- Mensagem de erro (credenciais inválidas)

**Estados:**
- Inicial: formulário vazio
- A carregar: botão desativado com spinner
- Erro: mensagem de erro abaixo do formulário
- Sucesso: redireciona para Dashboard

**Critérios de aceitação:**
- Campos obrigatórios validados antes de submeter
- Mensagem clara para credenciais inválidas
- Foco automático no campo e-mail ao carregar

---

### Dashboard

**Objetivo:** Visão geral imediata do estado do armazém. Ponto de partida para ações rápidas.

**Componentes:**
- 4 cartões de estatísticas (Total Produtos, Entradas Hoje, Saídas Hoje, Produtos com Alerta)
- Tabela de últimos 8 movimentos
- Widget de alertas de stock baixo
- Botões de ação rápida: "Registar Entrada" e "Registar Saída"

**Estados:**
- Normal: todos os dados carregados
- Sem movimentos hoje: cartões com zero
- Sem alertas: mensagem "Todos os produtos com stock adequado"

**Critérios de aceitação:**
- Carrega em < 2 segundos
- Botões de ação rápida visíveis acima da dobra
- Alertas de stock ordenados por criticidade (sem stock > baixo)

---

### Produtos

**Objetivo:** Gerir o catálogo de materiais do armazém.

**Componentes:**
- Barra de pesquisa em tempo real (nome ou código)
- Filtro por categoria (dropdown)
- Botão "Novo Produto"
- Tabela com: código, nome, categoria, unidade, stock atual (badge colorido), ações
- Paginação

**Estados:**
- Lista com produtos
- Lista vazia (nenhum produto criado)
- Sem resultados de pesquisa
- Loading

**Critérios de aceitação:**
- Pesquisa filtra em < 300ms
- Badge de stock com cores corretas (normal/baixo/sem stock)
- Clicar na linha navega para detalhe do produto

---

### Novo Movimento

**Objetivo:** Registar entrada, saída ou ajuste de forma rápida.

**Componentes:**
- Selector de tipo: Entrada | Saída | Ajuste (tabs ou botões destacados)
- Selector de produto (pesquisa com autocomplete)
- Stock atual do produto selecionado (visível em tempo real)
- Campo de quantidade (numérico, grande)
- Campo destino/obra (obrigatório para saídas)
- Campo responsável
- Campo observação (opcional)
- Botão "Confirmar" (destaque)
- Indicador de erro "Stock insuficiente" (visível antes de submeter)

**Estados:**
- Formulário vazio
- Produto selecionado (mostra stock atual)
- Stock insuficiente (quantidade > stock — destaca erro em tempo real)
- A guardar (botão desativado + spinner)
- Sucesso (toast + formulário reset para rapidez)
- Erro (toast de erro)

**Critérios de aceitação:**
- Seleção de produto por pesquisa (não scroll de lista longa)
- Stock disponível sempre visível após selecionar produto
- Erro de stock insuficiente aparece antes de submeter (onChange)
- Após sucesso, formulário reset para novo registo imediato
- Tempo total de preenchimento < 10 segundos para saída simples

---

### Histórico

**Objetivo:** Consultar todos os movimentos com filtros avançados.

**Componentes:**
- Filtros: intervalo de datas, produto, tipo, responsável, destino/obra
- Tabela: data/hora, produto, tipo, quantidade, stock antes/depois, responsável, destino/obra
- Paginação
- Botão "Limpar filtros"

**Estados:**
- Lista com movimentos (padrão: últimos 30 dias)
- Sem resultados para filtros aplicados
- Loading

**Critérios de aceitação:**
- Filtros independentes e combináveis
- Data/hora no formato português (DD/MM/AAAA HH:MM)
- Tipo exibido com badge colorido (entrada=verde, saída=vermelho, ajuste=cinza)

---

### Detalhe do Produto

**Objetivo:** Ver informações completas de um produto e o seu historial de movimentos.

**Componentes:**
- Cabeçalho com nome, código, categoria, unidade, estado (ativo/inativo)
- Métricas: stock atual, stock mínimo, total entradas, total saídas
- Gráfico de evolução de stock (opcional P2)
- Tabela de últimos movimentos do produto
- Botões: Editar, Registar Movimento, Desativar

**Estados:**
- Produto ativo com stock normal
- Produto com stock baixo (badge amarelo)
- Produto sem stock (badge vermelho)
- Produto inativo (banner de aviso)

**Critérios de aceitação:**
- Todos os dados do produto visíveis numa só página
- Histórico de movimentos do produto ordenado por data decrescente
- Botão de desativação pede confirmação

---

### Relatórios

**Objetivo:** Consultar consumos e movimentos por período, produto, categoria ou obra.

**Componentes:**
- Selector de tipo de relatório (tabs): Diário | Semanal | Mensal | Anual | Por Produto | Por Categoria | Por Obra
- Filtros contextuais por tipo de relatório
- Tabela/gráfico de resultados
- Totais e resumo
- Botão "Exportar Excel" (P2)

**Estados:**
- Dados disponíveis
- Sem movimentos no período
- Loading

**Critérios de aceitação:**
- Relatório calculado a partir de movimentos_stock
- Totais corretos (sem inconsistências com stock_atual)
- Gráficos claros e legíveis

---

### Configurações

**Objetivo:** Personalizar dados da empresa e parâmetros do sistema.

**Componentes:**
- Formulário: nome empresa, logótipo, responsável armazém, stock mínimo padrão
- Botão "Guardar alterações"

**Estados:**
- Formulário com dados atuais
- A guardar
- Guardado com sucesso (toast)
- Erro ao guardar

**Critérios de aceitação:**
- Alterações persistidas corretamente
- Stock mínimo padrão aplicado a novos produtos criados após a alteração
