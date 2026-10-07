// ================================================================
// ENCIVIL — Script de controlo bomba Polo 2   (v2 — falha segura)
// Hardware: Shelly Pro 3 (Gen2, scripting nativo, firmware 2.x)
// Bomba:    PIUSI ST Panther 56 K33 — 230V / 350W / 3A (monofásica)
//
// INSTALAÇÃO: ver docs/21-shelly-pro3-bomba.md (passo a passo e checklist).
// Resumo: `node supabase/scripts/shelly-preparar.mjs --secret=<PUMP_POLO2_SECRET>`
//   gera supabase/scripts/_pronto/shelly-polo2.js (fora do git) com a chave e o
//   segredo já preenchidos → Scripts → Add script → colar → Save → Start →
//   «Run on startup». Consola: «[ENCIVIL] monitorização iniciada».
//   (Manualmente: substituir os dois valores "SUBSTITUIR_…" no CONFIG.)
//
// LIGAÇÃO FÍSICA (eletricista — confirmar esquema interno do quadro):
//   - Shelly: L e N a 230V; cabo de rede na porta LAN (preferível a Wi-Fi)
//   - Canal 1 (bornes I1/O1) é um contacto seco — não fornece tensão
//   - RECOMENDADO: I1/O1 em série no circuito de comando do contactor
//     (linha de auto-retenção). Relé aberto = contactor cai = bomba para.
//     A EMERGENZA e o sensor de nível (LIVELLO) continuam a atuar sozinhos.
//   - NUNCA colocar o Shelly a jusante da EMERGENZA de forma a contorná-la.
//   - NÍVEL (opcional): entrada S1 em paralelo com a luz LIVELLO (230V).
//
// ESTADO SEGURO = RELÉ DESLIGADO. Camadas independentes (qualquer uma corta):
//   1. toggle_after da sessão autorizada       (por abastecimento)
//   2. auto_off de hardware (max_seg_hw)       (mesmo ligado à mão pela app Shelly)
//   3. dead-man: sem resposta válida do servidor há > max_sem_contacto_ms → desliga
//   4. initial_state = off                     (depois de falha de luz)
//   5. contactor / EMERGENZA / LIVELLO do quadro (físicos, independentes do Shelly)
//
// COMPORTAMENTO:
//   - Polling à Edge Function a cada 5s (ligação de saída, sem abrir portas)
//   - "authorized" → liga o relé com toggle_after e CONFIRMA o estado real
//   - "stop"       → desliga o relé e CONFIRMA o estado real
//   - Sem internet / resposta inválida → nunca liga; se estiver ligado, o dead-man corta
//   - Recuperar a rede NÃO volta a ligar a bomba: só uma nova autorização liga
//   - Configuração por preencher → recusa arrancar (relé desligado)
//
// COMPATIBILIDADE mJS (testado em supabase/scripts/shelly-polo2.test.mjs): sem
// const, arrow functions, template strings, classes, optional chaining nem
// hoisting; sem funções anónimas — só callbacks globais com nome e dados em
// user_data (o mJS não garante closures; máx. 5 timers; pouco aninhamento).
// ================================================================

let CONFIG = {
  pump_id:     "polo2",
  api_url:     "https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/pump-status",
  // Chave pública do projeto (sb_publishable_…): a gateway da Supabase recusa
  // pedidos sem header apikey (401), mesmo com o segredo certo
  api_key:     "SUBSTITUIR_PELA_CHAVE_PUBLICA",
  pump_secret: "SUBSTITUIR_PELO_PUMP_POLO2_SECRET",
  relay_id:    0,       // canal 1 do Shelly (O1) = id 0 na API
  nivel_input: 0,       // entrada S1 = id 0 na API
  poll_ms:     5000,
  max_seg_hw:  3600,    // teto absoluto = máximo permitido em comb_veiculos.pump_max_seconds
  max_sem_contacto_ms: 20000,  // dead-man: relé ligado sem resposta válida → desliga
  guarda_ms:   2000,    // período da verificação do dead-man e do poll preso
  poll_preso_ms: 10000, // pedido sem resposta há mais do que isto é libertado
  tentativas:  3,       // por comando (ligar/desligar), com verificação do estado real
  retry_ms:    500      // 3 × 0,5 s termina muito antes do poll seguinte (5 s)
};

let _checking = false;
let _checkInicio = 0;
let _seq = 0;                       // identifica o pedido em curso; respostas atrasadas são ignoradas
let _ultimoContacto = Shelly.getUptimeMs();
let _online = true;
let _desligando = false;            // uma só cadeia de «desligar» de cada vez (limite de 5 timers no aparelho)
let _desligandoDesde = 0;

function log(msg) { print("[ENCIVIL] " + msg); }

function agora() { return Shelly.getUptimeMs(); }

function configuracaoPendente() {
  let k = CONFIG.api_key;
  let s = CONFIG.pump_secret;
  return !k || !s || k.indexOf("SUBSTITUIR") === 0 || s.indexOf("SUBSTITUIR") === 0;
}

function aposProtecoes(res, err) {
  if (err !== 0) log("ERRO ao aplicar proteções (código " + err + ")");
  else log("Proteções ativas: arranque desligado, corte automático " + CONFIG.max_seg_hw + "s");
}

function aplicarProtecoes() {
  Shelly.call("Switch.SetConfig", {
    id: CONFIG.relay_id,
    config: {
      initial_state:  "off",       // após falha de luz volta DESLIGADO
      auto_off:       true,
      auto_off_delay: CONFIG.max_seg_hw,
      in_mode:        "detached"   // entrada S1 não mexe no relé (evita disparos por ruído)
    }
  }, aposProtecoes);
}

function relayLigado() {
  let st = Shelly.getComponentStatus("switch", CONFIG.relay_id);
  return !!st && st.output === true;
}

// S1 ligado ao sinal da luz LIVELLO do quadro. Sem fio ligado lê sempre "0".
function nivelEmAlarme() {
  let st = Shelly.getComponentStatus("input", CONFIG.nivel_input);
  return !!st && st.state === true;
}

// ── Desligar: nunca assume que funcionou; confirma o estado real e repete (limitado) ──
function enviarDesligar(motivo, tentativa) {
  Shelly.call("Switch.Set", { id: CONFIG.relay_id, on: false }, aposDesligar, { m: motivo, t: tentativa });
}

function repetirDesligar(ud) { enviarDesligar(ud.m, ud.t + 1); }

function aposDesligar(res, err, msg, ud) {
  if (err === 0 && !relayLigado()) {
    _desligando = false;
    log("Bomba DESLIGADA — " + ud.m);
    return;
  }
  if (ud.t < CONFIG.tentativas) {
    log("A repetir desligar (" + ud.t + "/" + CONFIG.tentativas + ", código " + err + ")");
    Timer.set(CONFIG.retry_ms, false, repetirDesligar, ud);
    return;
  }
  _desligando = false;
  log("ERRO ao desligar relé após " + ud.t + " tentativas — a contar com o corte automático");
}

function desligar(motivo) {
  // Pedido redundante enquanto outra cadeia corre; a guarda de 5 s evita ficar preso se um callback se perder
  if (_desligando && agora() - _desligandoDesde < 5000) return;
  _desligando = true;
  _desligandoDesde = agora();
  enviarDesligar(motivo, 1);
}

// ── Ligar: idem. O retry (3 × 0,5 s) termina muito antes do poll seguinte (5 s), por isso
//    nenhum STOP/autorização nova pode cruzar-se com uma repetição pendente ──
function enviarLigar(seconds, tentativa) {
  Shelly.call("Switch.Set", {
    id: CONFIG.relay_id,
    on: true,
    toggle_after: seconds
  }, aposLigar, { s: seconds, t: tentativa });
}

function repetirLigar(ud) { enviarLigar(ud.s, ud.t + 1); }

function aposLigar(res, err, msg, ud) {
  if (err === 0 && relayLigado()) {
    log("Bomba LIGADA por " + ud.s + "s");
    return;
  }
  if (ud.t < CONFIG.tentativas) {
    log("A repetir ligar (" + ud.t + "/" + CONFIG.tentativas + ", código " + err + ")");
    Timer.set(CONFIG.retry_ms, false, repetirLigar, ud);
    return;
  }
  // Não conseguiu ligar de forma confirmada: repõe o estado seguro e deixa o servidor fechar a sessão
  log("ERRO ao ligar relé após " + ud.t + " tentativas — estado seguro: desligado");
  desligar("falha ao ligar");
}

function ligar(seconds) {
  // Autorização repetida não prolonga o tempo da sessão já em curso
  if (relayLigado()) {
    log("Autorização recebida com a bomba já ligada — ignorada");
    return;
  }
  enviarLigar(seconds, 1);
}

function contactoValido() {
  _ultimoContacto = agora();
  if (!_online) {
    _online = true;
    log("Ligação ao servidor restabelecida (a bomba só volta a ligar com nova autorização)");
  }
}

// Dead-man + libertação de pedido preso. Corre independente do polling.
function guarda() {
  let t = agora();
  if (_checking && t - _checkInicio > CONFIG.poll_preso_ms) {
    _checking = false;
    _seq = _seq + 1;
    log("Pedido ao servidor sem resposta — libertado");
  }
  if (t - _ultimoContacto > CONFIG.max_sem_contacto_ms) {
    if (_online) {
      _online = false;
      log("Sem contacto com o servidor há mais de " + (CONFIG.max_sem_contacto_ms / 1000) + "s");
    }
    if (relayLigado()) desligar("sem contacto com o servidor (dead-man)");
  }
}

function aposPoll(result, err_code, err_msg, meu) {
  // Resposta de um pedido já libertado pelo watchdog: pode estar velha, não se age sobre ela
  if (meu !== _seq) return;
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

  if (!data || (data.status !== "idle" && data.status !== "stop" && data.status !== "authorized")) {
    log("Resposta inesperada do servidor — ignorada");
    return;
  }
  contactoValido();

  if (data.status === "stop") {
    desligar("comando STOP da app");
  } else if (data.status === "authorized") {
    let s = (typeof data.seconds === "number" && data.seconds > 0) ? data.seconds : 180;
    if (s > CONFIG.max_seg_hw) s = CONFIG.max_seg_hw;
    ligar(s);
  }
}

function poll() {
  if (_checking) return;
  _checking = true;
  _checkInicio = agora();
  _seq = _seq + 1;

  try {
    // HTTP.Request e não HTTP.GET: no firmware Gen2 só o Request envia headers
    Shelly.call("HTTP.Request", {
      method: "GET",
      url: CONFIG.api_url + "?pump_id=" + CONFIG.pump_id
         + "&on=" + (relayLigado() ? "1" : "0")
         + "&nivel=" + (nivelEmAlarme() ? "1" : "0"),
      headers: { "apikey": CONFIG.api_key, "x-pump-secret": CONFIG.pump_secret },
      timeout: 4
    }, aposPoll, _seq);
  } catch (e) {
    // Sem isto, uma exceção deixava _checking=true e o polling parava para sempre
    _checking = false;
    log("Erro crítico no pedido HTTP: " + e);
  }
}

aplicarProtecoes();
// Arranque (ou reinício do script) com o relé ligado: estado seguro primeiro
if (relayLigado()) desligar("arranque do script");

if (configuracaoPendente()) {
  log("CONFIGURAÇÃO INCOMPLETA: preencher api_key e pump_secret no CONFIG. Script parado, relé desligado.");
} else {
  poll();
  Timer.set(CONFIG.poll_ms, true, poll);
  Timer.set(CONFIG.guarda_ms, true, guarda);
  log("Bomba Polo2 — monitorização iniciada (polling " + (CONFIG.poll_ms / 1000) + "s, dead-man " + (CONFIG.max_sem_contacto_ms / 1000) + "s)");
}
