# A1 — Base de dados: segurança

Cobri, sobre a BD local `supabase_db_encivil-checkup` (Postgres 17 com as 92 migrations aplicadas, definição VIGENTE):
RLS e policies de todas as 69 tabelas e 2 views de `public` (`pg_policies`, `relrowsecurity`, `reloptions`), GRANTs de
tabela/coluna/sequência a `anon` e `authenticated`, as ~190 funções `SECURITY DEFINER` (guarda, `search_path`, EXECUTE
de anon/authenticated, SQL dinâmico), triggers de imutabilidade, `profiles`/`promover_role`, Storage (buckets e policies
de `storage.objects`), `pg_cron`/`pg_net`/schema `privado`, MFA (`auth_role`/`mfa_em_falta`/`seguranca_config`).
Cenários provados com transações `BEGIN … ROLLBACK` a simular JWT (`request.jwt.claims`) por papel.
NÃO coberto: o estado real da produção (GRANTs por omissão do Supabase hospedado, `enable_signup`, jobs `cron` ativos,
valor de `app.edge_function_secret`); Edge Functions e frontend só onde tocam na BD.

---

### A1-01 Qualquer conta lê as faltas de todos, incluindo justificações de saúde (RGPD art. 9)
- Severidade: Crítica
- Onde: `supabase/migrations/20260916000000_fase2_horarios.sql:227` (`faltas_sel … USING (true)`); idem `resumo_sel`
  em `:215` (horas efetivas/desvio de cada colaborador por dia).
- Evidência: policy SELECT `TO authenticated USING (true)`; `authenticated` tem SELECT em todas as colunas de `faltas`
  (`justificacao_texto`, `dado_saude`, `comprovativo_key`). Provado: utilizador `motorista` (aal1), com uma falta
  `JUSTIFICADA`, `dado_saude=true`, `justificacao_texto='Internamento - cirurgia'` →
  `select justificacao_texto, dado_saude from faltas` devolve a linha. Via API: `GET /rest/v1/faltas?select=*` com
  qualquer sessão (motorista, mecânico, leitura). O frontend até comenta que `comprovativo_key` é "dado de saúde RGPD"
  (`src/features/horarios/services/faltasService.ts:28`), mas a BD entrega-o a todos. A rota `/colaboradores` é só
  `gestor` na UI — a RLS não acompanha.
- Correção proposta: `faltas_sel` e `resumo_sel` → `USING (auth_role() IN ('admin','gestor') OR colaborador_id IN
  (SELECT id FROM colaboradores WHERE user_id = auth.uid()))`. Remover as policies duplicadas antigas
  (`assiduidade_sel`/`assiduidade_write` em `resumo_assiduidade_dia`, ver A1-12).
- Teste que prova: `rh-privacidade.test.mjs` › "motorista não lê faltas de outro colaborador" — como motorista,
  `SELECT count(*) FROM faltas WHERE colaborador_id = <outro>` = 0; o próprio colaborador vê a sua; gestor vê todas.

### A1-02 Contactos e notas de todos os colaboradores legíveis por qualquer conta
- Severidade: Alta
- Onde: `supabase/migrations/20260730100000_fase0_colaboradores.sql:21-23` (`colab_select USING (true)`) +
  `20261008030000_seguranca_colaboradores_nif.sql:21` (só o `nif` saiu do GRANT de coluna).
- Evidência: `authenticated` tem SELECT em `telemovel, email, notas, foto_path, user_id`. Provado como `motorista`:
  `select nome, telemovel, email, notas from colaboradores` → `Joao|912345678|joao@x.pt|baixa médica`. Os únicos
  consumidores fora de RH só pedem `id, nome` (`frotaService.ts:139,231`, `obrasService.ts:197`,
  `picagensService.ts:202`); `SELECT_COLABORADOR` com contactos só é usado no ecrã RH (`RoleGuard require="gestor"`).
  `notas` é texto livre (pode ter dados de saúde/disciplinares).
- Correção proposta: mesmo padrão do NIF — `REVOKE SELECT (telemovel, email, notas) ON colaboradores FROM authenticated`
  e expor por RPC `SECURITY DEFINER` (admin/gestor ou o próprio), ou view `security_invoker` só p/ admin/gestor.
  Publicar o site primeiro (ele faz `select(SELECT_COLABORADOR)`).
- Teste que prova: `seguranca-colaboradores.test.mjs` › "motorista não lê telemovel/email/notas" — `SELECT telemovel
  FROM colaboradores` como motorista lança `42501`; gestor obtém via RPC.

### A1-03 Aprovador de combustível contorna o MFA obrigatório (e pode nomear outros aprovadores)
- Severidade: Alta
- Onde: `supabase/migrations/20260930010000_abastecimento_v2.sql:48` (`pode_aprovar_combustivel`), `:65`
  (`definir_aprovador_combustivel`), `:100` (`definir_preco_combustivel`); MFA em `20261008010000_seguranca_mfa.sql`
  (`mfa_em_falta` só degrada `auth_role()`).
- Evidência: `pode_aprovar_combustivel()` testa só `EXISTS (comb_aprovadores WHERE user_id = auth.uid())`, sem passar por
  `auth_role()`. Provado com `mfa_obrigatorio=true`, gestor aprovador em sessão `aal1` (só palavra-passe):
  `auth_role()='leitura'` mas `pode_aprovar_combustivel()=true`; `definir_aprovador_combustivel(<motorista>, true)` e
  `definir_preco_combustivel('gasoleo', 0.5)` passam. Também `autorizar_abastecimento`, `rejeitar_abastecimento`,
  `cancelar/concluir_pedido_abastecimento`, `parar_bomba` e upload em `combustivel-taloes`. Cenário: palavra-passe de um
  gestor-aprovador vaza → atacante torna aprovador uma conta de motorista que controla → esta autoriza os próprios
  pedidos (não há bloqueio de auto-aprovação) → combustível levantado. Exatamente o que o MFA devia impedir.
  Secundário, mesmo padrão: `_autor_designado` só exclui `'', mecanico, motorista`, por isso um gestor degradado a
  `leitura` continua a escrever relatórios de obra onde é autor designado.
- Correção proposta: em `pode_aprovar_combustivel` acrescentar `AND NOT public.mfa_em_falta()`; em `_autor_designado`
  usar `public.auth_role()` já degradado (excluir também quando `mfa_em_falta()`).
- Teste que prova: `seguranca-mfa.test.mjs` › "aprovador aal1 com MFA obrigatório não aprova" —
  `pode_aprovar_combustivel()` = false e `definir_aprovador_combustivel` lança `42501`/exceção; com `aal2` = true.

### A1-04 Colaborador insere a própria picagem já `AUTORIZADA`, com hora e validação à escolha
- Severidade: Alta
- Onde: `supabase/migrations/20261020130000_rh_picagens_seguranca.sql:5-12` (policy + `GRANT … INSERT` de tabela inteira).
- Evidência: o `WITH CHECK` só restringe `colaborador_id`; todas as colunas são inseríveis e não há trigger em
  `picagens`. Provado como `leitura` ligado a um colaborador: `INSERT INTO picagens(colaborador_id, obra_id, tipo,
  timestamp_dispositivo, resultado, hora_final_validada, validada_em) VALUES (<o próprio>, <obra>, 'ENTRADA',
  '2026-10-20 06:00', 'AUTORIZADA', '2026-10-20 06:00', now())` → aceite. Resultado: picagem retroativa, fora do
  geofence, sem passar por `registar_picagem_geofence` nem pela validação do gestor; aparece como autorizada
  (assiduidade → salário). O próprio site usa este INSERT direto (`picagensService.ts:58-90`), por isso a porta está aberta.
- Correção proposta: trigger `BEFORE INSERT` em `picagens` que, se `auth_role() NOT IN ('admin','gestor')`, força
  `resultado='PENDENTE_VALIDACAO'`, `timestamp_servidor=now()`, e anula `hora_final_validada, validada_por,
  validada_em, justificacao, distancia_geofence_m`.
- Teste que prova: `picagens.test.mjs` › "colaborador não cria picagem AUTORIZADA" — INSERT como colaborador com
  `resultado='AUTORIZADA'` grava `PENDENTE_VALIDACAO` e `validada_por IS NULL`.

### A1-05 `spatial_ref_sys` (PostGIS em `public`) gravável por `anon` — apagar o SRID 4326 parte o geofence
- Severidade: Alta
- Onde: `supabase/migrations/20260916200000_fase5_geofence.sql:7` (`CREATE EXTENSION postgis` em `public`).
- Evidência: tabela sem RLS, `anon=arwdDxtm/supabase_admin`. Provado: `SET ROLE anon; DELETE FROM spatial_ref_sys
  WHERE srid=4326` → `DELETE 1`; a seguir `ST_Distance(…::geography, …)` → `ERROR: Cannot find SRID (4326) in
  spatial_ref_sys`. Via API: `DELETE /rest/v1/spatial_ref_sys?srid=eq.4326` só com a chave publicável →
  `registar_picagem_geofence` falha para todos até alguém repor a linha. Também permite INSERT de lixo sem limite.
  `postgres` não é dono e não consegue `REVOKE` (testado: "no privileges could be revoked").
  Por confirmar na produção (só leitura, SQL Editor): `select has_table_privilege('anon','public.spatial_ref_sys','DELETE')`.
- Correção proposta: `postgres` tem o privilégio TRIGGER: criar trigger `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH
  STATEMENT` que lança exceção quando `current_user IN ('anon','authenticated')` (testado: bloqueia o DELETE do anon).
  Alternativa de fundo: PostGIS no schema `extensions` (exige recriar colunas geography — mais arriscado).
- Teste que prova: teste de BD (Postgres real, PGlite não tem PostGIS) › "anon não altera spatial_ref_sys" —
  `DELETE` como anon lança exceção; `count(*) WHERE srid=4326` = 1.

### A1-06 Papel `armazem` cria artigo com stock inicial sem movimento
- Severidade: Média
- Onde: `supabase/migrations/20261020110000_armazem_integridade.sql:264-267` (revogou só UPDATE de `stock_atual`; o
  INSERT de tabela inteira ficou).
- Evidência: `authenticated` tem INSERT em todas as colunas de `produtos`, incluindo `stock_atual`; policy
  `produtos_insert_rbac` = `pode_escrever('armazem')`. Provado como `armazem`: `INSERT INTO produtos(codigo, nome,
  unidade, stock_atual, …) VALUES ('PX999','Cimento fantasma','un',500,…)` → aceite com 500 e 0 linhas em
  `movimentos_stock`. Viola "stock_atual só por movimentos" e os relatórios (calculados de movimentos) divergem do
  stock mostrado. `criar_produto` (RPC) já existe e é o caminho do site; o INSERT direto só serve o fallback antigo
  (`produtosService.ts:104`).
- Correção proposta: `REVOKE INSERT ON produtos FROM authenticated` e `GRANT INSERT (id, nome, categoria, unidade,
  stock_minimo, custo_unitario, observacoes, foto_path, localizacao, ativo)` — sem `stock_atual`/`codigo`.
- Teste que prova: `armazem.test.mjs` › "INSERT direto não define stock_atual" — `INSERT … stock_atual` como armazem
  lança `42501`.

### A1-07 Inventário de funções executáveis por anon não vê o que o Supabase real concede
- Severidade: Baixa
- Onde: `supabase/tests/seguranca.test.mjs:60-72`; `20260622000001_fix_profiles_privilege_escalation.sql:92`,
  `20261007100000_contabilidade_rh.sql:110`.
- Evidência: as migrations fazem só `REVOKE … FROM PUBLIC`; no Postgres do Supabase o `anon` tem GRANT explícito por
  omissão, que esse REVOKE não retira. BD local: `promover_role` e `contabilidade_mapa_assiduidade` têm `anon=X`.
  Ambas têm guarda interna (`auth_role()` vazio → exceção), por isso sem exploração hoje. Mas o teste (PGlite) lista
  só 5 funções e passa — está cego para esta classe de erro.
- Correção proposta: `REVOKE ALL … FROM PUBLIC, anon` nas duas; no harness PGlite simular o
  `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE TO anon` do Supabase para o inventário apanhar isto.
- Teste que prova: o inventário existente, com o default privilege simulado, falha antes da correção.

### A1-08 Qualquer conta faz upload ilimitado no bucket público `combustivel-taloes`
- Severidade: Baixa
- Onde: `foto_combustivel_valida` (`20260930010000_abastecimento_v2.sql`), ramo `NOT EXISTS (pedido com esse id)`.
- Evidência: o ramo para a foto de km antes de criar o pedido aceita qualquer UUID de pedido inexistente, para qualquer
  viatura ativa, de qualquer papel (`leitura`, `mecanico`…). Sem limite de quantidade → até 10 MB por ficheiro, servido
  publicamente. Abuso de armazenamento, não fuga de dados.
- Correção proposta: nesse ramo exigir `public._quem_pede()` com viatura atribuída = `(m.g)[1]` e/ou
  `rate_limit_consumir('upload_km:'||auth.uid(), 600, 20)`.
- Teste que prova: `storage.test.mjs` › "leitura não carrega talão de viatura que não é sua" — INSERT em
  `storage.objects` como leitura com caminho válido → recusado.

### A1-09 `handle_new_user` cria toda a conta nova como `gestor`
- Severidade: Baixa
- Onde: `supabase/migrations/20260929000000_seguranca_rpcs_storage.sql` (definição vigente), comentário diz "mínimo
  privilégio" mas `gestor` é o 2.º papel mais alto.
- Evidência: hoje só o `admin-utilizadores` cria contas e corrige o papel logo a seguir (apaga a conta se falhar). Mas
  se os registos públicos forem ligados por engano no Dashboard (o `config.toml` tem `enable_signup=false`, a produção
  não foi verificada), qualquer pessoa que se registe fica `gestor`.
- Correção proposta: papel por omissão `leitura` (a função Edge já faz `update … role` explícito em seguida).
- Teste que prova: `seguranca.test.mjs` › "conta nova nasce leitura" — INSERT em `auth.users` → `profiles.role='leitura'`.

### A1-10 `movimentos_stock` sem guarda contra TRUNCATE e com UPDATE/DELETE/TRUNCATE concedidos
- Severidade: Baixa
- Onde: `20261020110000_armazem_integridade.sql:258-260` (trigger só `BEFORE UPDATE OR DELETE`).
- Evidência: `authenticated=rwdD` (UPDATE, DELETE, TRUNCATE). UPDATE/DELETE: sem policy + trigger de imutabilidade →
  bloqueado para todos (incl. admin e papel de serviço). TRUNCATE ignora RLS e triggers de linha; não é alcançável pela API
  hoje, mas `audit_log` já tem `audit_log_sem_truncate` e este não.
- Correção proposta: `REVOKE UPDATE, DELETE, TRUNCATE ON movimentos_stock FROM authenticated` + trigger
  `BEFORE TRUNCATE` igual ao do `audit_log`.
- Teste que prova: `armazem.test.mjs` › "TRUNCATE movimentos_stock lança exceção" (como postgres).

### A1-11 Segredo das Edge Functions guardado como GUC de base de dados
- Severidade: Baixa
- Onde: `supabase/migrations/20260902070000_agendar_email_alertas.sql:27,43-44`; docs `22-seguranca-operacao.md:125`.
- Evidência: o job `enviar-email-alertas-diario` lê `current_setting('app.edge_function_secret')`, definido por
  `ALTER DATABASE … SET`. Qualquer sessão SQL lê um GUC (não é alcançável pela API REST, mas é visível a qualquer função
  SECURITY INVOKER futura ou ferramenta com acesso SQL). Os outros dois jobs já usam o padrão certo (`privado.segredos`,
  `privado.frota_push`, schema sem USAGE para anon/authenticated).
- Correção proposta: mover para `privado.segredos` e ler com subquery no comando do cron, como em `fase9_agendar_push_frota`.
- Teste que prova: grep-guarda › nenhuma migration nova usa `current_setting('app.` para segredos.

### A1-12 Policies duplicadas em tabelas de RH
- Severidade: Baixa
- Onde: `resumo_assiduidade_dia` (`assiduidade_*` de `20260902100000` e `resumo_*` de `20260916000000`),
  `horario_colaborador` (`hc_*`/`hcolab_*`), `tipos_falta` (`tfalta_*`/`tipos_falta_*`).
- Evidência: duas migrations da fase 2 com nomes diferentes deixaram pares de policies permissivas (OR entre elas). Hoje
  são equivalentes; corrigir uma (ex. A1-01) e esquecer a gémea mantém o furo aberto.
- Correção proposta: apagar o par antigo na mesma migration da A1-01.
- Teste que prova: `rh-privacidade.test.mjs` › "uma só policy SELECT por tabela de RH" (`pg_policies`).

---

## Verificado e OK
- RLS ativa em todas as 69 tabelas de `public` (só `spatial_ref_sys`, da extensão, sem RLS → A1-05). `anon` tem GRANTs
  largos em várias tabelas (local), mas nenhuma policy se aplica a `anon` com efeito (as de papel `public` exigem
  `auth.role()='authenticated'` ou `auth.uid()`).
- Views `alertas_detalhados` e `obra_fotos_todas`: `security_invoker` ligado; a segunda filtra ainda por `pode_ver_obra`.
- Funções SECURITY DEFINER: todas têm `search_path=public` (exceto `st_estimatedextent` da PostGIS). Sem SQL dinâmico com
  input (só `_auto_workflow`, `EXECUTE … USING`). Executáveis por anon: `audit_delete`, `handle_new_user` (triggers, não se
  chamam diretamente), `auth_role`, `pode_escrever`, `registar_login_falhado` (com tetos), `promover_role` e
  `contabilidade_mapa_assiduidade` (guardadas, A1-07). Funções internas (`_impl`, `_upsert_alerta`, `calcular_resumo_dia`,
  `pump_poll`, `rate_limit_consumir`, `*_push_autorizado`, `utilizadores_com_mfa`) sem EXECUTE para anon/authenticated.
- Das ~120 SECURITY DEFINER executáveis por `authenticated`, todas as de escrita têm guarda (`pode_escrever`,
  `pode_gerir/medir_obras`, `pode_relatar_obra`, `auth_role`, solicitante = `auth.uid()`). Sem guarda e inofensivas:
  `check_pend_rate_limit`, `estado_bomba`, `km_atual_veiculo`, `gerar_codigo_*`; `obra_visao`/`obras_painel` filtram por
  `pode_ver_obra` dentro de `_obra_resumos`; `validar_auto` delega em `auto_aprovar` (guardada).
- `profiles`: `authenticated` só tem UPDATE na coluna `nome`; sem GRANT de INSERT; `handle_new_user` não lê o papel de
  `raw_user_meta_data`; `promover_role` exige `auth_role()='admin'` (com MFA em falta → `leitura` → recusa), impede
  auto-despromoção e regista em `audit_log`.
- NIF: sem SELECT de coluna para `authenticated`; `colaborador_nif` devolve NULL a motorista (provado);
  `contabilidade_dados_laborais`/`colaboradores_dados_laborais` (IBAN, NISS) e `custo_hora_colaborador` só admin/gestor
  (admin no último).
- Imutabilidade: `movimentos_stock`, `audit_log` (incl. TRUNCATE) e `eventos_seguranca` com trigger que lança para
  qualquer papel; `audit_log`/`eventos_seguranca` só `SELECT` para admin; INSERT em `movimentos_stock` só por RPC
  (`registar_movimento*` com `pode_escrever('armazem')`).
- MFA: `definir_mfa_obrigatorio` exige `aal2` + admin; `auth_role()` degrada admin/gestor a `leitura` sem `aal2`.
- Storage: buckets privados (`faturas-fornecedor`, `obras-contratos`) com SELECT por papel; nenhum bucket público com
  policy de SELECT (sem listagem); INSERT de todos os buckets por função validadora de caminho + papel; sem policies de
  UPDATE (sem sobrescrita).
- `pg_cron`/`pg_net`: jobs de push leem segredos de `privado.*` (schema só `postgres`, RLS ativa); URL e chave
  publicável em claro são públicas por natureza. Sequências: só `nextval` via funções.
- `autos_medicao`: `estado_pagamento='pago'` só com `estado='validado'` (CHECK), mudanças fora do rascunho bloqueadas por
  `_trg_auto_imutavel`.
