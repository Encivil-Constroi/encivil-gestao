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
**Se a resposta `authorized` se perder** depois de o servidor a registar, o pedido fica marcado como já ativado e a bomba
não liga (comportamento do servidor, inalterado): o ensaio de bancada (§5) confirma como a app lida com isso.

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

## 4. Instalar o script (o único passo que falta)

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
- [ ] **Terminei** (ou parar) → relé desliga em ≤ 5 s e a sessão fica `TERMINEI`.
- [ ] **Dead-man**: com o relé ligado, tirar o cabo de rede/desligar o router → relé desliga em ≤ ~25 s; reposta a rede, **não volta a ligar**.
- [ ] **Queda de luz**: com o relé ligado, tirar a alimentação e repor → arranca desligado.
- [ ] Ligar o relé à mão (interface web) → desliga sozinho aos 60 min (ou parar o teste e desligar à mão).
- [ ] Só depois: ligação física ao quadro por eletricista (script, cabeçalho «LIGAÇÃO FÍSICA»).

```sql
-- SÓ LEITURA — último contacto do Shelly e últimas sessões
SELECT pump_id, last_seen_at, now() - last_seen_at AS ha, relay_on, nivel_alarme FROM public.pump_heartbeat;
SELECT inicio_em, fim_em, motivo_fim, segundos_autorizados, origem FROM public.pump_sessoes ORDER BY inicio_em DESC LIMIT 10;
-- Confirmar que as migrations da bomba estão aplicadas (devem aparecer as 3 funções)
SELECT proname FROM pg_proc WHERE proname IN ('pump_poll','ligar_bomba','cancelar_autorizacao_bomba');
```

## 6. Rollback

- No aparelho: **Scripts → encivil-bomba → Stop** (e apagar). O relé fica desligado; o `auto_off` de hardware continua configurado.
- No repositório: `git revert` do commit do script. Sem migrations nem alterações de RLS/RPC envolvidas.
- Emergência física: a EMERGENZA do quadro atua sempre, independentemente do Shelly.

## 7. Ferramentas e testes

| Ficheiro | Para quê |
|---|---|
| `supabase/scripts/shelly-polo2.js` | o script do aparelho (mJS) |
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
