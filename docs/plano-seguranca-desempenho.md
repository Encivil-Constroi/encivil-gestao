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

### 1.5 Verificação da etapa
- [x] Testes de banco (36): anon bloqueado em cada função; papéis legítimos continuam a funcionar; política de upload (válido / não autorizado / viatura trocada / inexistente / extensão / `..` / outro bucket); listagem bloqueada; inventário das SECURITY DEFINER executáveis por anon; search_path em todas
- [x] Integração frontend × banco: o caminho gerado pelo site passa na política (7 tipos MIME, incluindo vazio)
- [x] Mutações das guardas novas apanhadas pelos testes (5/5)
- [x] Migration idempotente (aplicada 2× sem erro)
- [x] Edge Functions: `deno check` nas 6
- [x] Suíte completa 407/407 (local + Node 24), typecheck 0 erros, build
- [ ] Produção: sondagem anónima repetida → tudo bloqueado; listagem do bucket bloqueada; Edge Functions recusam abusos
- [ ] Fluxo real do motorista (QR → push → foto → leitura IA) — precisa de um pedido real
- [ ] CI verde

---

## Etapa 2 — Desempenho

### 2.1 Divisão do bundle
`manualChunks` passa a função que só captura os pacotes pedidos (recharts, qrcode…),
sem arrastar dependências partilhadas (`clsx`) para o arranque.
Medido: JS de arranque 991 KB → ~570 KB.

### 2.2 Polling só com a app visível
Hook único `useIntervaloVisivel`: pausa com o separador oculto / ecrã bloqueado e
atualiza logo ao voltar. Aplicado a pendentes, bomba e notificações.

### 2.3 Índice
`comb_abastecimentos_pendentes(veiculo_id)` — usado no limite de pedidos a cada QR.

### 2.4 Verificação da etapa
- [ ] Medição do JS de arranque antes/depois (build real)
- [ ] Teste do `useIntervaloVisivel`
- [ ] Suíte completa, typecheck, build, CI verde; site a funcionar em produção

---

## Etapa 3 — Processo (precisa do utilizador)
Login do Supabase CLI com a conta dona da organização ENCIVIL →
`supabase migration list` (comparar produção × repositório, resolver divergências) →
`supabase db push` e `supabase gen types` passam a ser o caminho normal
(fim dos `rpcSemTipos`).

---

## Estado
| Etapa | Estado |
|---|---|
| 1 — Segurança | em curso |
| 2 — Desempenho | por fazer |
| 3 — Processo | aguarda login do CLI |
