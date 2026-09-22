// ================================================================
// ENCIVIL — Script de controlo bomba Polo 2
// Hardware: Shelly Pro 3 (firmware Gen2, scripting nativo)
//
// INSTALAÇÃO:
//   1. Abrir Shelly Web UI → http://<IP_DO_SHELLY>
//   2. Ativar autenticação na Web UI (Settings → Authentication)
//      para proteger o pump_secret visível neste script
//   3. Scripts → Criar novo script → colar este código
//   4. Substituir PUMP_SECRET pelo valor de PUMP_POLO2_SECRET
//      (configurado em: Supabase Dashboard > Project Settings > Secrets)
//   5. Substituir ANON_KEY pela VITE_SUPABASE_ANON_KEY do projeto
//   6. Guardar e ativar (botão "Enable on startup")
//
// LIGAÇÃO FÍSICA:
//   - Bomba via contator → contatos secos O1 (relay 0) do Shelly
//   - Shelly alimentado por 220V AC (bornes L e N)
//   - Shelly ligado via Ethernet (LAN) ao router do galpão
//
// COMPORTAMENTO:
//   - Polling ao Supabase a cada 5s
//   - Quando António autoriza no app → Shelly ativa O1 por 180s
//   - Se internet cair → bomba não abre (comportamento seguro)
//   - Token de uso único: mesmo que o script faça 2 polls em < 5s, só ativa 1x
//   - toggle_after garante desligamento automático mesmo que o script falhe
// ================================================================

let CONFIG = {
  pump_id:     "polo2",
  api_url:     "https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/pump-status",
  anon_key:    "SUBSTITUIR_PELA_VITE_SUPABASE_ANON_KEY",  // chave pública, segura aqui
  pump_secret: "SUBSTITUIR_PELO_PUMP_POLO2_SECRET",        // segredo privado — ativar auth na Web UI do Shelly
  relay_id:    0,      // O1 = canal 0 (primeiro output do Shelly Pro 3)
  poll_ms:     5000,   // intervalo de polling em milissegundos
};

let _checking = false;

function poll() {
  if (_checking) return; // evitar polls sobrepostos se a rede for lenta

  _checking = true;

  try {
    Shelly.call(
      "HTTP.GET",
      {
        url: CONFIG.api_url + "?pump_id=" + CONFIG.pump_id,
        // IMPORTANTE: headers devem ser objeto key-value (não array) no firmware Gen2
        headers: {
          "Authorization": "Bearer " + CONFIG.anon_key,
          "x-pump-secret": CONFIG.pump_secret
        },
        timeout: 4  // timeout de 4s (< poll_ms) para não bloquear o próximo ciclo
      },
      function(result, err_code) {
        _checking = false;

        if (err_code !== 0) {
          // Erro de rede — silencioso, tenta de novo no próximo ciclo
          return;
        }

        if (!result || !result.body) return;

        if (result.code !== 200) {
          print("[ENCIVIL] HTTP " + result.code + " da Edge Function — aguardar próximo ciclo");
          return;
        }

        let data;
        try {
          data = JSON.parse(result.body);
        } catch (e) {
          print("[ENCIVIL] Resposta inválida da Edge Function: " + result.body);
          return;
        }

        if (data.status === "authorized") {
          let seconds = (typeof data.seconds === "number" && data.seconds > 0)
            ? data.seconds
            : 180; // fallback seguro

          print("[ENCIVIL] Autorização recebida — a abrir bomba por " + seconds + "s");

          Shelly.call(
            "Switch.Set",
            {
              id:           CONFIG.relay_id,
              on:           true,
              toggle_after: seconds  // desliga automaticamente ao fim de X segundos (segurança)
            },
            function(res, err) {
              if (err !== 0) {
                print("[ENCIVIL] Erro ao ativar relay O1: código " + err);
              } else {
                print("[ENCIVIL] Relay O1 ativo por " + seconds + "s — bomba aberta");
              }
            }
          );
        }
      }
    );
  } catch (e) {
    // Shelly.call pode lançar exceção se parâmetros inválidos ou OOM
    // Sem este try-catch, _checking ficaria true para sempre e o polling pararia
    _checking = false;
    print("[ENCIVIL] Erro critico ao chamar HTTP.GET: " + e);
  }
}

// Poll imediato ao arrancar (não esperar os primeiros 5s)
poll();

// Polling repetido a cada poll_ms
Timer.set(CONFIG.poll_ms, true, poll);

print("[ENCIVIL] Bomba Polo2 — monitorização iniciada (polling a cada " + CONFIG.poll_ms / 1000 + "s)");
