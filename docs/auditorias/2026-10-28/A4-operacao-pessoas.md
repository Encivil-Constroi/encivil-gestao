# A4 — Operação e pessoas

Coberto: definição VIGENTE (BD local `supabase_db_encivil-checkup`, 92 migrations) das policies, GRANTs e funções de
abastecimento/bomba (`criar/autorizar/rejeitar/cancelar/concluir_pedido_abastecimento`, `ligar_bomba`, `parar_bomba`,
`pump_poll`, `_pump_fechar_sessao`, `foto_combustivel_valida`), frota (entregas, devoluções, manutenção, checklist,
atribuição), picagens (RLS + `registar_picagem_geofence`), colaboradores/NIF, faltas, EPIs/formações, horários e
`calcular_resumo_dia`, alertas, push, livro de obra e relatórios diários; serviços e hooks de
`src/features/{combustivel,frota,picagens,colaboradores,epis,horarios,alertas,livro-obra}` e `ReportsPage`.
NÃO coberto: Edge Functions em profundidade (só `pump-status` e a parte de push de `notificar-abastecimento`), o
estado real de buckets/policies criados à mão no Dashboard de produção, e nada foi executado contra dados (análise
estática + catálogo da BD local; nenhuma escrita).

### A4-01 Colaborador grava as próprias picagens já "AUTORIZADA", com hora e carimbo de servidor à escolha
- Severidade: Alta
- Onde: `supabase/migrations/20261020130000_rh_picagens_seguranca.sql:6-12` (policy `picagens_insert` + `GRANT INSERT` à tabela inteira); `src/features/picagens/services/picagensService.ts:58-95` (INSERT direto)
- Evidência: a policy só verifica `colaborador_id IN (… user_id = auth.uid())`; não há trigger em `picagens` e o GRANT INSERT é de tabela (todas as colunas). Qualquer conta com ficha de colaborador (motorista, mecanico, leitura…) pode fazer `POST /rest/v1/picagens` com `{colaborador_id: <o seu>, obra_id: X, tipo:'ENTRADA', timestamp_dispositivo:'2026-10-27T07:00:00Z', timestamp_servidor:'2026-10-27T07:00:05Z', resultado:'AUTORIZADA', validada_por:<uuid do gestor>, hora_final_validada:…}` → a linha entra já autorizada, com hora retroativa, carimbo "do servidor" forjado e um validador falso. Isto contorna a geofence e a validação do gestor (a própria app usa este caminho quando não há GPS e para a fila offline).
- Correção proposta: trigger `BEFORE INSERT` que, para quem não é admin/gestor, força `resultado='PENDENTE_VALIDACAO'`, `timestamp_servidor=now()`, recalcula `desvio_relogio_s` e anula `validada_*`/`hora_*`/`posicao`/`distancia_geofence_m`; ou revogar INSERT direto e passar tudo por RPC.
- Teste que prova: `picagens.test.mjs` "colaborador não insere picagem AUTORIZADA" — como utilizador `motorista` com ficha, INSERT com `resultado='AUTORIZADA'` e `timestamp_servidor` antigo → linha guardada com `PENDENTE_VALIDACAO` e `timestamp_servidor≈now()` (ou erro 42501).

### A4-02 Faltas com dado de saúde e justificação legíveis por todos os papéis
- Severidade: Alta
- Onde: `supabase/migrations/20260916000000_fase2_horarios.sql:227` (`faltas_sel … USING (true)`)
- Evidência: `faltas` tem `justificacao_texto`, `dado_saude`, `comprovativo_key`, `estado`. O próprio serviço diz "dado de saúde RGPD" (`faltasService.ts:28`), e a UI só mostra RH a gestor (`routes.tsx:275`), mas a RLS deixa qualquer autenticado ler. Cenário: conta `leitura` ou `motorista` faz `GET /rest/v1/faltas?select=colaborador_id,justificacao_texto,dado_saude` → recebe as faltas de todos, com o motivo e se é de saúde.
- Correção proposta: `faltas_sel` → `auth_role() IN ('admin','gestor') OR colaborador_id IN (SELECT id FROM colaboradores WHERE user_id = auth.uid())`.
- Teste que prova: `rh.test.mjs` "leitura não lê faltas de outros" — SELECT como `leitura` devolve 0 linhas; como o próprio, devolve só as suas.

### A4-03 Contactos e notas de todos os colaboradores legíveis por qualquer papel
- Severidade: Alta
- Onde: `supabase/migrations/20261008030000_seguranca_colaboradores_nif.sql:18-22` (GRANT SELECT a todas as colunas menos `nif`) + `colab_select USING (true)`
- Evidência: só o NIF foi fechado. `telemovel`, `email`, `notas` (texto livre do RH) e `foto_path` continuam visíveis a `leitura`, `motorista`, `mecanico`, `armazem`, `medicoes`. A página `/picagens` (aberta a todos) até os descarrega: `PicagemPage.tsx:69` chama `useColaboradores(true)` com `SELECT_COLABORADOR`, que inclui `telemovel, email, notas`. Cenário: motorista abre /picagens → recebe telefone, email e notas de toda a empresa.
- Correção proposta: retirar `telemovel, email, notas` do GRANT de coluna para `authenticated` e servir por RPC/view com guarda (admin/gestor ou o próprio); `/picagens` e listas de escolha só pedem `id, nome`.
- Teste que prova: `rh.test.mjs` "motorista não lê telemovel/notas" — `SELECT telemovel FROM colaboradores` como `motorista` → erro 42501; `SELECT id, nome` continua a funcionar.

### A4-04 Horas efetivas são sempre 0: mapa para a contabilidade e custo de mão de obra errados
- Severidade: Alta
- Onde: `supabase/migrations/20260916000000_fase2_horarios.sql:114-162` (`calcular_resumo_dia`, vigente); consumidores `20261007100000_contabilidade_rh.sql:33` (`contabilidade_mapa_assiduidade`) e `_custos_consolidados_por_obra_impl`
- Evidência: `calcular_resumo_dia` grava `horas_efetivas = COALESCE(0,0)` ("F3 preencherá", nunca preenchido) e nunca preenche `obra_id`. Nenhuma outra função escreve `horas_efetivas` (procurado em todo o `pg_proc`). Resultado: o mapa de assiduidade exportado devolve `dias_trabalhados=0`, `horas_normais=0`, `dias_subsidio_alimentacao=0` para toda a gente; o custo de mão de obra por obra (`WHERE r.obra_id = p_obra_id`, `horas_efetivas * custo_normal`) é sempre 0 €; `AssiduidadePage` e `relatorios/PessoasSection` mostram 0 h efetivas. Dinheiro (subsídio, custo de obra) errado sem aviso.
- Correção proposta: calcular `horas_efetivas` (e `obra_id`) a partir das picagens AUTORIZADAS (pares ENTRADA/SAIDA, usando `hora_final_validada` quando existe, com pausas); até lá, avisar na exportação que as horas efetivas não são calculadas.
- Teste que prova: `assiduidade.test.mjs` "picagens autorizadas 08:00–17:00 dão 9 h efetivas" — inserir horário + 2 picagens, `calcular_resumo_dia(d)` → `horas_efetivas = 9` e `contabilidade_mapa_assiduidade` → `dias_trabalhados = 1`.

### A4-05 Um horário sobreposto faz falhar o resumo diário de TODOS os colaboradores
- Severidade: Alta
- Onde: `src/features/horarios/services/horariosService.ts:124-134` (`atribuirHorario` só faz upsert pela PK `(colaborador_id, valido_de)`); `calcular_resumo_dia` (`20260916000000_fase2_horarios.sql:114`)
- Evidência: atribuir um novo horário a partir de 01/11 a quem tem um horário com `valido_ate IS NULL` deixa dois intervalos abertos (nem a UI fecha o anterior, nem há restrição de exclusão). No dia seguinte o `JOIN horario_colaborador` devolve 2 linhas para o mesmo `(colaborador_id, data)` e o `INSERT … ON CONFLICT DO UPDATE` aborta com "ON CONFLICT DO UPDATE command cannot affect row a second time" → o cron `calcular-resumo-assiduidade` não grava nada para ninguém nesse dia (e nos seguintes, enquanto houver sobreposição).
- Correção proposta: ao atribuir, fechar a atribuição aberta (`valido_ate = valido_de - 1`) numa RPC, e `EXCLUDE USING gist (colaborador_id WITH =, daterange(valido_de, valido_ate, '[]') WITH &&)`; no cálculo, escolher uma atribuição por colaborador (`DISTINCT ON … ORDER BY valido_de DESC`).
- Teste que prova: `assiduidade.test.mjs` "horários sobrepostos" — duas atribuições abertas para o mesmo colaborador → `calcular_resumo_dia(d)` não falha e grava 1 linha por colaborador (ou a segunda atribuição é recusada).

### A4-06 Picagem por geofence aceita hora retroativa e fica autorizada
- Severidade: Média
- Onde: `_registar_picagem_geofence_impl` (`supabase/migrations/20260929000000_seguranca_rpcs_storage.sql:117`, impl vigente)
- Evidência: `p_timestamp_disp` vem do cliente e é gravado tal e qual; `resultado='AUTORIZADA'` só depende da posição. Cenário: trabalhador chega às 09:40 dentro da obra e chama a RPC com `p_timestamp_disp='…T07:30:00+01:00'` → ENTRADA às 07:30 já AUTORIZADA, sem passar pelo gestor (o `desvio_relogio_s` nem é calculado aqui).
- Correção proposta: calcular `desvio_relogio_s = now() - p_timestamp_disp` e só autorizar automaticamente se |desvio| ≤ 5 min; caso contrário `PENDENTE_VALIDACAO`.
- Teste que prova: `picagens.test.mjs` "geofence com hora 2 h atrás fica pendente" → `resultado = 'PENDENTE_VALIDACAO'`.

### A4-07 Papel `armazem` apaga pedidos de abastecimento em qualquer estado, incluindo com a bomba a correr
- Severidade: Média
- Onde: policy `pend_auth_delete` (`20260721000001_abastecimentos_pendentes.sql:90`, `pode_escrever('combustivel')`) e RPC `rejeitar_abastecimento_pendente` (`…:109`, `DELETE` sem filtro de estado)
- Evidência: quem decide pedidos são os `comb_aprovadores`, mas `armazem`/`gestor` sem ser aprovador pode `DELETE` um pedido `AUTORIZADO` com sessão de bomba aberta ou um `CONCLUIDO`. Com a sessão aberta, o "Terminei" do motorista (`parar_bomba(p_id)`) passa a dar "Sem permissão" (o pedido já não existe) e a bomba corre até ao fim dos `segundos_autorizados` (≥600 s), salvo paragem de emergência; num `CONCLUIDO` perde-se km, fotos e contadores (o abastecimento fica com `pedido_id = NULL`). Nenhum ecrã usa este DELETE nem a RPC (só aparecem em `types.ts`).
- Correção proposta: `DROP POLICY pend_auth_delete` e `DROP FUNCTION rejeitar_abastecimento_pendente` (ou restringir a `estado IN ('REJEITADO','CANCELADO')` e admin).
- Teste que prova: `combustivel.test.mjs` "armazem não apaga pedido autorizado" — DELETE como `armazem` afeta 0 linhas / RPC dá erro.

### A4-08 Alertas de EPI e de formação aparecem sem o nome do colaborador
- Severidade: Média
- Onde: `fn_epi_antes_inserir` / `fn_formacao_antes_inserir` (`20260916180000_fase4_epis_formacoes.sql:29`) + view `alertas_detalhados` (`20261020140000_views_sequencias.sql:4`)
- Evidência: as regras são criadas com `entidade_alvo='colaborador'` mas `entidade_id = NEW.id` (id da atribuição de EPI/formação). A view faz `LEFT JOIN colaboradores c ON c.id = a.entidade_id` → `entidade_nome` NULL. `AlertasPage.tsx:54`, `AlertasWidget.tsx:17` e o relatório de Pessoas mostram "—": o gestor vê "EPI a expirar" sem saber de quem.
- Correção proposta: na view, para `regra_tipo IN ('EPI_VALIDADE','FORMACAO_VALIDADE')`, juntar `atribuicoes_epi`/`formacoes_colaborador` para chegar ao colaborador (e pôr o tipo de EPI/formação em `entidade_detalhe`).
- Teste que prova: `alertas.test.mjs` "alerta de EPI tem nome" — atribuição a expirar + `avaliar_regras_alerta()` → `alertas_detalhados.entidade_nome = 'Nome do colaborador'`.

### A4-09 Listas e relatórios cortados a 1000 linhas sem aviso
- Severidade: Média
- Onde: `src/app/pages/ReportsPage.tsx:1092` (`listarAbastecimentos()` sem filtro, todo o histórico); `src/features/combustivel/services/pedidosService.ts:178-181` (`.limit(10_000)` mas `max_rows = 1000` em `supabase/config.toml:18`); `src/features/horarios/services/assiduidadeService.ts:49-65` (mês × todos os colaboradores); `src/app/pages/relatorios/dados.ts:31` (resumo do período); `faltasService.ts:56` (todas as faltas)
- Evidência: o PostgREST devolve no máximo 1000 linhas. Relatório de combustível por viatura (todo o histórico, ordenado por data desc): a partir do 1001.º abastecimento os totais de litros/€ por viatura deixam de contar os mais antigos, sem aviso. Análise de combustível de um ano com >1000 registos idem. Assiduidade da equipa: com 33 colaboradores com horário, 31 dias × 33 = 1023 linhas → últimos dias/colaboradores somem do mapa mensal.
- Correção proposta: agregar no servidor (RPC com `SUM … GROUP BY veiculo`), ou paginar com `.range()` até esgotar; nas listas, aviso quando `length === 1000`.
- Teste que prova: `combustivel-relatorio.test.ts` (mock com 1500 linhas em 2 páginas) → totais = soma das 1500; ou teste de BD da RPC agregada.

### A4-10 Notificações push continuam a ir para o utilizador anterior num telemóvel partilhado
- Severidade: Média
- Onde: `src/app/lib/push.ts:43-46` (`upsert … onConflict: 'endpoint'`); policies de `push_subscriptions` (só INSERT/SELECT/DELETE "own", sem UPDATE); `src/app/components/PushSetup.tsx:30` (`.catch(() => {})`)
- Evidência: o endpoint é do dispositivo. Motorista A usa o telemóvel da obra, faz logout (nada apaga a subscrição); motorista B entra → o upsert vira UPDATE de uma linha de A, que a RLS não deixa (sem policy UPDATE) → erro engolido. Resultado: B não recebe as suas notificações e o aparelho continua a receber as de A ("Pedido recusado — Motivo: …", alertas de frota).
- Correção proposta: no logout apagar a linha do endpoint do próprio; RPC `SECURITY DEFINER` "registar_subscricao" que reatribui o endpoint a `auth.uid()`; não engolir o erro.
- Teste que prova: `push.test.mjs` "endpoint muda de dono" — A insere, B chama a RPC/upsert com o mesmo endpoint → linha passa a `user_id = B`.

### A4-11 Fila offline de picagens deita fora a picagem em qualquer erro que não seja de rede
- Severidade: Média
- Onde: `src/features/picagens/hooks/usePicagensOfflineQueue.ts:44-56`
- Evidência: no `catch`, se não for erro de rede, faz `removeFromQueue(item.queueId)` e só mostra "não pôde ser sincronizada". Um erro transitório do servidor (ex.: `statement_timeout` de 8 s em hora de ponta, 503, JWT expirado a meio do ciclo) apaga do telemóvel a ENTRADA/SAIDA feita sem rede — perde-se o registo de assiduidade.
- Correção proposta: só remover em erros definitivos (4xx de validação/RLS, 23xxx); nos restantes manter na fila e tentar depois.
- Teste que prova: `usePicagensOfflineQueue.test.ts` "erro 57014/5xx mantém na fila" → `getQueue().length` igual antes/depois.

### A4-12 Abastecimentos podem ser alterados por API sem rasto
- Severidade: Média
- Onde: policy `comb_abast_update_rbac` (`20260702000006_combustivel.sql:108`) + triggers de `comb_abastecimentos` (só `trg_audit_del_abastecimentos`)
- Evidência: a UI de edição é só admin (`routes.tsx:333`), mas a RLS deixa `armazem`/`gestor` fazer `PATCH /comb_abastecimentos?id=eq.X` com `litros`/`custo_total`/`contador`. O UPDATE não é auditado (só o DELETE) → litros e € alterados sem quem/quando. O `contador` alterado também mexe no `km_atual_veiculo` (planos de manutenção).
- Correção proposta: trigger `auditar_alteracao` também em `comb_abastecimentos` (UPDATE); se a edição é só de admin, alinhar a policy UPDATE com isso.
- Teste que prova: `combustivel.test.mjs` "update de abastecimento fica no audit_log" → 1 linha `comb_abastecimentos.update` com antes/depois de `litros`.

### A4-13 Certificados de formação: bucket sem migration nem policies — upload falha e a formação grava-se sem certificado
- Severidade: Média
- Onde: `src/features/epis/services/formacoesService.ts:81-87`; `supabase/migrations/20260916180000_fase4_epis_formacoes.sql:348-351` (bucket "a criar à mão")
- Evidência: nenhum migration cria o bucket `certificados` nem policies em `storage.objects` para ele (a BD local tem 8 buckets, nenhum `certificados`; nenhuma policy o refere). Sem policy INSERT, `upload` dá erro RLS; `FormacoesPage.tsx:80-90` continua e regista a formação com `certificadoKey` undefined (só um toast). Também não existe forma de abrir o certificado (só o selo "PDF"). Confirmar no Dashboard de produção se o bucket/policies foram criados à mão.
- Correção proposta: migration que cria o bucket privado e policies (INSERT admin/gestor com caminho `<colaborador>/<n>.pdf`, SELECT admin/gestor); abortar o registo se o upload falhar.
- Teste que prova: `storage.test.mjs` "gestor envia certificado; leitura não lê" + teste de UI "upload falhado não regista formação".

### A4-14 Frota usa a data UTC: entre as 00:00 e a 01:00 (verão) a data de hoje é "futura"
- Severidade: Baixa
- Onde: `entregar_viatura`, `devolver_viatura`, `registar_manutencao`, `editar_manutencao`, `registar_checklist`, `atribuir_condutor` (`20260929030000_fase9_frota.sql`, vigentes) — `p_data > CURRENT_DATE`
- Evidência: a BD está em UTC (`SHOW timezone` = UTC). A 15/07 às 00:30 de Lisboa, `CURRENT_DATE` = 14/07; a app envia a data de Lisboa (15/07) → "A data da entrega não pode ser futura". Os relatórios diários já usam `_hoje_pt()`.
- Correção proposta: trocar `CURRENT_DATE` por `public._hoje_pt()` nestas funções.
- Teste que prova: `frota.test.mjs` com `SET TIME ZONE`/`now()` simulado às 23:30 UTC de verão → entrega com a data de Lisboa aceite.

### A4-15 O próprio utilizador muda o nome da sua ficha de RH
- Severidade: Baixa
- Onde: `atualizar_meu_perfil` (`20261007000000_rh_perfil_contactos.sql:71`)
- Evidência: a função faz `UPDATE colaboradores SET nome = v_nome … WHERE user_id = uid` para qualquer papel. Um motorista muda "João Silva" para outro nome no Perfil → o nome muda na ficha de RH, no mapa de assiduidade da contabilidade e nos relatórios diários, sem passar pelo RH (fica no `audit_log`).
- Correção proposta: o perfil só atualiza `profiles.nome`; o nome legal em `colaboradores` fica para admin/gestor.
- Teste que prova: `rh.test.mjs` "perfil não muda colaboradores.nome" → após `atualizar_meu_perfil('X',…)` como motorista, `colaboradores.nome` inalterado.

### A4-16 Guias de transporte: qualquer estado e qualquer coluna, por armazem/medicoes
- Severidade: Baixa
- Onde: policy `guias_upd` (`guias_transporte`), sem CHECK em `estado`; `guiasTransporteService.ts:82-89`
- Evidência: `armazem`/`medicoes` podem pôr `estado` em qualquer texto (ex.: voltar de entregue para rascunho) e reescrever `linhas`, `numero`, `obra_id` de uma guia já emitida, sem auditoria.
- Correção proposta: CHECK de estados + transições numa RPC; congelar `linhas/numero` depois de emitida.
- Teste que prova: `livro-obra.test.mjs` "guia emitida não volta a rascunho" → erro.

### A4-17 Picagem: "hoje" calculado em UTC e turnos que passam a meia-noite
- Severidade: Baixa
- Onde: `src/features/picagens/hooks/usePicar.ts:56` (`timestampDispositivo.split('T')[0]`), `PicagemPage.tsx:96-99` (`startsWith(today)` com ISO UTC), `PicagemPage.tsx:85-90` (lista do dia de Lisboa)
- Evidência: entre as 00:00 e a 01:00 de Lisboa no verão o ISO UTC é do dia anterior → a chave de cache invalidada e a contagem de pendentes usam o dia errado. Num turno 22:00–06:00, depois da meia-noite a lista do dia está vazia e o botão principal sugere ENTRADA em vez de SAIDA.
- Correção proposta: usar `hojeLisboa(new Date(ts))`; o "próximo tipo" deve olhar para a última picagem das últimas ~16 h, não só para o dia civil.
- Teste que prova: `usePicar.test.ts` com relógio às 23:30Z de julho → invalida `picagens-dia-<id>-<dia seguinte>`.

### A4-18 `contabilidade_mapa_assiduidade` executável por anon
- Severidade: Baixa
- Onde: `20261007100000_contabilidade_rh.sql:110-111` (proacl vigente: `anon` com EXECUTE)
- Evidência: é a única função de RH com NIF/NISS que anon pode chamar. A guarda `auth_role() IN ('admin','gestor')` trava (anon recebe 42501), por isso não há fuga hoje; é só higiene contra uma regressão futura da guarda.
- Correção proposta: `REVOKE EXECUTE … FROM PUBLIC, anon`.
- Teste que prova: inventário de SECURITY DEFINER executáveis por anon (teste existente) passa a incluir esta e falha até ao REVOKE.

### A4-19 Livro de obra legível por todos os papéis, sem `pode_ver_obra`
- Severidade: Baixa
- Onde: policy `reg_obra_sel USING (true)` (`20260917180000_fase8_livro_obra.sql:22`)
- Evidência: os relatórios diários respeitam `pode_ver_obra` (autor designado vê só a sua obra), mas `registos_obra` deixa `motorista`/`mecanico` ler o livro de todas as obras. Dados operacionais (sem dados pessoais) → só registo.
- Correção proposta: `USING (public.pode_ver_obra(obra_id))`.
- Teste que prova: `livro-obra.test.mjs` "mecanico não lê livro de obra alheia" → 0 linhas.

## Verificado e OK
- Máquina de estados do pedido: `autorizar_abastecimento` só a partir de `AGUARDA_AUTORIZACAO` com `FOR UPDATE` (2.ª autorização falha); `rejeitar_abastecimento` só sem bomba ligada; `cancelar_pedido_abastecimento` bloqueia se o relé confirmou; `concluir_pedido_abastecimento` só em `AUTORIZADO` (2.º concluir falha); `aprovar_abastecimento_pendente` só em `AGUARDA_APROVACAO`.
- Bomba: `ligar_bomba` idempotente (token válido → RETURN), `cancelar_autorizacao_bomba` só antes de ligar; `pump_poll` com advisory lock, só ativa pedidos `AUTORIZADO` com token; um pedido rejeitado/cancelado nunca liga; STOP de emergência sem sessão; relé ligado após fim de sessão → insiste em `stop` 15 min; `NAO_ARRANCOU` devolve o pedido a "Ligar bomba"; Edge `pump-status` responde `stop` em erro e compara o segredo em tempo constante.
- Página pública do motorista: `/pub/combustivel` só redireciona para a rota autenticada; anon não tem EXECUTE em nenhuma RPC de combustível; upload de fotos exige sessão e caminho `<viatura>/<data>_<pedido>_<n>` de pedido próprio e AUTORIZADO; `get_pend_estado_bomba` só devolve ao solicitante/combustível/aprovador.
- Criação de pedido: advisory lock por viatura, um pedido em curso por motorista e por viatura, km suspeito marcado.
- Frota: entregar/devolver com `FOR UPDATE` na viatura e índice único de atribuição aberta (sem entrega dupla); km não recua; `editar_manutencao` guarda antes/depois; CHECKs de custo/km ≥ 0; `frota_*` listagens excluem motorista e limitam linhas.
- NIF: só via `colaborador_nif` (admin/gestor/próprio); `colaboradores_dados_laborais` (NISS/IBAN) e `custo_hora_colaborador` fechados a admin/gestor/admin; `audit_log` só admin.
- `registar_picagem_geofence`: só o próprio ou admin/gestor; GPS com precisão > 50 m nunca autoriza; `picagens_update` só admin/gestor.
- Relatórios diários de obra: editar/submeter só em `rascunho` pelo autor/gestor, reabrir só admin com motivo, data futura recusada com `_hoje_pt()`.
- Storage: `rh` só aceita `perfis/<próprio uid>/…` ou `colaboradores/…` (admin/gestor); buckets públicos não são listáveis.
- `bomba_bloqueio_motivo` usa hora de Lisboa e trata janela que passa a meia-noite.
