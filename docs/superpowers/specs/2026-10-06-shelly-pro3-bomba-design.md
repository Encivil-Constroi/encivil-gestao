# Shelly Pro 3 — bomba Polo 2, pronto a lançar — desenho

Data: 2026-10-06 · Caminho: arquitetural / **sistema físico crítico** (aprovação dispensada pelo utilizador) · Aparelho de bancada: `192.168.1.156`.

## Objetivo
Deixar tudo pronto para que, ao ligar o Shelly Pro 3 à bomba como relé (contacto seco em série no comando do contactor),
**o único passo que falta seja colar/iniciar o script**. O sistema nunca pode deixar a bomba ligada por uma falha de rede ou
de software. Não se instala nada no aparelho nesta fase; não se mexe em produção.

## Estado atual (verificado)
**Servidor (não muda):** Shelly → `GET /functions/v1/pump-status` a cada 5 s (ligação de saída, sem abrir portas) com `apikey` +
`x-pump-secret` → RPC `pump_poll` (advisory lock, heartbeat, fila, sessões, STOP por emergência/«Terminei», horário/bloqueio) →
`idle | stop | authorized(seconds ≤ 3600)`. Erro na RPC ⇒ `stop`. Segredo inválido ⇒ `idle`. A app autoriza/liga/para por RPCs
`SECURITY DEFINER` com RLS. Emulador + 14 testes já cobrem o script atual.

**Aparelho real (sondagem só de leitura):** Pro 3 `SPSW-003XE16EU`, fw 2.0.1, relé 0 desligado, `initial_state=match_input`,
`in_mode=follow`, sem `auto_off`, nuvem/MQTT/WS desligados, SNTP ok (Europe/Lisbon), Wi-Fi `ENCIVIL` (-58 dBm), Ethernet ativa sem cabo,
**sem password (`auth_en=false`)**, sem scripts.

## Lacunas encontradas (todas no script do aparelho)
1. **Perda de rede com a bomba ligada**: o STOP não chega; só o `toggle_after` corta (até 60 min). → *dead-man*.
2. **Comando nunca verificado**: `Switch.Set` com sucesso de RPC não prova que o relé mudou. → verificar estado real.
3. **Sem retry**: falha pontual a desligar deixa a bomba ligada até ao temporizador. → retry limitado, prioridade ao desligar.
4. **Arranca com placeholders** (segredo/chave por substituir) sem avisar. → recusa, relé OFF, log claro.
5. **`authorized` repetido** reinicia o `toggle_after` (prolonga o tempo). → ignorar se já ligado.
6. **Poll preso** (callback HTTP que nunca volta) pararia o polling para sempre. → watchdog.
7. **Aparelho sem password**: qualquer pessoa na rede liga o relé. → passo obrigatório de instalação (feito à mão no aparelho).

## Decisões
- **D1 Sem migration, sem alteração de RLS/RPC/Edge Function.** O contrato `idle|stop|authorized` fica igual.
  Compatibilidade: o dead-man desliga o relé; no contacto seguinte `on=0` com sessão ativa ⇒ o servidor fecha-a como `INTERROMPIDO` (comportamento existente).
- **D2 Estado seguro = relé OFF.** Qualquer dúvida (rede, resposta estranha, estado inesperado, config em falta) ⇒ OFF.
- **D3 Dead-man**: relé ON e sem resposta válida do servidor há > 20 s ⇒ OFF. «Contacto» = HTTP 200 com `status` ∈ {idle, stop, authorized}.
  Depois de recuperar a rede o relé **não volta a ligar sozinho**; só nova `authorized`.
- **D4 Verificar sempre**: após `Switch.Set`, ler `switch:0.output`; até 3 tentativas (500 ms). Falha final a ligar ⇒ tentar OFF e logar `ERRO`.
  Falha a desligar ⇒ continua a tentar (3×) e o dead-man/`toggle_after`/`auto_off` de hardware são as redes seguintes.
- **D5 Sem cruzamento de comandos**: a cadeia de retry (3 × 0,5 s) termina muito antes do poll seguinte (5 s) e há uma só cadeia de «desligar» de cada vez (limite de 5 timers do aparelho). Sem closures: só callbacks com nome + `user_data` (mJS).
- **D6 Defesa em profundidade (camadas independentes)**: `toggle_after` (por sessão) → `auto_off` 3600 s (hardware) → dead-man (20 s) →
  `initial_state=off` (queda de luz) → contactor/EMERGENZA/LIVELLO físicos (o Shelly só interrompe a auto-retenção, nunca contorna a emergência).
- **D7 Ferramentas**: `shelly-verificar.mjs` (preflight só de leitura contra o IP) e `shelly-preparar.mjs` (injeta segredo+chave num ficheiro
  **fora do git** e valida-o no emulador). O segredo nunca entra no repositório nem em logs.
- **D8 Fora de âmbito**: instalar o script no aparelho, ligar a bomba, definir a password do aparelho (decisão/segredo do utilizador), cabos.

## Critérios de aceite
1. Testes no emulador: dead-man, retry, verificação, duplicado, watchdog, placeholders, STOP cancela retry, recuperação sem re-ligar.
2. `shelly-verificar.mjs` contra `192.168.1.156` devolve apenas AVISOS esperados (password, Wi-Fi), nenhum ERRO.
3. `npm test` / typecheck / build verdes; script compatível com mJS (sem `const`, arrow functions, hoisting, classes).
4. Documento de instalação, checklist de aceite no aparelho e rollback.

## Riscos
- Dead-man corta um abastecimento se a internet oscilar > 20 s (preferido: parar é seguro). Parâmetro `max_sem_contacto_ms`.
- Validação final no aparelho real só acontece quando o utilizador iniciar o script (não instalado por decisão do utilizador).
- Rollback: `git revert` + no aparelho parar/apagar o script (o relé fica OFF).
