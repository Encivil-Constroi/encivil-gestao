Quero que você evolua este protótipo do sistema **Controle Armazém ENCIVIL** para um projeto completo de produto + documentação técnica.

O objetivo não é apenas gerar telas bonitas. Quero que o Figma gere também toda a documentação necessária para que o desenvolvimento seja continuado depois por agents de IA no VS Code, usando Claude Agents e Codex.

O projeto será um sistema web interno para a empresa ENCIVIL, em Portugal, usado para controlar materiais de armazém: entradas, saídas, stock atual, histórico e relatórios.

Stack prevista:

* React
* TypeScript
* Vite
* Supabase
* Supabase Auth
* Supabase Database
* Supabase RLS
* Vercel
* Exportação PDF/Excel futuramente

Idioma obrigatório:

* Português de Portugal
* Não misturar português com inglês na documentação do produto
* Nomes técnicos de ficheiros podem seguir padrão de código, mas textos de negócio devem estar em português

Crie uma nova área/página no projeto chamada:

**DOCUMENTAÇÃO DO PROJETO**

Dentro dela, gerar frames/documentos completos em formato Markdown visual, prontos para serem copiados para ficheiros `.md`.

A documentação deve ser objetiva, profissional e orientada a desenvolvimento por agents.

Gerar os seguintes documentos:

---

# 1. README.md

Criar README completo contendo:

* Nome do projeto: Controle Armazém ENCIVIL
* Objetivo do sistema
* Problema que resolve
* Público-alvo
* Stack técnica
* Módulos principais
* Fluxo principal do sistema
* Regras críticas
* Como executar localmente
* Variáveis de ambiente previstas
* Estrutura inicial de pastas recomendada
* Estado atual do projeto
* Próximos passos

---

# 2. docs/00-source-of-truth.md

Criar documento central chamado Source of Truth.

Este documento é a verdade principal do projeto.

Deve conter:

* Visão do produto
* Escopo do MVP
* O que o sistema faz
* O que o sistema NÃO faz
* Regras de negócio imutáveis
* Entidades principais
* Fluxos principais
* Decisões técnicas
* Restrições
* Prioridades
* Critérios de sucesso

Regras críticas obrigatórias:

* Tudo gira em torno de produtos e movimentos de stock.
* Entrada aumenta stock.
* Saída diminui stock.
* Ajuste corrige stock manualmente.
* Histórico de movimentos nunca deve ser apagado fisicamente.
* Stock não pode ficar negativo, exceto se houver decisão administrativa futura explícita.
* Data e hora devem ser registadas automaticamente.
* Relatórios devem sempre ser baseados no histórico de movimentos.
* O MVP começa com apenas 1 utilizador administrador.
* O sistema não é ecommerce.
* O sistema não tem pagamentos.
* O sistema não é ERP completo.
* O sistema não controla faturação oficial.
* O sistema deve ser simples o bastante para um encarregado de armazém usar rapidamente.

---

# 3. docs/01-requisitos-funcionais.md

Gerar requisitos funcionais numerados.

Separar por módulo:

## Autenticação

* Login
* Logout
* Sessão protegida

## Dashboard

* Total de produtos
* Entradas hoje
* Saídas hoje
* Produtos com stock baixo
* Últimos movimentos
* Ações rápidas

## Produtos

* Criar produto
* Listar produtos
* Editar produto
* Ver detalhe do produto
* Desativar produto sem apagar histórico

## Movimentos

* Registar entrada
* Registar saída
* Registar ajuste
* Validar quantidade
* Atualizar stock automaticamente
* Registar data/hora automática
* Guardar responsável
* Guardar destino/obra/cliente
* Guardar observação

## Histórico

* Listar movimentos
* Filtrar por data
* Filtrar por produto
* Filtrar por tipo
* Filtrar por responsável
* Filtrar por destino/obra

## Relatórios

* Diário
* Semanal
* Mensal
* Anual
* Por produto
* Por categoria
* Por obra/destino
* Exportação futura para PDF/Excel

## Configurações

* Dados da empresa
* Logo
* Responsável do armazém
* Stock mínimo padrão

Cada requisito deve ter:

* Código
* Descrição
* Prioridade P0, P1 ou P2
* Critério de aceitação

---

# 4. docs/02-regras-de-negocio.md

Criar regras de negócio completas.

Incluir:

* Produto
* Categoria
* Unidade
* Stock atual
* Stock mínimo
* Movimento de entrada
* Movimento de saída
* Movimento de ajuste
* Histórico
* Relatórios
* Stock baixo
* Sem stock
* Desativação de produto
* Responsável
* Destino/obra

Regras obrigatórias:

* Produto ativo aparece em seleção de movimento.
* Produto desativado não aparece em novo movimento, mas continua no histórico.
* Entrada soma ao stock.
* Saída subtrai ao stock.
* Ajuste altera o stock para valor definido ou aplica correção, conforme regra definida.
* Saída maior que stock disponível deve ser bloqueada no MVP.
* Movimentos não devem ser apagados fisicamente.
* Correções devem ser feitas por novo movimento de ajuste.
* Relatórios nunca devem calcular diretamente a partir de stock atual, mas sim dos movimentos.
* Stock baixo acontece quando stock atual <= stock mínimo.
* Sem stock acontece quando stock atual = 0.
* Quantidade deve ser maior que zero.
* Data/hora deve usar timezone Europe/Lisbon.
* Observação é opcional.
* Destino/obra é obrigatório para saídas.

---

# 5. docs/03-modelo-de-dados.md

Criar modelo de dados para Supabase/PostgreSQL.

Tabelas obrigatórias:

## profiles

* id
* nome
* email
* role
* created_at

## produtos

* id
* codigo
* nome
* categoria
* unidade
* stock_atual
* stock_minimo
* ativo
* observacoes
* created_at
* updated_at

## movimentos_stock

* id
* produto_id
* tipo
* quantidade
* stock_antes
* stock_depois
* responsavel
* destino_obra
* observacoes
* created_at
* created_by

## configuracoes_empresa

* id
* nome_empresa
* logo_url
* responsavel_armazem
* stock_minimo_padrao
* created_at
* updated_at

Incluir:

* Relacionamentos
* Índices recomendados
* Enum de tipo_movimento: entrada, saida, ajuste
* Enum de role: admin
* Constraints
* Regras para não permitir quantidade <= 0
* Estratégia de auditoria simples
* Campos necessários para relatórios

---

# 6. docs/04-arquitetura.md

Criar documento de arquitetura.

Incluir:

* Arquitetura frontend-only
* React + TypeScript + Vite
* Supabase como backend
* Supabase Auth
* Supabase Database
* Supabase RLS
* Deploy na Vercel
* Responsabilidades por camada

Organização recomendada:

src/

* app/
* components/
* features/

  * auth/
  * dashboard/
  * produtos/
  * movimentos/
  * relatorios/
  * configuracoes/
* integrations/

  * supabase/
* shared/
* utils/

Explicar:

* Onde ficam páginas
* Onde ficam componentes
* Onde ficam serviços
* Onde ficam tipos TypeScript
* Onde ficam validações
* Onde ficam queries ao Supabase
* Onde ficam funções de relatório

Incluir regra:
Agents não devem misturar regra de negócio dentro de componentes visuais quando puder ser isolada em services/utils.

---

# 7. docs/05-seguranca-e-acesso.md

Criar documento de segurança.

MVP:

* Apenas um utilizador administrador
* Login obrigatório
* Todas as rotas internas protegidas
* RLS ativa no Supabase

Incluir policies conceituais:

* Apenas utilizadores autenticados podem ler dados
* Apenas admin pode criar/editar produtos
* Apenas admin pode criar movimentos
* Histórico não deve ser apagado fisicamente
* Configurações apenas admin

Incluir cuidados:

* Nunca expor chaves secretas no frontend
* Usar apenas VITE_SUPABASE_URL
* Usar apenas VITE_SUPABASE_PUBLISHABLE_KEY
* Não usar service role key no frontend
* Backup/exportação periódica

---

# 8. docs/06-ux-ui.md

Criar documentação de UX/UI.

Incluir:

* Princípios de interface
* Design simples para utilizador não técnico
* Registar saída em menos de 10 segundos
* Botões grandes e claros
* Poucos campos obrigatórios
* Feedback visual imediato
* Alertas de stock baixo
* Alerta de stock insuficiente
* Estados vazios
* Loading
* Erros
* Confirmações

Documentar as telas:

* Login
* Dashboard
* Produtos
* Novo Movimento
* Histórico
* Detalhe do Produto
* Relatórios
* Configurações

Para cada tela:

* Objetivo
* Componentes
* Ações disponíveis
* Estados possíveis
* Critérios de aceitação

---

# 9. docs/07-relatorios.md

Criar documentação dos relatórios.

Relatórios obrigatórios:

* Diário
* Semanal
* Mensal
* Anual
* Por produto
* Por categoria
* Por obra/destino

Para cada relatório definir:

* Objetivo
* Filtros
* Dados exibidos
* Cálculo
* Origem dos dados
* Critério de aceitação

Regra importante:
Todos os relatórios devem ser calculados a partir de movimentos_stock, nunca apenas a partir de produtos.stock_atual.

---

# 10. docs/08-testes.md

Criar plano de testes.

Incluir testes manuais e automatizados.

Cenários obrigatórios:

* Login com sucesso
* Produto criado com sucesso
* Produto editado com sucesso
* Entrada aumenta stock
* Saída diminui stock
* Saída maior que stock é bloqueada
* Ajuste corrige stock
* Produto com stock baixo aparece em alerta
* Histórico mostra movimento criado
* Relatório diário mostra movimentos do dia
* Produto desativado não aparece em novo movimento
* Histórico mantém produto desativado
* Campos obrigatórios validam corretamente

Para cada teste:

* Código
* Cenário
* Passos
* Resultado esperado
* Prioridade

---

# 11. docs/09-implantacao.md

Criar documento de implantação.

Incluir:

* Deploy na Vercel
* Supabase project setup
* Variáveis de ambiente
* Migrações SQL
* Configuração de Auth
* Configuração de RLS
* Checklist de produção

Checklist:

* Login testado
* RLS ativa
* Produtos funcionando
* Movimentos funcionando
* Stock atualizado corretamente
* Relatórios funcionando
* Backup/exportação definido
* Responsável treinado

---

# 12. docs/10-roadmap.md

Criar roadmap.

Separar:

## MVP

* Login
* Produtos
* Movimentos
* Histórico
* Dashboard
* Relatórios básicos

## Fase 2

* Multiutilizador
* Perfis de acesso
* Exportação PDF/Excel
* Leitura por código de barras
* Importação de produtos
* Anexos/fotos
* Obras cadastradas

## Fase 3

* Integração com faturação
* Integração com compras
* Alertas automáticos
* Dashboard de gestão
* Aplicação mobile/PWA

---

# 13. docs/specs/

Criar SPECS funcionais separadas:

* SPEC-AUTH.md
* SPEC-DASHBOARD.md
* SPEC-PRODUTOS.md
* SPEC-MOVIMENTOS.md
* SPEC-HISTORICO.md
* SPEC-RELATORIOS.md
* SPEC-CONFIGURACOES.md

Cada SPEC deve conter:

* Objetivo
* Escopo
* Fora de escopo
* Regras de negócio
* Estados da interface
* Campos
* Validações
* Fluxo principal
* Fluxos alternativos
* Critérios de aceitação
* Ficheiros sugeridos para implementação
* Riscos
* Testes mínimos

---

# 14. AGENTS.md

Criar documento específico para agents de IA.

Este ficheiro deve orientar Claude Agents, Codex e outros agents.

Incluir regras:

* Ler sempre docs/00-source-of-truth.md antes de alterar código.
* Ler a SPEC do módulo antes de implementar.
* Fazer alterações pequenas e isoladas.
* Não inventar funcionalidades fora do escopo.
* Não transformar o sistema em ERP.
* Não criar ecommerce.
* Não misturar regra de negócio com UI quando puder ser evitado.
* Preservar histórico de movimentos.
* Nunca apagar movimentos fisicamente.
* Validar stock antes de saída.
* Atualizar documentação quando alterar regra de negócio.
* Ao finalizar tarefa, informar:

  * Ficheiros alterados
  * Comportamento alterado
  * Testes executados
  * Riscos conhecidos

---

# 15. TASKS.md

Criar backlog inicial para desenvolvimento por agents.

Separar tarefas por prioridade:

## P0 - Essencial

* Criar projeto React + TypeScript + Vite
* Configurar Supabase
* Criar schema inicial
* Configurar Auth
* Criar layout base
* Criar login
* Criar CRUD de produtos
* Criar movimento de entrada
* Criar movimento de saída
* Atualizar stock automaticamente
* Bloquear saída sem stock
* Criar histórico
* Criar dashboard básico

## P1 - Importante

* Relatórios por período
* Filtros avançados
* Detalhe do produto
* Configurações
* Exportação Excel
* Melhorias UX

## P2 - Futuro

* PDF
* Código de barras
* Multiutilizador
* Obras cadastradas
* Anexos/fotos
* PWA

Cada tarefa deve ter:

* Código
* Título
* Objetivo
* Ficheiros prováveis
* Critérios de aceite
* Testes esperados
* Risco

---

# 16. ADRs

Criar decisões arquiteturais iniciais:

* ADR-001: Usar Supabase em vez de servidor local
* ADR-002: Usar frontend React + TypeScript + Vite
* ADR-003: Histórico de movimentos como fonte dos relatórios
* ADR-004: MVP com apenas um admin
* ADR-005: Bloquear stock negativo no MVP
* ADR-006: Não apagar movimentos fisicamente

Cada ADR deve conter:

* Contexto
* Decisão
* Consequências
* Alternativas consideradas

---

Resultado esperado:

Gerar telas do sistema e também uma área organizada de documentação no próprio Figma.

A documentação deve ser suficientemente clara para que, depois de exportar o projeto, eu consiga copiar os conteúdos para ficheiros reais `.md` no repositório e operar o desenvolvimento com agents de IA quase automaticamente.

Não criar documentação genérica. Criar documentação específica, prática e coerente com este sistema.

Priorizar simplicidade, rastreabilidade, segurança e facilidade de manutenção.
