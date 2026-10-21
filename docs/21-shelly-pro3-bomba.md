# 21 — Shelly Pro 3 na bomba Polo 2 (instalação e operação)

> 2026-10-06. Aparelho de bancada: `192.168.1.156` (Shelly Pro 3 `SPSW-003XE16EU`, firmware 2.0.1).
> Desenho e decisões: `docs/superpowers/specs/2026-10-06-shelly-pro3-bomba-design.md`.

## 1. Como funciona

```
Motorista (app) ─ pede ─▶ Aprovador autoriza ─▶ «LIGAR BOMBA» (RPC ligar_bomba, RLS)
                                                        │ grava autorização na BD
Shelly ──(a cada 5 s, ligação de SAÍDA)──▶ Edge Function pump-status ──▶ RPC pump_poll (1 transação, lock)
   ▲                                              │  idle | stop | authorized(segundos ≤ 3600)
   └──────────── liga/desliga o relé O1 ◀─────────┘
```

- O Shelly **chama para fora**: não se abre nenhuma porta no router.
- Autenticação do aparelho: `apikey` (chave pública `sb_publishable_…`, exigida pela gateway) + `x-pump-secret`
  (`PUMP_POLO2_SECRET`, segredo das Edge Functions). Segredo errado/ausente ⇒ `idle` (não revela nada).
  Exceção: `pump-status?probe=1` (só o instalador usa) valida o segredo sem tocar na bomba nem no heartbeat:
  certo ⇒ `200 {"probe":"ok"}`, errado ⇒ `401`.
- O servidor decide tudo (fila, sessões, horário/bloqueio, emergência, «Terminei»); o script só executa e **confirma**.
- Observabilidade já existente: `pump_heartbeat` (último contacto, relé, nível), `pump_sessoes` (motivo de fim),
  logs da Edge Function e consola do script no aparelho.

## 2. Estado seguro e falhas (estado seguro = relé DESLIGADO)

Camadas independentes — qualquer uma corta a bomba:

| # | Camada | Quando atua |
|---|---|---|
| 1 | `toggle_after` | fim do tempo autorizado da sessão |
| 2 | `auto_off` de hardware (3600 s) | relé ligado por qualquer meio (até pela app Shelly) |
| 3 | **dead-man** (20 s) | relé ligado e sem resposta válida do servidor |
| 4 | `initial_state = off` | depois de falha de luz |
| 5 | contactor, EMERGENZA, LIVELLO do quadro | físicos, independentes do Shelly |

| Falha | Comportamento |
|---|---|
| Sem internet / Edge Function em baixo | nunca liga; se estiver ligado, desliga ao fim de ~20 s |
| Resposta inválida, HTTP ≠ 200, `status` desconhecido | ignorada; não conta como contacto (dead-man continua a contar) |
| Rede volta | **a bomba não volta a ligar sozinha**; só uma nova autorização liga |
| Comando de ligar falha ou é ignorado pelo aparelho | verifica o estado real, repete até 3×; se falhar, fica desligado e regista `ERRO` |
| Comando de desligar falha | repete até 3×; depois conta com as camadas 1–3 |
| Autorização repetida com a bomba já ligada | ignorada (não prolonga o tempo) |
| Pedido HTTP que nunca responde | libertado ao fim de 10 s; resposta tardia é ignorada |
| Script reiniciado com o relé ligado | desliga primeiro |
| `api_key`/`pump_secret` por preencher | o script recusa arrancar; relé desligado; log «CONFIGURAÇÃO INCOMPLETA» |

**Consequência a conhecer:** uma quebra de rede > 20 s durante um abastecimento corta a bomba (o servidor fecha a sessão
como `INTERROMPIDO`). É deliberado: parar é sempre seguro. Ajustar com `max_sem_contacto_ms` no CONFIG.

Regras do servidor (`pump_poll`, migration `20261020100000_bomba_fiabilidade.sql`):

| Situação | O servidor responde / regista |
|---|---|
| `authorized` perdida, ou o relé não arranca | a sessão espera 12 s pelo 1.º poll com `on=1` (`relay_confirmado_em`); sem ele, fecha como `NAO_ARRANCOU` e o pedido volta a «LIGAR BOMBA» (pode repetir ou cancelar) |
| `stop` perdido (o relé continua `on=1` depois de a sessão fechar por `TERMINEI`/`EMERGENCIA`/`TEMPO`/`NAO_ARRANCOU`, ou cancelamento) | continua a responder `stop` a cada poll durante 15 min — **não** cria sessão `MANUAL` |
| Relé desligado depois do fim da sessão | grava `relay_desligado_em` na sessão (a app do motorista só pede a leitura final depois disto) |
| Leitura final com o relé ligado (heartbeat < 30 s) | `concluir` recusa; com o Shelly sem contacto (> 30 s) aceita e manda `stop` |
| Cancelar depois de o relé confirmar que arrancou | recusado: «A bomba já forneceu combustível: conclua o pedido com a leitura final (o motorista ou quem aprova).» |
| Leitura final com sessão aberta sem confirmação de arranque | recusa enquanto o Shelly comunica (< 30 s); sem contacto aceita e manda `stop` |
| Quem aprova conclui em nome do motorista | aceita (mesmas regras: foto do contador final, relé desligado); `concluido_por` regista quem fechou |
| Tempo de bomba («LIGAR BOMBA») | `comb_veiculos.pump_max_seconds` só conta se for **maior** que 600 s (máx. 3600); por omissão (180, sem ecrã para o mudar) ou menor ⇒ 10 min |

**Consequência a conhecer (uso manual):** ligar o relé à mão (app/web do Shelly) nos 15 min a seguir a uma sessão que acabou por
`TERMINEI`/`EMERGENCIA`/`TEMPO`/`NAO_ARRANCOU` (ou pedido cancelado) é cortado com `stop`. Vale para qualquer sessão, incluindo uma
**sessão `MANUAL` que acabou pelo corte automático de hardware** (`auto_off` aos 3600 s fecha como `TEMPO`): voltar a ligar à mão
nos 15 min seguintes é cortado. Uma sessão desligada à mão antes do tempo fecha como `INTERROMPIDO` e não bloqueia; passados
15 min, o uso manual volta a ficar registado como `MANUAL`.
O script do aparelho não mudou: estas regras são todas do servidor.

## 3. Antes de instalar — verificação (só leitura)

```sh
node supabase/scripts/shelly-verificar.mjs --ip=192.168.1.156
```
Não liga o relé nem escreve nada. Resultado esperado no estado atual: **0 erros**; avisos «sem password» e «Wi-Fi».
Com password ativa o aparelho recusa as leituras detalhadas (conta como OK).

1. **Ativar a password do aparelho** (obrigatório antes de ligar à bomba): `http://<IP>` → Settings → Authentication.
   Guardar a password num sítio seguro (perdê-la obriga a reposição de fábrica). O script não depende dela.
2. **Preferir cabo de rede** na porta LAN (o Pro 3 tem Ethernet ativa). Em Wi-Fi o dead-man é mais sensível a falhas de sinal.
3. Nuvem Shelly, MQTT e WebSocket já estão desligados — manter assim (não criar outro caminho de comando).

## 4. Instalar o script — um comando

```powershell
$env:PUMP_POLO2_SECRET = "<segredo das Edge Functions>"      # Git Bash: export PUMP_POLO2_SECRET=...
$env:SHELLY_PASSWORD   = "<password do aparelho>"           # só com password ativa no aparelho
node supabase/scripts/shelly-instalar.mjs --ip=192.168.1.156 --dry-run   # 1.º: só leitura, mostra o plano
node supabase/scripts/shelly-instalar.mjs --ip=192.168.1.156             # instala, ativa «Run on startup», inicia e verifica
```
- Com password ativa no aparelho: variável `SHELLY_PASSWORD` (autenticação digest SHA-256, utilizador `admin`). Passá-la como
  argumento ainda funciona, mas fica no histórico do terminal: o instalador avisa.
- Não tem o segredo? `node supabase/scripts/shelly-instalar.mjs --gerar-segredo` imprime um novo e o comando
  `npx supabase secrets set PUMP_POLO2_SECRET=…` (rotação: `docs/22` §rotação; o segredo novo tem de ficar igual nos dois lados).
- O instalador recusa instalar se o preflight tiver ERRO (inclui relé ligado), testa o endpoint `pump-status?probe=1` (só aceita
  `{"probe":"ok"}`: prova que a chave e o segredo batem certo; exige a Edge Function `pump-status` publicada depois de 2026-10-20), envia o código em blocos,
  e só dá OK se: código lido = enviado, script a correr sem erros 9 s depois, `initial_state=off`, `auto_off=3600`, relé desligado.
  Se falhar: pára e desativa o script e deixa o relé desligado (código de saída 1). **Nunca liga o relé.**
- `--desinstalar` = rollback (pára, desativa e apaga o script). Reexecutar o comando = atualizar.
- Prova de que o aparelho já fala com o servidor: SQL do §5 — `pump_heartbeat.last_seen_at` < 10 s.

### Alternativa manual
1. Gerar o script com o segredo (o ficheiro fica **fora do git**; o segredo não é impresso):
   ```powershell
   $env:PUMP_POLO2_SECRET = "<valor guardado nos segredos das Edge Functions>"
   node supabase/scripts/shelly-preparar.mjs
   ```
   → `supabase/scripts/_pronto/shelly-polo2.js`. Recusa chave secreta (`sb_secret_…`) e segredos inválidos.
2. No aparelho: **Scripts → Add script** → nome `encivil-bomba` → colar o conteúdo → **Save** → **Start** → ativar **Run on startup**.
3. Consola do script deve mostrar, por esta ordem:
   - `[ENCIVIL] Proteções ativas: arranque desligado, corte automático 3600s`
   - `[ENCIVIL] Bomba Polo2 — monitorização iniciada (polling 5s, dead-man 20s)`
4. Apagar o ficheiro `_pronto/shelly-polo2.js` depois de colar.

## 5. Checklist de aceite (bancada, **sem** bomba ligada)

Ensaio com o relé a vazio (ouve-se o clique). **A base é a de produção**: um pedido de teste cria registos reais em
`comb_abastecimentos*`. Usar um pedido de teste claramente identificado e **não** usar `supabase/scripts/limpar-registos.sql`
(apaga stock, faturas, picagens e auditoria — não serve para isto).

- [ ] Verificador (§3) com 0 erros.
- [ ] Consola do script como em §4.3; `Settings` do canal 0: arranque «desligado», corte automático 3600 s.
- [ ] `pump_heartbeat` (SQL abaixo): `last_seen_at` com menos de 10 s, `relay_on = false`.
- [ ] Pedido de teste (Polo 2) → autorizar → foto do contador → **LIGAR BOMBA**: clique do relé em ≤ 5 s; app mostra a bomba ligada.
- [ ] **Terminei** (ou parar) → relé desliga em ≤ 5 s e a sessão fica `TERMINEI`; a app só pede a foto final depois de «Bomba desligada».
- [ ] **Não arrancou**: LIGAR BOMBA com o script parado (Stop) → ao fim de ~15 s a sessão fica `NAO_ARRANCOU` e a app volta a «LIGAR BOMBA».
- [ ] **Dead-man**: com o relé ligado, tirar o cabo de rede/desligar o router → relé desliga em ≤ ~25 s; reposta a rede, **não volta a ligar**.
- [ ] **Queda de luz**: com o relé ligado, tirar a alimentação e repor → arranca desligado.
- [ ] Ligar o relé à mão (interface web) → desliga sozinho aos 60 min (ou parar o teste e desligar à mão).
- [ ] **Auditoria da documentação oficial (aviso):** `toggle_after` e `auto_off` coexistem e a documentação não diz qual prevalece. Teste curto:
      `Switch.SetConfig` com `auto_off_delay=3600`, depois `Switch.Set on:true, toggle_after:10` → o relé deve desligar aos ~10 s.
      Se não desligar, o limite por abastecimento não funciona (dead-man e «Terminei» continuam a proteger) — avisar antes de usar.
- [ ] A consola do script mostra «[ENCIVIL] …» (o `print` não vem nas páginas lidas da documentação; confirmar no aparelho).
- [ ] Só depois: ligação física ao quadro por eletricista (script, cabeçalho «LIGAÇÃO FÍSICA»).

```sql
-- SÓ LEITURA — último contacto do Shelly e últimas sessões
SELECT pump_id, last_seen_at, now() - last_seen_at AS ha, relay_on, nivel_alarme FROM public.pump_heartbeat;
SELECT inicio_em, relay_confirmado_em, fim_em, relay_desligado_em, motivo_fim, segundos_autorizados, origem
  FROM public.pump_sessoes ORDER BY inicio_em DESC LIMIT 10;
-- Confirmar que as migrations da bomba estão aplicadas (devem aparecer as 3 funções)
SELECT proname FROM pg_proc WHERE proname IN ('pump_poll','ligar_bomba','cancelar_autorizacao_bomba');
```

## 5b. Ligação física — confirmar antes de ligar (eletricista)

Quadro da bomba (fotos de 2026-10-12): caixa Legrand IP65 com luzes MOTORE/LIVELLO/RETE, botão I/O, botão «M» e EMERGENZA; motor PIUSI
ST Panther 56 K33, 230 V monofásico, 350 W, 3 A (condensador 14 µF). O Shelly Pro 3 aguenta 16 A por canal: a carga é folgada.
**O interior da caixa não está documentado**: o esquema só se decide com a caixa aberta, por eletricista.

Esquema mais simples (sem mexer no interior do quadro): relé O1/I1 **em série na fase que alimenta o quadro** (a montante), com o
botão I/O do quadro deixado em «I». A EMERGENZA e o LIVELLO continuam a atuar (estão a jusante). Relé aberto = tudo sem tensão.
Teste prévio de 1 minuto, antes de ligar o Shelly: cortar a alimentação do quadro com o I/O em «I» e repô-la.
- A bomba **arranca sozinha** ao repor a tensão ⇒ o esquema serve.
- **Não arranca** (precisa de carregar em I) ⇒ o quadro tem auto-retenção: o relé a montante não chega; o eletricista decide entre pulso
  em paralelo com o botão de arranque ou contacto em série no comando. Isto muda a lógica do `toggle_after`: avisar antes de instalar.
O Shelly fica alimentado por L/N em permanência (a montante do relé, nunca pelo próprio relé). Cabo de rede na porta LAN.
**Seletor AUTO/MANUAL com chave em paralelo com o relé** (emergência e manutenção: a bomba nunca fica travada, mesmo com o Shelly desligado).
Tutorial passo a passo para o eletricista (esquema, verificações, testes, registo): `docs/21b-shelly-ligacao-bomba-polo2.html` (abrir no browser e imprimir).

## 6. Rollback

- No aparelho: **Scripts → encivil-bomba → Stop** (e apagar). O relé fica desligado; o `auto_off` de hardware continua configurado.
- No repositório: `git revert` do commit do script. As regras do servidor (§2) estão na migration
  `20261020100000_bomba_fiabilidade.sql`, que tem o seu bloco `-- ROLLBACK`.
- Emergência física: a EMERGENZA do quadro atua sempre, independentemente do Shelly.

## 7. Ferramentas e testes

| Ficheiro | Para quê |
|---|---|
| `supabase/scripts/shelly-polo2.js` | o script do aparelho (mJS) |
| `supabase/scripts/shelly-instalar.mjs` | instala, verifica e (opcional) desinstala o script no IP do aparelho; gera segredo |
| `supabase/scripts/shelly-preparar.mjs` | gera o script com chave+segredo, fora do git |
| `supabase/scripts/shelly-verificar.mjs` | preflight só de leitura ao aparelho |
| `supabase/scripts/shelly-emulador.mjs` | emulador estrito do firmware (testes e simulador) |
| `supabase/scripts/simular-shelly.mjs` | corre o script real contra produção sem hardware — **nunca ao mesmo tempo que o Shelly real** |
| `supabase/scripts/*.test.mjs` | `npm test` (inclui dead-man, retry, verificação, duplicados, compatibilidade mJS) |

## 8. Limitações conhecidas

- O script v2 foi validado no emulador (que replica as regras do firmware) e o aparelho foi sondado em leitura; **a primeira execução
  real no firmware acontece quando o utilizador iniciar o script** — daí o checklist §5.
- O verificador não lê o aparelho com password ativa (limitação deliberada; não implementa autenticação digest).
- Instalar firmware novo fora do horário de abastecimento; reavaliar este guia após atualizações maiores.
