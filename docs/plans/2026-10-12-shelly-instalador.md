# Plano — Shelly instalador de um comando

Spec: `docs/superpowers/specs/2026-10-12-shelly-instalador-design.md`. Execução: subagentes em paralelo (T1 e T2 independentes), T3 depois.

## T1 — `supabase/scripts/shelly-instalar.mjs` + `shelly-instalar.test.mjs` (subagente A)
Ficheiros: criar os dois. Reutilizar `ipPermitido`/`avaliarShelly` (shelly-verificar.mjs) e `prepararScript` (shelly-preparar.mjs).
1. Testes primeiro, com um Shelly falso (`node:http`) que implementa `Shelly.GetDeviceInfo/GetStatus`, `Script.List/Create/PutCode/GetCode/
   SetConfig/Start/Stop/Delete/GetStatus`, `Switch.GetConfig/GetStatus/SetConfig` e opcionalmente digest SHA-256; regista todas as chamadas.
2. Funções puras exportadas: `partirEmBlocos(codigo, n)`, `cabecalhoDigest/respostaDigest`, `gerarSegredo()`, `avaliarVerificacao(...)`.
3. CLI: `--ip`, `--password`/`SHELLY_PASSWORD`, segredo por `PUMP_POLO2_SECRET` (ou prompt oculto), `--dry-run`, `--desinstalar`, `--gerar-segredo`,
   `--chave` (por defeito `.env.local`), `--sem-pretestes` não existe: o pré-teste do endpoint é sempre feito (falha ⇒ aviso fatal).
4. Fluxo e verificações conforme spec D4–D6; códigos de saída 0/1/2; saída em pt-PT, semáforo como `shelly-verificar.mjs`.
5. `npx vitest run supabase/scripts` verde (o ficheiro de testes é .test.mjs: confirmar como `npm test` o apanha).

## T2 — Auditoria do script v2 contra a documentação oficial (subagente B, só leitura + relatório)
Verificar em https://shelly-api-docs.shelly.cloud (Gen2, Scripting, `Shelly.call`, `HTTP.Request`, `Timer.set`, `Switch.Set/SetConfig`,
`Script.PutCode`, limites de mJS/timers/memória/tamanho do script) cada chamada de `shelly-polo2.js`: nomes, parâmetros, tipos, valores
válidos (`in_mode`, `initial_state`, `auto_off_delay`, `toggle_after`), assinatura dos callbacks, limites. Entregar relatório com achados
classificados (crítico/aviso) e correção proposta; **não editar** ficheiros.

## T3 — Integração (eu)
Aplicar achados críticos de T2 ao script e testes; atualizar `docs/21-shelly-pro3-bomba.md` (instalação em 1 comando, `--gerar-segredo`, rollback,
password); `--dry-run` real contra 192.168.1.156; `npm test`, `typecheck`, `build`; `agent-browser` em `/login` (consola limpa); relatório final.
