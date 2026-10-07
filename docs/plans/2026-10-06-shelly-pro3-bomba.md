# Plano — Shelly Pro 3 pronto a lançar

Spec: `docs/superpowers/specs/2026-10-06-shelly-pro3-bomba-design.md`. Execução direta (ficheiros acoplados: script + emulador + testes).

1. **Emulador** (`supabase/scripts/shelly-emulador.mjs`): `Shelly.getUptimeMs`, injeção de falhas (`Switch.Set` com erro N vezes, ignorado N vezes,
   HTTP sem resposta), `Switch.GetStatus` não necessário (script usa `getComponentStatus`). Nada muda para quem não injeta falhas.
2. **Testes primeiro** (`shelly-polo2.test.mjs`): dead-man, não re-liga ao recuperar, retry de ligar, falha final ⇒ OFF, retry de desligar,
   verificação de estado, duplicado não prolonga, STOP cancela retry, watchdog, placeholders. Ver falhar.
3. **Script v2** (`shelly-polo2.js`): guarda de configuração, geração de comandos, `ligar/desligar` verificados, dead-man (timer 2 s), watchdog,
   OFF explícito no arranque, logs de transição online/offline. Só mJS.
4. **`shelly-verificar.mjs`**: preflight só de leitura (`GetDeviceInfo/GetStatus/GetConfig/Script.List`) com semáforo OK/AVISO/ERRO. Lógica de
   avaliação pura e testada (`shelly-verificar.test.mjs`) com respostas reais gravadas. Correr contra `192.168.1.156`.
5. **`shelly-preparar.mjs`**: lê chave pública de `.env.local`, segredo de `--secret`/`PUMP_POLO2_SECRET`, escreve `supabase/scripts/_pronto/shelly-polo2.js`
   (gitignored), valida (sem placeholders, arranca no emulador, relé OFF). Teste do transformador puro.
6. **Edge Function em produção**: `GET pump-status` sem segredo ⇒ `{"status":"idle"}` (prova deploy + gateway; sem efeitos).
7. **Doc** `docs/21-shelly-pro3-bomba.md`: arquitetura, estados seguros/falhas, instalação passo a passo, password do aparelho, ligação física,
   checklist de aceite no aparelho, rollback, SQL de verificação (só leitura). Atualizar nota em `docs/13`.
8. **Validação**: `npm test` (inclui `supabase/tests`), typecheck, build, git diff no âmbito. Autoauditoria.

Rollback: `git revert`; no aparelho, parar/apagar o script. Observabilidade: `print` do aparelho (consola do script), `pump_heartbeat` (último contacto,
estado do relé, nível) e `pump_sessoes` (motivo de fim: TERMINEI/EMERGENCIA/TEMPO/INTERROMPIDO) já existentes.
