# Plano — Segurança e Desempenho (iniciado 2026-09-29)

Origem: auditoria de 2026-09-29 (catálogo do banco com as 58 migrations + sondagem
anónima em produção + análise do bundle). Regras de execução:

- Cada passo só fecha com **todas** as verificações a verde: typecheck, suíte completa
  (Node local + Node 24 do CI), build, testes de mutação das regras novas e
  verificação em produção depois de aplicado.
- Correções não retiram acesso a quem o tem hoje de forma legítima: cada guarda
  espelha a regra RLS/rota já existente.
- Publicação pela ordem que nunca deixa o sistema partido entre passos — decidida por
  etapa (em regra migration → Edge Functions → site; na etapa 1 é site → migration →
  Edge Functions, porque o site antigo faz upload num formato que a política nova recusa).

---

## Etapa 1 — Segurança

### 1.1 Migration `20260929000000_seguranca_rpcs_storage.sql`

| Função / objeto | Hoje | Correção | Regra espelhada |
|---|---|---|---|
| `custos_consolidados_por_obra` | anon lê custos de qualquer obra | wrapper com guarda: exige login; anon sem EXECUTE | rota `/obras/:id/custos` (qualquer autenticado) |
| `lancar_fatura`, `classificar_e_aprender` | anon lança faturas (gera stock) | wrapper com guarda `admin`/`gestor` | RLS `faturas_update` |
| `registar_picagem_geofence` | anon pica por qualquer colaborador | wrapper: só o próprio colaborador ou `admin`/`gestor` | RLS `picagens_sel` |
| `_upsert_alerta` | anon cria alertas | sem EXECUTE para ninguém (só uso interno) | chamada só por `avaliar_regras_alerta` |
| `calcular_resumo_dia` | anon dispara cálculo pesado | sem EXECUTE para anon/authenticated (só pg_cron) | não é chamada pelo site |
| `avaliar_regras_alerta` | anon executa (guarda deixa passar sem login) | sem EXECUTE para anon; mantém authenticated + papel de serviço | `alertasService` (admin/gestor) e cron |
| 7 funções SECURITY DEFINER | sem `search_path` fixo | `SET search_path = public` (só as que existirem) | boa prática |
| Bucket `combustivel-taloes` | listagem pública de todas as fotos | remover política SELECT pública (o URL público continua a funcionar) | só a página do motorista escreve; leitura é por URL |
| Upload anónimo de fotos | qualquer caminho, sem limite | só `<viatura>/<data>_<pedido>_<n>.<ext>` de um pedido AUTORIZADO dessa viatura | fluxo da página do motorista |
| `pendentes.push_notificado_em` | — | coluna nova para o `send-push` notificar 1 vez por pedido | 1.3 |

Técnica dos wrappers: a função original é renomeada (`_impl`, sem EXECUTE público) e
uma função nova com a mesma assinatura verifica a permissão e chama-a. O corpo
original não é reescrito — risco zero de alterar comportamento.

Robustez: a produção diverge do repositório (ex.: `criar_guia_transporte` não existe
lá) — cada alteração só atua se o objeto existir.

### 1.2 Página do motorista — upload sem `upsert`
`upsert: true` precisa de permissão de leitura no bucket. Passa a `upsert: false` com
nome único por tentativa (`…_<timestamp>`), para que repetir a foto não colida.

### 1.3 Edge Function `send-push`
Exige `pedido_id` de um pedido em `AGUARDA_AUTORIZACAO` criado há menos de 10 min e
ainda não notificado (marca `push_notificado_em` de forma atómica). Utilizadores
autenticados com papel de combustível continuam a poder enviar.

### 1.4 Edge Function `ler-foto-abastecimento`
Só aceita URLs do próprio bucket `combustivel-taloes`, cujo pedido (no nome do
ficheiro) esteja AUTORIZADO; recusa redirects e ficheiros > 10 MB.

Encontrado durante o passo: o CORS desta função só permitia `content-type`; o
`functions.invoke` envia também `authorization/apikey/x-client-info`, o preflight
falhava e a leitura por IA nunca corria no telemóvel (caía sempre no manual).
Corrigido. Fotos HEIC passam a ir com o MIME certo.

Encontrado no teste real (foto de talão → "não foi possível processar"): com o CORS
corrigido a função passou a correr e falhou na Gemini — o modelo `gemini-2.0-flash`
está descontinuado. As duas funções de IA passam a usar o alias `gemini-flash-latest`
(segredo `GEMINI_MODEL` para fixar outro) e a `ler-foto-abastecimento` regista a causa
de cada recusa nos Logs (antes falhava em silêncio).

### 1.5 Verificação da etapa
- [x] Testes de banco (36): anon bloqueado em cada função; papéis legítimos continuam a funcionar; política de upload (válido / não autorizado / viatura trocada / inexistente / extensão / `..` / outro bucket); listagem bloqueada; inventário das SECURITY DEFINER executáveis por anon; search_path em todas
- [x] Integração frontend × banco: o caminho gerado pelo site passa na política (7 tipos MIME, incluindo vazio)
- [x] Mutações das guardas novas apanhadas pelos testes (5/5)
- [x] Migration idempotente (aplicada 2× sem erro)
- [x] Edge Functions: `deno check` nas 6
- [x] Suíte completa 407/407 (local + Node 24), typecheck 0 erros, build
- [x] Produção: sondagem anónima repetida → 26/26 (13 funções bloqueadas, página do motorista a funcionar, listagem e uploads inválidos recusados, Edge Functions recusam abusos)
- [x] Fluxo real do motorista (QR → foto de talão → leitura IA): 10,21 L / 20,00 € corretos
- [x] CI verde (inclui agora `check:edge` + `test:edge` das Edge Functions)

Também encontrado no teste real: 503 "high demand" da Google → novas tentativas
automáticas com modelo de reserva (9 testes Deno), e `maxOutputTokens` 256 → 4096
(os Flash atuais contam o raciocínio neste limite).

### Correções pedidas depois da etapa 1 (2026-09-29, concluídas e validadas pelo utilizador)
- Fotos dos abastecimentos visíveis depois de aprovados (miniatura na lista, foto na
  página do abastecimento, coluna no Excel) — a foto era gravada mas nunca lida
- Rejeitar na aprovação final (`AGUARDA_APROVACAO`) — migration `20260929010000`
- Página do motorista: o 4.º pedido da mesma viatura em 5 min (limite da policy
  `pend_anon_insert`) aparecia como "Erro ao enviar. Verifica a ligação." Passa a
  explicar o limite. A regra não muda (testes de banco: 3 passam, 4.º recusado,
  limite por viatura, janela de 5 min)

---

## Etapa 2 — Desempenho

### 2.1 Divisão do bundle — feito (2026-09-29)
`manualChunks` passa a função (`src/build/vendorChunks.ts`) que identifica o pacote
pelo último `node_modules/` e só captura os pacotes listados, sem arrastar
dependências partilhadas para o arranque.

Encontrado: na forma objeto o próprio **React** estava dentro de `vendor-charts`, por
isso o recharts nunca podia sair do arranque. O React tem agora chunk próprio
(`vendor-react`), sem imports circulares entrada ↔ vendor.

Medido (soma dos `.js` referenciados em `dist/index.html`):
JS de arranque **1 014 874 B → 591 901 B (−42 %)**. A página do motorista
(`/pub/combustivel`) deixa de carregar `vendor-charts`.
Verificação: 28 testes da função; mutações 5/5 apanhadas; mutação do build (voltar à
forma objeto) regride para 1 014 874 B.

### 2.2 Polling só com a app visível — feito (2026-09-29)
Hook único `useIntervaloVisivel` (`src/app/lib/`): pausa com o separador oculto / ecrã
bloqueado e consulta logo ao voltar. Aplicado a pendentes (15 s), estado da bomba
(5 s), estado do pedido (3 s), notificações (60 s) e aos dois pollers da página do
motorista (AGUARDAR 3 s × 200, BOMBA 2 s × 15). O relógio de 1 s da `BombaAtiva` é só
local e fica como está.

Efeitos a saber: na página do motorista a contagem dos 10 min / 30 s pausa com o ecrã
bloqueado (ao desbloquear consulta logo e avança se já estiver autorizado). As
notificações deixam de recarregar no `focus` da janela (repetia o pedido ao voltar
ao separador); uma janela visível mas por trás de outra atualiza no ciclo de 60 s.

Verificação: 8 testes do hook + 8 de integração da página do motorista (antes não
tinha nenhum). Os mesmos testes contra a página antiga: 7/8 passam — só a pausa é
comportamento novo. Mutações: 7/7 no hook e 7/7 na página (duas só apanhadas depois de
reforçar os testes: temporizador pendurado após o timeout e contagem da bomba num
segundo pedido).

### 2.2b Foto do abastecimento mais leve
A leitura por IA funcionou mas demorou: fotos de 3–6 MB sobem por 4G, são
descarregadas pela função e analisadas pela Gemini. Reduzir no telemóvel para
~1600 px antes do envio. Medir antes/depois com o tempo de cada fase nos Logs.

Feito (2026-09-29), em medição:
- `ler-foto-abastecimento` escreve nos Logs uma linha por leitura:
  `[ler-foto] tempos total=… pedido=… download=… (N KB) gemini=… modelo=… tentativas=…`
- Página do motorista: `reduzirFoto` (1600 px no lado maior, JPEG 0,85) antes do upload.
  `<img>` + canvas (respeita a orientação EXIF); em qualquer falha — HEIC que o
  browser não lê, canvas sem contexto, resultado não mais pequeno — envia a original.
  O caminho continua no formato da política (`.jpg` quando reduzida).
- Publicação em 2 tempos para medir: (1) Edge Function com os tempos → foto real
  = **antes**; (2) site com a redução → foto real = **depois**.
- Verificação: 16 testes da redução + 2 de integração da página (ficheiro enviado,
  caminho aceite pela política, tipo) + 3 Deno; mutações 9/9 no site e 3/3 na função.

| Medição | total | download (KB) | gemini |
|---|---|---|---|
| Antes | | | |
| Depois | | | |

### 2.3 Índice
`comb_abastecimentos_pendentes(veiculo_id)` — usado no limite de pedidos a cada QR.

### 2.4 Verificação da etapa
- [x] Medição do JS de arranque antes/depois (build real): 1 014 874 B → 591 901 B
- [x] Teste do `useIntervaloVisivel` (8) + integração da página do motorista (8)
- [ ] Suíte completa, typecheck, build, CI verde; site a funcionar em produção

---

## Etapa 3 — Processo (precisa do utilizador)
Login do Supabase CLI com a conta dona da organização ENCIVIL →
`supabase migration list` (comparar produção × repositório, resolver divergências) →
`supabase db push` e `supabase gen types` passam a ser o caminho normal
(fim dos `rpcSemTipos`).

---

## Etapa 4 — Segurança 2026 (iniciada 2026-10-06)

Reforço de segurança em 7 fases sobre os 20 pontos pedidos pela Direção (HSTS/CSP, MFA, rate limit,
CORS e validação, auditoria imutável, NIF restrito, backup cifrado, dependências e CI, recuperação).

- Desenho: `docs/superpowers/specs/2026-10-06-seguranca-2026-design.md`
- Plano de implementação: `docs/superpowers/plans/2026-10-06-seguranca-2026.md`
- Operação, recuperação e incidentes: `docs/22-seguranca-operacao.md`
- Ordem de publicação: **site → migrations → Edge Functions** (o site novo funciona com a BD antiga)
- Migrations novas, por ordem: `20261008000000`, `20261008010000`, `20261008020000`, `20261008030000`, `20261008050000`, `20261008060000`

Estado: código e documentação concluídos no repositório; **por publicar/aplicar em produção** (passos manuais do utilizador: migrations, Dashboard do Supabase, secrets do GitHub, ligar o MFA obrigatório).

---

## Estado
| Etapa | Estado |
|---|---|
| 1 — Segurança | **concluída** (2026-09-29) |
| 2 — Desempenho | em curso: 2.1 e 2.2 feitos; faltam 2.2b, 2.3 |
| 3 — Processo | aguarda login do CLI |
| 4 — Segurança 2026 | código e docs prontos; aguarda publicação e passos manuais (ver acima) |
