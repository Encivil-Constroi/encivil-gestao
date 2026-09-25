// ================================================================
// ENCIVIL — Script de controlo bomba Polo 2
// Hardware: Shelly Pro 3 (Gen2, scripting nativo)
// Bomba:    PIUSI ST Panther 56 K33 — 230V / 350W / 3A (monofásica)
//
// INSTALAÇÃO (5 min, portátil na mesma rede do Shelly):
//   1. Abrir http://<IP_DO_SHELLY>
//   2. Settings → Authentication → ativar password (protege o segredo abaixo)
//   3. Scripts → Add script → nome "encivil-bomba" → colar este ficheiro
//   4. Substituir PUMP_SECRET pelo valor de PUMP_POLO2_SECRET
//      (Supabase Dashboard → Edge Functions → Secrets)
//   5. Save → Start → ativar "Run on startup"
//   6. Ver consola: deve aparecer "[ENCIVIL] monitorização iniciada"
//
// LIGAÇÃO FÍSICA (eletricista — confirmar esquema interno do quadro):
//   - Shelly: L e N a 230V; cabo de rede na porta LAN (preferível a Wi-Fi)
//   - Canal 1 (bornes I1/O1) é um contacto seco — não fornece tensão
//   - RECOMENDADO: I1/O1 em série no circuito de comando do contactor
//     (linha de auto-retenção). Relé aberto = contactor cai = bomba para.
//     A EMERGENZA e o sensor de nível (LIVELLO) continuam a atuar sozinhos.
//     Se o quadro exigir, o motorista carrega no botão verde (I) depois
//     de a app dizer "Bomba liberada".
//   - NUNCA colocar o Shelly a jusante da EMERGENZA de forma a contorná-la.
//   - NÍVEL (opcional): entrada S1 em paralelo com a luz LIVELLO do quadro
//     (sinal 230V). A app mostra "Depósito em reserva" quando a luz acende.
//     Confirmar se a luz é 230V; se for baixa tensão, usar relé de interface.
//
// COMPORTAMENTO:
//   - Polling à Edge Function a cada 5s (ligação de saída, sem abrir portas)
//   - "authorized" → liga relé com toggle_after (desliga sozinho no fim)
//   - "stop"       → desliga relé imediatamente
//   - Sem internet → nunca liga (falha segura)
//   - Arranque: relé sempre desligado + limite de 60 min em hardware,
//     mesmo que alguém o ligue pela app Shelly ou pela Web UI
// ================================================================

let CONFIG = {
  pump_id:     "polo2",
  api_url:     "https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/pump-status",
  pump_secret: "SUBSTITUIR_PELO_PUMP_POLO2_SECRET",
  relay_id:    0,       // canal 1 do Shelly (O1) = id 0 na API
  nivel_input: 0,       // entrada S1 = id 0 na API
  poll_ms:     5000,
  max_seg_hw:  3600,    // teto absoluto = máximo permitido em comb_veiculos.pump_max_seconds
};

let _checking = false;

function log(msg) { print("[ENCIVIL] " + msg); }

function aplicarProtecoes() {
  Shelly.call("Switch.SetConfig", {
    id: CONFIG.relay_id,
    config: {
      initial_state:  "off",       // após falha de luz volta DESLIGADO
      auto_off:       true,
      auto_off_delay: CONFIG.max_seg_hw,
      in_mode:        "detached",  // entrada S1 não mexe no relé (evita disparos por ruído)
    },
  }, function (res, err) {
    if (err !== 0) log("ERRO ao aplicar proteções (código " + err + ")");
    else log("Proteções ativas: arranque desligado, corte automático " + CONFIG.max_seg_hw + "s");
  });
}

function relayLigado() {
  let st = Shelly.getComponentStatus("switch", CONFIG.relay_id);
  return st && st.output === true;
}

// S1 ligado ao sinal da luz LIVELLO do quadro. Sem fio ligado lê sempre "0".
function nivelEmAlarme() {
  let st = Shelly.getComponentStatus("input", CONFIG.nivel_input);
  return st && st.state === true;
}

function desligar(motivo) {
  Shelly.call("Switch.Set", { id: CONFIG.relay_id, on: false }, function (res, err) {
    if (err !== 0) log("ERRO ao desligar relé (código " + err + ")");
    else log("Bomba DESLIGADA — " + motivo);
  });
}

function ligar(seconds) {
  Shelly.call("Switch.Set", {
    id: CONFIG.relay_id,
    on: true,
    toggle_after: seconds,
  }, function (res, err) {
    if (err !== 0) log("ERRO ao ligar relé (código " + err + ")");
    else log("Bomba LIGADA por " + seconds + "s");
  });
}

function poll() {
  if (_checking) return;
  _checking = true;

  try {
    Shelly.call("HTTP.GET", {
      url: CONFIG.api_url + "?pump_id=" + CONFIG.pump_id
         + "&on=" + (relayLigado() ? "1" : "0")
         + "&nivel=" + (nivelEmAlarme() ? "1" : "0"),
      // Gen2: headers tem de ser objeto key-value, não array
      headers: { "x-pump-secret": CONFIG.pump_secret },
      timeout: 4,
    }, function (result, err_code) {
      _checking = false;
      if (err_code !== 0 || !result) return;

      if (result.code !== 200) {
        log("HTTP " + result.code + " da Edge Function");
        return;
      }

      let data;
      try { data = JSON.parse(result.body); } catch (e) {
        log("Resposta inválida: " + result.body);
        return;
      }

      if (data.status === "stop") {
        desligar("comando STOP da app");
      } else if (data.status === "authorized") {
        let s = (typeof data.seconds === "number" && data.seconds > 0) ? data.seconds : 180;
        if (s > CONFIG.max_seg_hw) s = CONFIG.max_seg_hw;
        ligar(s);
      }
    });
  } catch (e) {
    // Sem isto, uma exceção deixava _checking=true e o polling parava para sempre
    _checking = false;
    log("Erro crítico no HTTP.GET: " + e);
  }
}

aplicarProtecoes();
poll();
Timer.set(CONFIG.poll_ms, true, poll);
log("Bomba Polo2 — monitorização iniciada (polling " + (CONFIG.poll_ms / 1000) + "s)");
