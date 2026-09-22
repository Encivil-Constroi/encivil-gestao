// ================================================================
// ENCIVIL — Script de controlo bomba Polo 2
// Hardware: Shelly Pro 3 (firmware Gen2, scripting nativo)
//
// INSTALAÇÃO:
//   1. Abrir Shelly Web UI → http://<IP_DO_SHELLY>
//   2. Scripts → Criar novo script → colar este código
//   3. Substituir PUMP_SECRET pelo valor de PUMP_POLO2_SECRET
//      (configurado em: Supabase Dashboard > Project Settings > Secrets)
//   4. Substituir ANON_KEY pela VITE_SUPABASE_ANON_KEY do projeto
//   5. Guardar e ativar (botão "Enable on startup")
//
// LIGAÇÃO FÍSICA:
//   - Bomba 12V → contatos O1 (relay 0) do Shelly
//   - Shelly alimentado por 220V AC (quadro elétrico do galpão)
//   - Shelly ligado via Ethernet (LAN) ao router do galpão
//
// COMPORTAMENTO:
//   - Polling ao Supabase a cada 5s
//   - Quando António autoriza no app → Shelly ativa O1 por 180s
//   - Se internet cair → bomba não abre (comportamento seguro)
//   - Token de uso único: mesmo que o script faça 2 polls em < 5s, só ativa 1x
// ================================================================

let CONFIG = {
  pump_id:     "polo2",
  api_url:     "https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/pump-status",
  anon_key:    "SUBSTITUIR_PELA_VITE_SUPABASE_ANON_KEY",  // chave pública, segura aqui
  pump_secret: "SUBSTITUIR_PELO_PUMP_POLO2_SECRET",        // segredo privado
  relay_id:    0,      // O1 = canal 0 (primeiro output do Shelly Pro 3)
  poll_ms:     5000,   // intervalo de polling em milissegundos
};

let _checking = false;

function poll() {
  if (_checking) return; // evitar polls sobrepostos se a rede for lenta
  _checking = true;

  Shelly.call(
    "HTTP.GET",
    {
      url: CONFIG.api_url + "?pump_id=" + CONFIG.pump_id,
      headers: [
        { name: "Authorization",  value: "Bearer " + CONFIG.anon_key },
        { name: "x-pump-secret",  value: CONFIG.pump_secret }
      ],
      timeout: 4  // timeout de 4s (< poll_ms) para não bloquear o próximo ciclo
    },
    function(result, err_code) {
      _checking = false;

      if (err_code !== 0) {
        // Erro de rede — silencioso, tenta de novo no próximo ciclo
        return;
      }
      if (!result || result.code !== 200 || !result.body) return;

      let data;
      try {
        data = JSON.parse(result.body);
      } catch (e) {
        return;
      }

      if (data.status === "authorized") {
        print("[ENCIVIL] Autorização recebida — a abrir bomba por " + data.seconds + "s");
        Shelly.call(
          "Switch.Set",
          {
            id:           CONFIG.relay_id,
            on:           true,
            toggle_after: data.seconds  // desliga automaticamente ao fim de X segundos
          },
          function(res, err) {
            if (err !== 0) {
              print("[ENCIVIL] Erro ao ativar relay: " + err);
            } else {
              print("[ENCIVIL] Relay O1 ativo por " + data.seconds + "s");
            }
          }
        );
      }
    }
  );
}

// Arrancar polling
Timer.set(CONFIG.poll_ms, true, poll);
print("[ENCIVIL] Bomba Polo2 — monitorização iniciada (polling a cada " + CONFIG.poll_ms / 1000 + "s)");
