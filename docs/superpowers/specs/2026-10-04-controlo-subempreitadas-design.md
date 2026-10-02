# Obras — Controlo de Subempreitadas e Auto-Medição (desenho)

> 2026-10-04. Pedido da Direção: Obras como um módulo único que já absorve as subempreitadas, com todos os dados
> cruzados; auto-medição blindada (fraude, jurídico, fiscal), evidências reais e painel executivo. Classificação:
> arquitetural. Decisões tomadas sem perguntas, como autorizado. Base: `docs/superpowers/specs/2026-10-03-obras-completo-design.md`
> e a migration `20261003000000_obras_completo.sql` (tem de estar aplicada antes desta).

## 1. Intenção, adaptação a Portugal e o que fica de fora
**Objetivo:** o CEO (mesmo noutro país) sabe, por subempreiteiro e por obra, o que foi contratado, medido, glosado, pago e
o que falta pagar; ninguém paga mais do que o orçamento de controlo permite nem sem provas e documentos em dia.

**Adaptação (o pedido veio com termos brasileiros):** CND/FGTS/INSS → certidão de não dívida à **Segurança Social** e às
**Finanças (AT)**, **alvará/título IMPIC**, **seguro de acidentes de trabalho** e de **responsabilidade civil**. FVS → **ficha de
verificação** (estilo PPI). "Nota fiscal" → **fatura** do subempreiteiro: **o ERP não emite faturas, apenas guarda** as que os subempreiteiros emitem (número, data, valor e o ficheiro PDF/foto num bucket privado) e assinala, sem bloquear, se o valor diferir do aprovado; IVA/autoliquidação ficam com a contabilidade — os valores do módulo são **sem IVA**. Retenção de garantia 5 % (prática
corrente em PT; configurável). A base legal (responsabilidade solidária do dono de obra, etc.) deve ser confirmada pelo jurista da
ENCIVIL; o sistema só impõe as regras abaixo, todas configuráveis.

**Fica de fora (YAGNI, dito ao utilizador):** portal próprio do subempreiteiro (não há papel/login para externos: o pedido de
medição é registado pela equipa em nome dele, guardando a quantidade **pedida** e a **verificada**); modelos de checklist por
especialidade (há uma lista padrão editável); emissão de fatura/SAF-T; deteção de GPS falso (impossível no browser — mitigado por
câmara obrigatória, geofence, precisão, hora do servidor, hash anti-reutilização e verificação do engenheiro).

## 2. Modelo de dados (duas migrations, por esta ordem)
Convenções: RLS ativa; **GRANT** só `SELECT` nas tabelas novas (escrita por RPC `SECURITY DEFINER` com `SET search_path = public`);
`REVOKE EXECUTE … FROM PUBLIC, anon`; `GRANT EXECUTE … TO authenticated`; papéis via `pode_gerir_obras()` (admin, gestor),
`pode_medir_obras()` (admin, gestor, medicoes), `pode_ler_obras()`, `pode_ver_obra(obra)`; eventos com `_obra_evento` e
`audit_log` nas decisões financeiras. Constantes nunca no código: vêm de `subs_config`.

### Migration A — `20261004000000_subs_orcamento_docs_evidencias.sql`
**`subs_config`** (singleton `id boolean PK default true CHECK (id)`): `retencao_padrao_pct numeric(5,2) default 5`,
`prazo_pagamento_dias int default 30`, `alcada_gestor_ate numeric(14,2) default 10000` (valor certificado do auto até ao qual o gestor
pode aprovar), `docs_obrigatorios text[] default '{CERT_SS,CERT_AT,SEGURO_AT,ALVARA}'`, `bloquear_pagamento_sem_docs bool default true`,
`exigir_fatura_para_pagar bool default true`, `aviso_validade_dias int default 30`, `raio_padrao_m int default 300`,
`precisao_max_m int default 50`, `foto_idade_max_min int default 120`, `min_fotos_verificacao int default 2`,
`checklist_padrao jsonb default [5 itens PT: "Execução conforme projeto e caderno de encargos", "Quantidades confirmadas em obra",
"Qualidade do acabamento / ensaios, quando aplicável", "Segurança: EPI e proteções coletivas", "Limpeza e arrumação da frente de trabalho"]`,
`atualizado_em, atualizado_por`. **RPC** `subs_config_ler() → subs_config` (pode_ler_obras) e
`subs_config_guardar(p_cfg jsonb) → void` (**só admin**; valida intervalos; audit_log).

**`obra_orcamento_itens`** (EAP + orçamento de controlo da obra): `id, obra_id FK, codigo text NOT NULL` (EAP, ex. `02.03`; capítulo = prefixo
antes do 1.º ponto), `descricao NOT NULL, unidade NOT NULL, quantidade numeric(14,3) ≥0, preco_unitario numeric(14,4) ≥0` (custo orçado),
`tolerancia_pct numeric(5,2) default 0 (0–20), ativo bool default true, criado_em, atualizado_em`; `UNIQUE (obra_id, codigo)`.
**RPC** `obra_orcamento_guardar_item(p_obra_id, p_id uuid, p_codigo, p_descricao, p_unidade, p_quantidade, p_preco_unitario, p_tolerancia_pct) → uuid`
e `obra_orcamento_apagar_item(p_id) → void` (recusa se houver artigos ligados) — `pode_gerir_obras()`.
`obra_orcamento_resumo(p_obra_id) → TABLE(item_id, codigo, descricao, unidade, orcado_qtd, orcado_valor, contratado_qtd, contratado_valor,
medido_qtd, medido_valor, saldo_qtd, saldo_valor, perc_contratado, perc_medido, n_artigos, estado 'ok'|'atencao'|'excedido')`
(`pode_ver_obra`): contratado = artigos de contratos **validados**; medido = linhas de autos **validados**; `excedido` se contratado_qtd >
orcado_qtd×(1+tol); `atencao` ≥ 90 %.
**`subempreiteiro_artigos`** (ALTER): `orcamento_item_id uuid NULL FK obra_orcamento_itens`. Escrita direta mantém-se (rascunho);
trigger `BEFORE INSERT/UPDATE` exige que o item pertença à **mesma obra** do contrato.
**`validar_subempreiteiro`** (CREATE OR REPLACE, mantém tudo o que já faz): **bloqueia** se, para qualquer item de orçamento ligado, a
quantidade contratada (validados + este) > orçada × (1 + tolerância) — mensagem `Excede o orçamento de controlo em <codigo>: contratado X, orçado Y`.
Artigos sem ligação são permitidos (dados antigos) mas `sub_painel` devolve `artigos_sem_eap` e a UI avisa.

**`sub_documentos`**: `id, subempreiteiro_id FK, tipo CHECK IN ('CERT_SS','CERT_AT','ALVARA','SEGURO_AT','SEGURO_RC','OUTRO'), referencia text,
emitido_em date, validade date NULL, path text NOT NULL, nome text, criado_por default auth.uid(), criado_em`. Ficheiro no bucket **privado**
`obras-contratos`, caminho `<subempreiteiro_id>/doc-<ts>.<ext>` (estender `contrato_obra_valido` e as policies de storage para `doc-` **e** `fatura-<ts>.<ext>`; ≤ 20 MB).
**RPC** `sub_doc_registar(p_sub_id, p_tipo, p_referencia, p_emitido_em, p_validade, p_path, p_nome) → uuid` (`pode_escrever('subempreitadas')`),
`sub_doc_remover(p_id)` (`pode_gerir_obras()`), `sub_docs_estado(p_sub_id) → TABLE(tipo, obrigatorio bool, estado 'ok'|'a_expirar'|'expirado'|'em_falta',
validade date, dias_restantes int, doc_id uuid, referencia text)` — usa o documento **mais recente por tipo**; obrigatórios = `subs_config.docs_obrigatorios`;
documento sem validade conta como `ok`; `a_expirar` ≤ `aviso_validade_dias`. Função interna `_sub_docs_bloqueio(p_sub_id) → text[]` (tipos em falta/expirados).

**`auto_evidencias`** (imutável): `id, auto_id FK, linha_id uuid NULL, path text UNIQUE, legenda, latitude numeric(9,6), longitude numeric(9,6),
precisao_m numeric(8,2), tirada_em timestamptz NOT NULL` (relógio do telemóvel), `enviada_em timestamptz NOT NULL default now()` (servidor),
`hash_sha256 text NOT NULL UNIQUE`, `distancia_obra_m numeric(10,1), dentro_obra bool, precisao_ok bool, valida bool, motivo_invalida text,
autor_id default auth.uid()`. Sem UPDATE/DELETE; apagar só pela RPC enquanto `workflow = 'rascunho'`.
**Função** `_distancia_m(lat1,lon1,lat2,lon2) → numeric` (haversine, IMMUTABLE).
**RPC** `auto_registar_evidencia(p_auto_id, p_path, p_legenda, p_lat, p_lon, p_precisao_m, p_tirada_em timestamptz, p_hash, p_linha_id) → jsonb`
`{id, valida, dentro_obra, distancia_m, precisao_ok, motivo}` (`pode_medir_obras`; auto em `rascunho`/`submetido`). Rejeita (erro): caminho fora de
`^<obra_id>/autos/<ts>-<rand>.<ext>`; `p_tirada_em` no futuro (> +2 min) ou mais velha que `foto_idade_max_min` face ao servidor; hash repetido
(`Esta fotografia já foi usada noutro registo`). Marca (não rejeita) `valida=false` se faltar GPS, `precisao_m > precisao_max_m`, obra sem
coordenadas (`motivo_invalida='obra_sem_coordenadas'`) ou distância > `coalesce(obras.geofence_raio_m, raio_padrao_m)` ao centro `obras.latitude/longitude`.
`auto_apagar_evidencia(p_id) → void`. `auto_evidencias_lista(p_auto_id) → SETOF auto_evidencias` (`pode_ver_obra`).

### Migration B — `20261004010000_subs_medicao_workflow_glosas_painel.sql`
**`autos_medicao`** (ALTER): `workflow text NOT NULL default 'rascunho' CHECK IN ('rascunho','submetido','verificado','validado')` (backfill:
`validado` onde `estado='validado'`), `submetido_por/em, verificado_por/em, valor_glosado numeric(14,2) NOT NULL default 0 CHECK (valor_glosado >= 0
AND valor_glosado <= valor_periodo), data_vencimento date, fatura_numero text, fatura_data date, fatura_valor numeric(14,2), fatura_path text, fatura_nome text, fatura_registada_em timestamptz, excecao_motivo text`.
Invariante: `estado='validado' ⇔ workflow='validado'`. **Certificado = `valor_periodo − valor_glosado`**.
**`auto_linhas`** (ALTER): `qtd_pedida numeric(14,3) NULL ≥0` (reclamada pelo subempreiteiro), `justificacao text NULL` (obrigatória em extras).
**Imutabilidade:** trigger `BEFORE UPDATE OR DELETE` em `autos_medicao` e `auto_linhas`: se `OLD.workflow <> 'rascunho'` (para linhas: o auto-pai) só
passa quando a transação define `set_config('app.auto_rpc','on',true)` (feito pelas RPCs deste módulo). A RLS atual (`estado='rascunho'`) mantém-se.
**`auto_verificacoes`**: `id, auto_id FK, ordem int, item text, resultado text CHECK IN ('pendente','conforme','nao_conforme','na') default 'pendente',
observacao text, verificado_por, verificado_em`; `UNIQUE (auto_id, ordem)`.
**`auto_glosas`**: `id, auto_id FK, linha_id NULL, motivo CHECK IN ('QUALIDADE','QUANTIDADE_NAO_CONFIRMADA','ATRASO','SEGURANCA','DOCUMENTACAO','OUTRO'),
descricao NOT NULL, valor numeric(14,2) > 0, estado CHECK IN ('aplicada','levantada') default 'aplicada', ocorrencia_id uuid NULL FK sub_ocorrencias,
criado_por, criado_em, levantada_por, levantada_em, motivo_levantamento`. `autos_medicao.valor_glosado` = Σ glosas `aplicada` (mantido pelas RPCs).

**Fluxo de estados (RPCs; todas gravam evento/audit):**
| RPC | Quem | Pré-condições (erro em pt-PT se falhar) | Efeito |
|---|---|---|---|
| `auto_submeter(p_auto_id)` | `pode_medir_obras` | contrato `validado`; `workflow='rascunho'`; ≥ 1 linha; data não futura; por linha de artigo: preço = preço do contrato, `quantidade ≤ coalesce(qtd_pedida, quantidade)`, acumulado (autos `submetido`/`verificado`/`validado` + este) ≤ `quantidade_prevista`; extras com `justificacao`; unitário: `valor_periodo = Σ qtd×preço` (±0,01); global: `percentagem_periodo>0`, acumulado ≤ 100 e `valor_periodo = pct×valor_global/100` (±0,01) | `submetido` |
| `auto_iniciar_verificacao(p_auto_id)` | `pode_medir_obras` | `submetido`; idempotente | cria linhas em `auto_verificacoes` a partir de `checklist_padrao` |
| `auto_registar_verificacao(p_auto_id, p_itens jsonb)` | `pode_medir_obras` | `[{ordem, resultado, observacao}]`; `nao_conforme` exige observação | atualiza itens |
| `auto_verificar(p_auto_id, p_excecao_motivo text default null)` | `pode_medir_obras` | `submetido`; sem itens `pendente`; ≥ `min_fotos_verificacao` evidências `valida`; **ou** `p_excecao_motivo` (≥ 10 car.) só se **admin** (grava `excecao_motivo`, audit) | `verificado` |
| `auto_glosar(p_auto_id, p_motivo, p_descricao, p_valor, p_linha_id, p_ocorrencia_id)` | `pode_medir_obras` | `workflow <> 'validado'`; Σ glosas ≤ `valor_periodo` | cria glosa; recalcula `valor_glosado` |
| `auto_levantar_glosa(p_glosa_id, p_motivo)` | `pode_gerir_obras` | `workflow <> 'validado'`; motivo ≥ 5 car. | glosa `levantada` |
| `auto_devolver(p_auto_id, p_motivo)` | `pode_medir_obras` | `submetido`/`verificado`; motivo ≥ 5 car. | volta a `rascunho`; limpa verificação |
| **`auto_aprovar(p_auto_id, p_excecao_docs_motivo text default null)`** | gestor/admin (alçada) | `verificado`; certificado > 0; **alçada**: se há extras **ou** certificado > `alcada_gestor_ate` só `admin`; **segregação**: aprovador ≠ `created_by` (admin isento); documentos obrigatórios em dia (`_sub_docs_bloqueio`) **ou** `p_excecao_docs_motivo` (≥ 10 car., só admin, audit) | `estado='validado'`, `workflow='validado'`, `validado_por/em`, `data_vencimento = hoje + prazo_pagamento_dias` |
| `validar_auto(p_id)` | (legado) | passa a **delegar em `auto_aprovar`** — a cadeia não se contorna | idem |
| `auto_registar_fatura(p_auto_id, p_numero, p_data, p_valor, p_path, p_nome)` | `pode_gerir_obras` | `validado`; número não vazio; valor > 0; ficheiro no bucket privado `obras-contratos`, caminho `<subempreiteiro_id>/fatura-<ts>.<ext>` (PDF/imagem ≤ 20 MB) | **guarda** a fatura do subempreiteiro (pode ser substituída antes do pagamento; histórico no evento) |
| `marcar_auto_pago` (CREATE OR REPLACE) | admin, gestor | `validado`; **fatura guardada** (com ficheiro) se `exigir_fatura_para_pagar` — o valor da fatura **não bloqueia**: `sub_painel`/UI marcam "valor da fatura diverge do aprovado" como aviso; **sem ocorrência de gravidade `alta` (tipos QUALIDADE/SEGURANCA) por resolver** no subempreiteiro; documentos em dia ou exceção admin (`p_excecao_motivo`) | `pago` |
Assinaturas de `marcar_auto_pago`: `(p_auto_id uuid, p_referencia text default null, p_excecao_motivo text default null)`.
**Retenção e pagamento:** retenção = `(valor_periodo − valor_glosado) × percentagem_retencao / 100`; a pagar = certificado − retenção.
**`sub_libertar_retencao(p_sub_id, p_valor, p_motivo, p_obs)`** (`pode_gerir_obras`): total libertado ≤ retenção acumulada; bloqueia com ocorrência `alta`
por resolver; escreve em `liberacoes_retencao` (que **perde** o INSERT direto para `authenticated`). `percentagem_retencao` de novas contratações: default
na UI = `retencao_padrao_pct`.

**Métricas (CREATE OR REPLACE de `_subs_metricas`, `sub_painel`, `subs_resumo`):** `executado` passa a ser Σ **certificado** dos autos validados;
a convenção `pago + por_pagar + retencao = executado` mantém-se. Novos campos em `sub_painel`: `glosado, taxa_glosa_pct, em_aprovacao_n, em_aprovacao_valor,
progresso_fisico_pct` (do último auto), `desvio_fisico_financeiro_pp` (`executado_pct − progresso_fisico_pct`), `retencao_libertada, artigos_sem_eap, docs_estado`
('ok'|'a_expirar'|'critico'), `bloqueios text[]`. A saúde passa a considerar documentos críticos e desvio > 10 pp (motivos em pt-PT).
**`subs_painel_ceo(p_obra_id uuid default null) → jsonb`** (`pode_ler_obras`; null = todas as obras ativas): `{ totais{contratado, orcado_subempreitadas, certificado, pago,
por_pagar, retencao_acumulada, retencao_libertada, em_aprovacao_valor, em_aprovacao_n, glosado, taxa_glosa_pct}, por_sub[{sub_id, nome, obra_id, obra_nome, contratado,
orcado_ligado, certificado, executado_pct, progresso_fisico_pct, desvio_pp, glosado, taxa_glosa_pct, ocorrencias_altas, docs_estado, docs_em_falta text[], por_pagar, saude}],
passivo_documental{subs_com_pendencia, valor_por_pagar_em_risco}, alertas[{tipo, sub_id, obra_id, texto, gravidade}] }`.
**`subs_fluxo_caixa(p_obra_id uuid default null, p_semanas int default 12) → TABLE(semana_inicio date, aprovado numeric, em_aprovacao numeric, n_autos int)`:
`aprovado` = a pagar dos autos validados não pagos por `data_vencimento` (vencidos entram na 1.ª semana); `em_aprovacao` = estimativa (certificado − retenção) dos autos
`submetido`/`verificado` à data `hoje + prazo_pagamento_dias`.
Eventos novos em `obra_eventos`: `AUTO_SUBMETIDO, AUTO_VERIFICADO, AUTO_DEVOLVIDO, AUTO_GLOSADO, AUTO_FATURA, AUTO_PAGO, SUB_DOC, ORCAMENTO_ITEM`.

## 3. Regras anti-fraude (resumo para o CEO)
1. Ninguém contrata acima do orçamento de controlo (quantidade por item EAP, com tolerância definida).
2. Ninguém mede mais do que o contratado, mais do que o subempreiteiro pediu, nem altera preços do contrato.
3. Uma medição só avança com provas: fotografia **tirada na hora**, dentro do raio da obra, com precisão aceitável, nunca reutilizada, e checklist assinado.
4. Quem cria não aprova (exceto o admin); acima de 10 000 € (configurável) ou com trabalhos a mais, só o CEO.
5. Não se paga sem a fatura do subempreiteiro guardada (a divergência de valor fica assinalada), sem documentos legais em dia, nem com problema grave de qualidade/segurança por resolver; as exceções são só do admin, com motivo e registo.
6. Após aprovação, o auto é imutável; a retenção só se liberta até ao valor retido.

## 4. Frontend (`src/features/obras/**` — um módulo, sem importar de outros)
- `db.ts`: tipos de todas as tabelas/RPCs acima (`obrasDb`), incluindo as RPCs legadas usadas (`validar_auto`, `marcar_auto_pago`, `criar_auto_rpc`).
- `lib/medicao.ts` (puro): `certificado`, `retencao`, `aPagar`, `saldoArtigo`, `validarLinhasAuto`, `alcadaNecessaria`, `bloqueiosPagamento`; `lib/geo.ts`: `distanciaM`, `avaliarEvidencia`;
  `lib/compliance.ts`: `estadoDocumento`, `estadoDocs`; `lib/semaforo.ts` se preciso. Espelham o SQL e têm testes com os mesmos casos.
- **Orçamento (EAP)** — separador novo `Orçamento` na ficha da obra (`ficha/Orcamento.tsx`): tabela por capítulo, orçado × contratado × medido, estado, adicionar/editar (gestor/admin).
  No formulário do contrato, cada artigo escolhe o item EAP com aviso imediato de excesso.
- **Auto** (`AutoFormPage`/`AutoDetailPage`): colunas *Pedida / Verificada / Acumulada / Saldo*; passos visíveis (Rascunho → Submetido → Verificado → Aprovado → Faturado → Pago) com **os bloqueios
  explicados em texto**; botões por papel; verificação (checklist); **evidências** (`EvidenciaCapture`: só câmara, `getCurrentPosition` de alta precisão, hash SHA-256, pré-visualização "Dentro da obra ✓ / Fora ✗ (x m)");
  glosas; fatura e pagamento. Offline: se não houver rede, as fotos ficam pendentes e a UI diz que é preciso rede para guardar (a hora do servidor é a prova).
- **Documentos** — separador no detalhe do subempreiteiro: lista por tipo com selo (em dia / a expirar / expirado / em falta), carregar ficheiro (URL assinada para ver).
- **Painel do CEO** — topo de `/obras/subempreitadas` (e na aba Subempreitadas da ficha, filtrado pela obra): KPIs, tabela por subempreiteiro (desvio físico-financeiro, taxa de glosa, documentos), passivo documental,
  fluxo de caixa 12 semanas (barras SVG simples), alertas ordenados por gravidade. **Configuração** (só admin) num diálogo.
- Compatibilidade: `legacy/autosService`/`subempreiteirosService`/`retencaoService` e `custos`/`dashboard`/`contabilidade` passam a usar **certificado** (`valor_periodo − valor_glosado`);
  a libertação de retenção passa a usar a RPC. PDF do auto: glosas, fatura, aprovadores, nº de evidências válidas e retenção sobre o certificado.

## 5. Testes e entrega
- BD (pg-harness, sem PostGIS — por isso a geofence é haversine em SQL): `supabase/tests/subs-controlo-a.test.mjs` (config, EAP, excesso na validação, documentos, evidências) e
  `subs-controlo-b.test.mjs` (workflow, cada pré-condição, alçada, segregação, glosas, fatura, pagamento, retenção, métricas, painel CEO, fluxo de caixa, grants/RLS por papel incl. `mecanico`/`motorista`/`leitura`).
  Teste de mutação manual nas regras críticas (alçada, excesso de quantidade, hash repetido, geofence, bloqueio de pagamento). Os testes existentes de `obras-completo` e `abastecimento`/`frota` continuam verdes
  (ajustar os que usam `validar_auto` direto).
- Vitest: libs puras, serviços (mock), componentes principais, contrato RPC×SQL estendido às duas migrations novas e a `legacy/`.
- `npm run typecheck` 0, `npm test`, `npm run build`; agent-browser em local (e Cloudflare quando houver deploy); sem sessão só chega ao login — dito ao utilizador.
- Entrega: migrations A e B **entregues ao utilizador** (SQL Editor, por esta ordem, depois da `20261003000000`); só então publicar o frontend. Docs: `docs/19-obras.md`, `docs/20-subempreitadas-controlo.md`, CLAUDE.md.
