# Shelly Pro 3 — instalador de um comando — desenho

Data: 2026-10-12 · Caminho: bounded (estende `supabase/scripts/shelly-*`), aprovação dispensada pelo utilizador.
Base: `docs/superpowers/specs/2026-10-06-shelly-pro3-bomba-design.md` (script v2, dead-man, estado seguro = relé OFF).

## Objetivo
Ligar o Shelly à energia e correr **um comando** com o IP: o script fica instalado, ativo e verificado. Sem colar nada à mão.

## Compreensão
- Dito pelo utilizador: «apenas colocar o script no IP do Shelly e funcionar»; «TUDO perfeito».
- Assunção: o segredo `PUMP_POLO2_SECRET` não é legível do Supabase; vem de variável de ambiente / prompt, nunca do repositório.
- Fora de âmbito: ligação física, definir a password do aparelho, aplicar migrations, mudar segredos no Supabase.

## Decisões
- D1 Novo `supabase/scripts/shelly-instalar.mjs` (ESM, sem dependências). Lógica pura exportada e testada; CLI fina.
- D2 Só IPs privados (`ipPermitido` de `shelly-verificar.mjs`). Reutiliza `prepararScript` e `avaliarShelly`.
- D3 Cliente RPC Gen2 por HTTP com **digest SHA-256** (utilizador `admin`) quando o aparelho responde 401 e há `--password`
  (ou `SHELLY_PASSWORD`). Sem password e com 401 ⇒ erro claro.
- D4 Fluxo: preflight (aborta com ERRO; relé ligado ⇒ aborta) → pré-teste do endpoint `pump-status` → localizar script `encivil-bomba`
  (Stop se existir; senão `Script.Create`) → `Script.PutCode` em blocos (`append`) → `Script.SetConfig {enable:true}` →
  `Script.Start` → espera → verificação.
- D5 Verificação: `Script.GetCode` igual ao enviado; `Script.GetStatus` running e sem `errors`; `Switch.GetConfig` com
  `initial_state=off`, `auto_off=true`, `auto_off_delay=3600`; `Switch.GetStatus` output=false; script ainda a correr após ≥ 8 s.
  Qualquer falha ⇒ tenta `Script.Stop` + relé OFF e sai com código 1.
- D6 Nunca liga o relé (`Switch.Set on`), nunca imprime o segredo nem a password, nunca grava o script com segredo em disco
  (opcionalmente só em memória). `--dry-run` não escreve nada. `--desinstalar` pára, desativa e apaga o script.
- D7 `--gerar-segredo`: imprime segredo aleatório (≥ 32 chars, charset aceite por `prepararScript`) e o comando
  `npx supabase secrets set PUMP_POLO2_SECRET=…`; não toca no Supabase.
- D8 No fim imprime o SQL só de leitura de `pump_heartbeat` (prova de que o segredo bate certo).

## Critérios de aceite
1. Testes com um Shelly falso (servidor HTTP) cobrem: instalação nova, reinstalação (atualiza), digest, 401 sem password,
   preflight com ERRO aborta, relé ligado aborta, falha de verificação ⇒ rollback + código 1, dry-run sem escritas, desinstalar,
   nunca chama `Switch.Set`, segredo ausente da saída.
2. Auditoria do script v2 contra a documentação oficial do firmware sem achados críticos por resolver.
3. `npm test`, `npm run typecheck`, `npm run build` verdes. Doc `docs/21` atualizada (instalação em 1 comando, rollback).
4. Execução real em `--dry-run` contra `192.168.1.156` (só leitura).

## Riscos
- Primeira execução real do script no firmware só ocorre na instalação (checklist de bancada §5 do doc 21 mantém-se).
- Perder a password do aparelho obriga a reposição de fábrica (o instalador não a define).
