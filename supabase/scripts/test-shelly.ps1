# ================================================================
# ENCIVIL - Teste do Shelly Pro 3 (Polo 2)
#
# Correr no portatil ligado a MESMA rede do Shelly:
#   powershell -ExecutionPolicy Bypass -File supabase\scripts\test-shelly.ps1 -Ip 192.168.1.50
#   (com password na Web UI)  ... -Password "xxxx"
#   (testar tambem a cloud)   ... -PumpSecret "valor do PUMP_POLO2_SECRET"
#
# O relé LIGA durante 5 segundos. Fazer primeiro com uma lampada no canal 1,
# nunca com a bomba ligada sem ninguem junto ao quadro.
# ================================================================
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [string]$Password = "",
  [string]$PumpSecret = "",
  [string]$FunctionUrl = "https://wuruhxmbueeyhiqgvlxu.supabase.co/functions/v1/pump-status"
)

$ErrorActionPreference = "Stop"
$script:falhas = 0

function Ok($msg)    { Write-Host "  [OK]    $msg" -ForegroundColor Green }
function Falha($msg) { Write-Host "  [FALHA] $msg" -ForegroundColor Red; $script:falhas++ }
function Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Passo($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }

function Rpc([string]$metodo) {
  $curlArgs = @("-s", "--max-time", "5", "http://$Ip/rpc/$metodo")
  # Utilizador da Web UI do Shelly Gen2 e sempre "admin"; digest SHA-256
  if ($Password) { $curlArgs = @("--digest", "-u", "admin:$Password") + $curlArgs }
  $raw = & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0 -or -not $raw) { throw "sem resposta de http://$Ip ($metodo)" }
  $obj = $raw | ConvertFrom-Json
  if ($obj.code -eq 401) { throw "401 - password errada ou em falta (-Password)" }
  return $obj
}

Passo "1. Ligacao ao Shelly ($Ip)"
try {
  $info = Rpc "Shelly.GetDeviceInfo"
  Ok "Modelo $($info.model) | firmware $($info.ver) | id $($info.id)"
  if ($info.model -notlike "SPSW-003*") { Falha "Modelo inesperado - era esperado Shelly Pro 3 (SPSW-003...)" }
  if (-not $info.auth_en) { Info "Aviso: autenticacao da Web UI desligada - ativar antes de colar o segredo no script" }
} catch { Falha $_; Write-Host ""; Write-Host "Sem ligacao ao Shelly - parar aqui." -ForegroundColor Red; exit 1 }

Passo "2. Protecoes de hardware do canal 1"
try {
  $cfg = Rpc "Switch.GetConfig?id=0"
  if ($cfg.initial_state -eq "off") { Ok "Arranque apos falha de luz: DESLIGADO" } else { Falha "initial_state = $($cfg.initial_state) (devia ser off - o script aplica ao iniciar)" }
  if ($cfg.auto_off) { Ok "Corte automatico em $($cfg.auto_off_delay)s" } else { Falha "auto_off desligado (o script aplica ao iniciar)" }
} catch { Falha $_ }

Passo "3. Script ENCIVIL no Shelly"
try {
  $lista = Rpc "Script.List"
  $ativo = $lista.scripts | Where-Object { $_.running }
  if ($ativo) { Ok "Script a correr: $($ativo.name -join ', ')" } else { Falha "Nenhum script a correr (Scripts -> Start)" }
  $comArranque = $lista.scripts | Where-Object { $_.enable }
  if (-not $comArranque) { Falha "Nenhum script com 'Run on startup' - depois de falha de luz a bomba fica sem controlo" }
} catch { Falha $_ }

Passo "4. Rele: ligar 5s e confirmar corte automatico"
try {
  $null = Rpc "Switch.Set?id=0&on=true&toggle_after=5"
  Start-Sleep -Milliseconds 800
  $st = Rpc "Switch.GetStatus?id=0"
  if ($st.output) { Ok "Rele LIGADO (lampada deve acender)" } else { Falha "Rele nao ligou" }
  Info "A aguardar 6s pelo corte automatico..."
  Start-Sleep -Seconds 6
  $st = Rpc "Switch.GetStatus?id=0"
  if (-not $st.output) { Ok "Rele DESLIGOU sozinho" } else { Falha "Rele continua ligado - a desligar a forca"; $null = Rpc "Switch.Set?id=0&on=false" }
} catch {
  Falha $_
  try { $null = Rpc "Switch.Set?id=0&on=false" } catch {}
}

Passo "5. Edge Function pump-status (cloud)"
if (-not $PumpSecret) {
  Info "Ignorado - passar -PumpSecret para testar"
} else {
  $raw = & curl.exe -s --max-time 10 -w "`n%{http_code}" -H "x-pump-secret: $PumpSecret" "$($FunctionUrl)?pump_id=polo2&on=0"
  $linhas = $raw -split "`n"
  $code = $linhas[-1]
  $body = ($linhas[0..($linhas.Length - 2)] -join "`n")
  if ($code -eq "401") {
    Falha "401 - funcao publicada COM verificacao JWT. Redeploy: npx supabase functions deploy pump-status --no-verify-jwt"
  } elseif ($code -ne "200") {
    Falha "HTTP $code - $body"
  } else {
    $st = ($body | ConvertFrom-Json).status
    if ($st -eq "idle") { Ok "Resposta: idle (sem pedidos autorizados)" }
    elseif ($st -eq "stop") { Info "Resposta: stop - havia um STOP pendente ou a migration 20260925000000 ainda nao foi aplicada" }
    else { Info "Resposta: $st - ATENCAO: havia um pedido autorizado, foi consumido por este teste" }
  }
}

Write-Host ""
if ($script:falhas -eq 0) {
  Write-Host "TUDO OK - pronto para ligar ao quadro da bomba." -ForegroundColor Green
} else {
  Write-Host "$($script:falhas) falha(s) - corrigir antes de ligar a bomba." -ForegroundColor Red
  exit 1
}
