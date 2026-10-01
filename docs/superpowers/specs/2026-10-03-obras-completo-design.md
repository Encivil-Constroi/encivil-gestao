# Módulo OBRAS — centro de comando do CEO (desenho)

> 2026-10-03. Pedido da Direção: "gestão de ponta a ponta"; o CEO, mesmo noutro país, vê e controla tudo o que
> acontece em cada obra. Classificação: arquitetural (novo módulo que junta Obras, Subempreitadas, relatórios
> diários e cruzamentos com Frota, Equipa, Ferramentas e Armazém). Decisões tomadas sem perguntas, como autorizado.

## 1. Intenção (o que foi pedido e o que assumimos)
**Pedido:** módulo OBRAS separado, numa só aba; criar obra com Google Maps (GPS), datas, estado; ficha completa com
aferições do engenheiro; subempreitadas integradas (contrato anexável, medições com provas, ocorrências, atrasos,
clima); em cada obra: frota/máquinas, equipa, fotos, ferramentas emprestadas, materiais enviados/usados,
relatórios diários e progresso; editar a obra; dashboard elegante com todas as obras em curso; relatórios diários
(clima, equipa presente, ocorrências, fotos da câmara ou galeria, submissão) com lista para o CEO.

**Assumido:**
- *Google Maps sem chave de API* (sem custo, sem segredo no frontend): pré-visualização por iframe `maps.google.com/maps?q=…&output=embed`,
  botões "Abrir no Google Maps" e "Navegar" (`/maps/dir/?api=1&destination=lat,lon`), colar link ou coordenadas,
  e "Usar a minha localização" (GPS do telemóvel). Links curtos `maps.app.goo.gl` não se conseguem resolver no browser: a UI pede o link longo ou as coordenadas.
- Quem escreve relatórios diários: `admin`, `gestor`, `medicoes` (engenheira) e quem o CEO designar por obra (`obra_autores`), seja qual for o papel (exceto `mecanico`/`motorista`, que só vêem o seu módulo).
- Aferições/progresso/ocorrências de subempreiteiros: `admin`, `gestor`, `medicoes`. Gestão da obra (criar/editar, equipa, autores): `admin`, `gestor`. Validar continua só `admin`.
- O progresso da obra vem, por ordem, das **fases** (média ponderada), da última **aferição** com percentagem, ou da execução das **subempreitadas**.
- Um relatório submetido fica imutável; só o `admin` o reabre (com motivo, fica no histórico).
- Endereços antigos (`/subempreiteiros/*`) redirecionam para o novo módulo; nada se perde.

## 2. Estrutura de navegação
Menu "Obras" com **um só item** (`/obras`) e separadores: **Painel** · **Obras** · **Relatórios diários** · **Subempreitadas**.
- `/obras` Painel: cartões de todas as obras em curso (semáforo de saúde, progresso real vs esperado, prazo, orçamento vs custo, equipa/viaturas/ferramentas/subs, último relatório, ocorrências), KPIs do topo, alertas "precisa de atenção".
- `/obras/lista` Todas (filtros: estado, pesquisa; planeada/ativa/suspensa/concluída).
- `/obras/relatorios` Relatórios diários de todas as obras (filtros obra/data/estado/autor/ocorrências) — controlo do CEO.
- `/obras/subempreitadas` Todas as contratações (valor, executado %, atraso, ocorrências abertas, contrato anexado, semáforo).
- `/obras/nova`, `/obras/:id/editar` formulário (com mapa).
- `/obras/:id` Ficha com secções (query `?sec=`): Resumo · Progresso (fases + aferições) · Equipa · Frota · Ferramentas · Materiais · Subempreitadas · Relatórios · Fotos · Atividade.
- `/obras/:id/relatorio-diario/novo`, `/obras/relatorio-diario/:rid` (ver/editar rascunho/submeter).
- `/obras/subempreitada/novo?obra=`, `/obras/subempreitada/:id`, `/obras/subempreitada/:id/editar`, `/obras/subempreitada/:subId/auto/novo`, `/obras/auto/:autoId`, `/obras/auto/:autoId/editar`, `/obras/auto/:autoId/pdf` (fora do layout).
- Mantêm-se: `/obras/:id/custos`, `/obras/:id/livro`, `/obras/:id/guias`, `/obras/:id/relatorio` (financeiro, fora do layout).
- Redirects: `/subempreiteiros` → `/obras/subempreitadas`; `/subempreiteiros/novo` → `/obras/subempreitada/novo`; `/subempreiteiros/:id[/editar]` → `/obras/subempreitada/:id[/editar]`; `/subempreiteiros/:subId/autos/novo` → `/obras/subempreitada/:subId/auto/novo`; `/autos/:autoId[/editar|/pdf]` → `/obras/auto/:autoId[...]`.

## 3. Contrato de dados (migration `20261003000000_obras_completo.sql`)
Tudo com RLS, `SET search_path = public` nas SECURITY DEFINER, GRANT explícito. Leitura (todas as tabelas novas): `auth_role() IN ('admin','gestor','armazem','medicoes','leitura')` ou autor designado da obra.
Escrita só por RPC (as tabelas não têm INSERT/UPDATE direto, exceto onde indicado). Funções auxiliares: `pode_gerir_obras()` = admin/gestor; `pode_medir_obras()` = admin/gestor/medicoes; `pode_relatar_obra(uuid)` = `pode_medir_obras()` OU linha em `obra_autores`.

### 3.1 `obras` (ALTER)
`data_inicio date, data_prevista_fim date, data_fim_real date, morada text, latitude numeric(9,6), longitude numeric(9,6), responsavel_id uuid → colaboradores, engenheiro_id uuid → colaboradores, tipo_obra text, descricao text`.
`estado` passa a `planeada | ativa | suspensa | concluida` (substituir `ck_obra_estado`). CHECKs: `data_prevista_fim >= data_inicio`, latitude −90..90, longitude −180..180 (ambas ou nenhuma).
**RPC** `obra_guardar(p_id uuid, p_nome text, p_cliente text, p_morada text, p_localizacao text, p_latitude numeric, p_longitude numeric, p_estado text, p_data_inicio date, p_data_prevista_fim date, p_orcamento numeric, p_responsavel_id uuid, p_engenheiro_id uuid, p_tipo_obra text, p_descricao text, p_observacoes text) → uuid` (null = criar; valida; `concluida` fixa `data_fim_real` se vazia, outro estado limpa-a; regista evento). Só `pode_gerir_obras()`.

### 3.2 Equipa
`obra_equipa(id, obra_id, colaborador_id, funcao text, desde date, ate date null, criado_por, criado_em)`; único parcial `(obra_id, colaborador_id) WHERE ate IS NULL`.
**RPC** `obra_alocar_colaborador(p_obra_id, p_colaborador_id, p_funcao text, p_desde date) → uuid` (colaborador ativo; recusa duplicado ativo), `obra_remover_colaborador(p_alocacao_id uuid, p_ate date) → void`. Só `pode_gerir_obras()`.
**RPC** `obra_equipa_lista(p_obra_id) → TABLE(alocacao_id, colaborador_id, nome, funcao, desde, ate, ativo bool, ultima_picagem timestamptz, presente_hoje bool)` (a partir de `picagens`; presente = última picagem de hoje na obra é entrada).

### 3.3 Progresso
`obra_fases(id, obra_id, nome, peso numeric >0 default 1, progresso numeric 0..100 default 0, data_inicio, data_fim_prevista, estado 'pendente'|'em_curso'|'concluida', ordem int, notas, atualizado_por, atualizado_em)`.
**RPC** `obra_guardar_fase(p_id, p_obra_id, p_nome, p_peso, p_progresso, p_data_inicio, p_data_fim_prevista, p_notas) → uuid` (estado deriva do progresso: 0 pendente, 100 concluída; ordem = fim da lista na criação), `obra_apagar_fase(p_id) → void`. `pode_medir_obras()`.
`obra_afericoes(id, obra_id, data date, progresso_pct numeric null, resumo text, problemas text, atrasos_dias int default 0, atraso_motivo text, clima text, clima_descricao text, fotos jsonb default '[]', autor_id, criado_em)`.
**RPC** `obra_registar_afericao(p_obra_id, p_data, p_progresso_pct, p_resumo, p_problemas, p_atrasos_dias, p_atraso_motivo, p_clima, p_clima_descricao, p_fotos jsonb) → uuid` (`resumo` obrigatório; data não futura; `pode_medir_obras()`; sem edição — corrige-se com nova aferição).
`fotos` = array de `{ "path": text, "legenda": text|null }` (caminho no bucket `obras`) em todas as tabelas.

### 3.4 Relatórios diários
`obra_autores(obra_id, user_id, adicionado_por, criado_em)` PK `(obra_id,user_id)`. **RPC** `obra_definir_autores(p_obra_id, p_user_ids uuid[]) → void` (`pode_gerir_obras()`).
`obra_relatorios_diarios(id, obra_id, data date, estado 'rascunho'|'submetido', clima text, temperatura_c numeric null, clima_descricao text, equipa_ids uuid[] default '{}', equipa_outros text, subempreiteiros_ids uuid[] default '{}', trabalhos text, houve_ocorrencias bool default false, ocorrencias text, observacoes text, fotos jsonb default '[]', autor_id default auth.uid(), criado_em, atualizado_em, submetido_em, submetido_por, reaberto_em, reaberto_por, reaberto_motivo)`.
Clima: `SOL | NUBLADO | CHUVA_FRACA | CHUVA_FORTE | VENTO | NEVOEIRO | CALOR_EXTREMO | FRIO | TEMPESTADE`.
**RPC** `obra_guardar_relatorio(p_id uuid, p_obra_id uuid, p_data date, p_clima text, p_temperatura_c numeric, p_clima_descricao text, p_equipa_ids uuid[], p_equipa_outros text, p_subempreiteiros_ids uuid[], p_trabalhos text, p_houve_ocorrencias bool, p_ocorrencias text, p_observacoes text, p_fotos jsonb) → uuid` (cria ou atualiza **rascunho**; só o autor ou `admin/gestor`; data não futura).
**RPC** `obra_submeter_relatorio(p_id) → void` (exige clima, trabalhos, ≥1 pessoa em `equipa_ids` ou `equipa_outros`; se `houve_ocorrencias`: texto das ocorrências **e** ≥1 foto; passa a `submetido`; evento na atividade da obra).
**RPC** `obra_reabrir_relatorio(p_id, p_motivo text) → void` (só `admin`; motivo obrigatório).
**RPC** `obra_relatorios_lista(p_obra_id uuid, p_desde date, p_ate date, p_estado text, p_so_ocorrencias bool, p_limite int) → TABLE(id, obra_id, obra_nome, data, estado, clima, houve_ocorrencias, trabalhos, n_fotos int, n_equipa int, autor_id, autor_nome, submetido_em)` (`p_obra_id` null = todas).
**RPC** `obra_relatorio_detalhe(p_id) → jsonb` (relatório + obra_nome + autor_nome + `equipa[{id,nome}]` + `subempreiteiros[{id,nome}]`).

### 3.5 Fotos
`obra_fotos(id, obra_id, path, legenda, tirada_em date default current_date, autor_id, criado_em)` — galeria avulsa. **RPC** `obra_adicionar_fotos(p_obra_id, p_fotos jsonb) → int` (`pode_relatar_obra`). `obra_apagar_foto(p_id) → void` (autor ou gestor/admin).
**View** `obra_fotos_todas` (`security_invoker = true`): `obra_id, path, legenda, data, origem ('GALERIA'|'RELATORIO'|'AFERICAO'|'SUBEMPREITADA'|'AUTO'), ref_id uuid, autor_id` — une `obra_fotos` e os `fotos` de relatórios submetidos, aferições, `sub_ocorrencias` e `autos_medicao`.

### 3.6 Subempreitadas (CEO com controlo total)
`subempreiteiros` (ALTER): `nif text, telefone text, email text, especialidade text, data_inicio date, data_fim_prevista date, contrato_path text, contrato_nome text, contrato_enviado_em timestamptz`.
**RPC** `sub_atualizar_ficha(p_id, p_nif, p_telefone, p_email, p_especialidade, p_data_inicio, p_data_fim_prevista) → void`, `sub_anexar_contrato(p_id, p_path text, p_nome text) → void`, `sub_remover_contrato(p_id) → void` (funcionam também em contratações validadas — são documentos, não valores; `pode_escrever('subempreitadas')`; evento na atividade).
`sub_ocorrencias(id, subempreiteiro_id, obra_id, tipo 'ATRASO'|'PROBLEMA'|'CLIMA'|'QUALIDADE'|'SEGURANCA'|'NOTA', gravidade 'baixa'|'media'|'alta', data, descricao, dias_atraso int default 0, fotos jsonb, resolvido bool default false, resolvido_em, resolvido_por, resolucao text, autor_id, criado_em)`.
**RPC** `sub_registar_ocorrencia(p_subempreiteiro_id, p_tipo, p_gravidade, p_data, p_descricao, p_dias_atraso int, p_fotos jsonb) → uuid`, `sub_resolver_ocorrencia(p_id, p_resolucao text) → void` (`pode_medir_obras()`).
`autos_medicao` (ALTER): `fotos jsonb default '[]', anotacoes text, problemas text, atraso_dias int default 0, clima text, clima_descricao text, progresso_fisico_pct numeric(5,2)`; **RPC** `auto_guardar_evidencias(p_auto_id, p_fotos jsonb, p_anotacoes, p_problemas, p_atraso_dias, p_clima, p_clima_descricao, p_progresso_fisico_pct) → void` (rascunho; `admin` também em validado).
**RPC** `sub_painel(p_id) → jsonb`: `{valor_contrato, executado, executado_pct, pago, por_pagar, retencao_acumulada, autos_n, ultimo_auto date, dias_sem_auto, atraso_dias_total, ocorrencias_abertas{baixa,media,alta}, ocorrencias_total, presencas_relatorios, prazo{inicio,fim_previsto,dias_restantes}, saude 'ok'|'atencao'|'critico', motivos text[]}`.
**RPC** `subs_resumo(p_obra_id uuid) → TABLE(sub_id, obra_id, obra_nome, nome, especialidade, tipo, estado, valor_contrato, executado, executado_pct, atraso_dias_total, ocorrencias_abertas, tem_contrato bool, data_fim_prevista, saude, motivos text[])` (`p_obra_id` null = todas as obras).

### 3.7 Visões agregadas e atividade
`obra_eventos(id, obra_id, tipo, titulo, detalhe, autor_id default auth.uid(), criado_em)` — alimentado pelas RPCs (obra criada/editada/estado, equipa, aferição, relatório submetido/reaberto, contrato anexado, subempreitada contratada/validada, auto validado, ocorrência registada/resolvida). **RPC** `obra_eventos_lista(p_obra_id, p_limite int default 50) → TABLE(id, tipo, titulo, detalhe, autor_nome, criado_em)`.
Tipo composto/linha `obra_resumo` devolvida por **`obras_painel() → SETOF`** (todas as obras não arquivadas) e **`obra_visao(p_obra_id) → 1 linha`**:
`obra_id, nome, cliente, localizacao, morada, latitude, longitude, estado, data_inicio, data_prevista_fim, data_fim_real, progresso_pct, progresso_fonte ('fases'|'afericao'|'subempreitadas'|'nenhuma'), progresso_esperado_pct, saude ('ok'|'atencao'|'critico'), motivos text[], orcamento, custo_total, equipa_n, viaturas_n, ferramentas_n, subs_n, materiais_valor, ocorrencias_abertas, relatorios_n, fotos_n, afericoes_n, ultimo_relatorio date, dias_sem_relatorio int, responsavel_id, responsavel_nome, engenheiro_id, engenheiro_nome, tipo_obra, descricao, observacoes`.
- `progresso_esperado_pct` = linear entre início e fim previstos (0–100); null se faltar uma data.
- Saúde **crítico**: ativa com prazo vencido; atraso ≥ 20 pontos face ao esperado; ocorrência de gravidade alta aberta. **Atenção**: atraso ≥ 8 pontos; ativa iniciada sem relatório submetido há ≥ 3 dias; custo ≥ 90 % do orçamento; ocorrência aberta. Planeada/suspensa/concluída: `ok`. `motivos` em português ("Prazo ultrapassado há 5 dias").
- `custo_total` reutiliza as funções de custos existentes (materiais + combustível + mão de obra se existir — o implementador confirma na função `custos_materiais_por_obra` e afins).
**Cruzamentos** (invoker, só leitura): `obra_frota(p_obra_id) → TABLE(veiculo_id, nome, identificacao, tipo, marca, modelo, estado_operacional, condutor_nome, desde date, km_atual, ehmaquina bool, atual bool, entregue_em, devolvido_em)` (viaturas em uso na obra + histórico de entregas); `obra_ferramentas(p_obra_id) → TABLE(emprestimo_id, ferramenta_id, nome, numero_serie, foto_path, colaborador_nome, data_saida, data_devolucao, ativo bool, dias_fora int)`; `obra_materiais(p_obra_id) → TABLE(produto_id, nome, unidade, enviado, devolvido, liquido, valor, ultimo_movimento date)` (reutiliza `armazem_materiais_por_obra`).

### 3.8 Armazenamento
Bucket público `obras` (imagens ≤ 10 MB): `<obra_id>/<pasta>/<ts>-<rand>.<ext>`, pasta ∈ `galeria|relatorios|afericoes|subempreitadas|autos`. Upload só se `pode_relatar_obra(<obra_id>)` (função `foto_obra_valida(name)`).
Bucket **privado** `obras-contratos` (PDF/imagem ≤ 20 MB): `<subempreiteiro_id>/contrato-<ts>.<ext>`; leitura por URL assinada (60 s) a quem lê subempreitadas; upload/remoção só `pode_escrever('subempreitadas')`.

## 4. Frontend
`src/features/obras/**` é dono do módulo (um módulo nunca importa de outro: os cruzamentos vêm por RPC). Cliente tipado `obrasDb` em `db.ts` (como `frotaDb`). Padrões obrigatórios do CLAUDE.md (useAsync/useMutation, SELECT constante, sem `as any`).
Os ecrãs antigos (`src/app/pages/Obra*.tsx`, `Subempreiteiro*.tsx`, `Auto*.tsx`) movem-se/reescrevem-se dentro de `src/features/obras/` e as rotas apontam para lá; o relatório financeiro e o PDF do auto mantêm-se (fora do layout).
UI: design system existente (Tailwind v4, tokens, cartões `rounded-2xl`), mobile first; semáforo com cor **e** texto/ícone (acessibilidade); gráficos SVG simples (anel de progresso, barras) com a paleta validada; sem poluição — um painel limpo e a ficha organizada por secções.

## 5. Testes e entrega
Vitest local (UI + serviços), `supabase/tests/obras-completo.test.mjs` no pg-harness (permissões por papel, validações, saúde, progresso, imutabilidade, storage), teste de contrato RPC×SQL (`import.meta.glob`), typecheck 0, build, Node 24; agent-browser contra local/Cloudflare (sem sessão só chega ao login — dito ao utilizador); migration entregue ao utilizador para aplicar; docs `docs/19-obras.md`; CLAUDE.md/README atualizados.
