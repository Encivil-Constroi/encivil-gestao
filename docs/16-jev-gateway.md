# 16 — JEV gateway no desenvolvimento

> 2026-10-01. Ferramenta de **desenvolvimento**, não do ERP: nada do site nem do
> Supabase passa por aqui. Decisão final só depois da medição (§5).

## 1. O que é

[`jev-gateway`](https://www.npmjs.com/package/jev-gateway) é um gateway local
(`127.0.0.1:8789`) entre o Claude Code e a API da Anthropic. Em cada turno em que
o agente tem ferramentas disponíveis, pergunta ao **Jev** (modelo da TypeSafe,
aqui via OpenCode, plano gratuito `jev-1.13-free`) qual a ferramenta certa; com
confiança suficiente, encaminha o modelo para ela. O objetivo é gastar menos
tokens do modelo caro. Se o Jev falhar ou demorar, o pedido segue direto — o
gateway nunca faz um pedido falhar.

Não serve para o ERP (fotos, faturas, fraude, segurança): ver a análise em que
se baseia esta decisão — só o desenvolvimento tem agentes com ferramentas.

## 2. Instalação nesta máquina

| Peça | Onde |
|---|---|
| Pacote | `npm install -g jev-gateway` |
| Chave do Jev (OpenCode) | `%USERPROFILE%\.jev-gateway\.env` — só o utilizador lê; **nunca no repositório** |
| Ligação do Claude Code | `%USERPROFILE%\.claude\settings.json` → `"env": { "ANTHROPIC_BASE_URL": "http://localhost:8789" }` |
| Arranque automático | Agendador de Tarefas: **"JEV gateway (Claude Code)"**, ao iniciar sessão, executa `wscript.exe %USERPROFILE%\.jev-gateway\iniciar-oculto.vbs` (corre `jev-claude --start` sem janela) |
| Logs | `%USERPROFILE%\.jev-gateway\claude.log` |

## 3. Ligar e desligar

- **Desligar só o routing** (mede o baseline, o tráfego continua a passar): `jev-claude --routing off` — voltar com `--routing on`.
- **Desligar de vez:** remover o bloco `"env"` do `settings.json` e reiniciar o VS Code:
  ```powershell
  $f="$env:USERPROFILE\.claude\settings.json"; $j=Get-Content $f -Raw | ConvertFrom-Json; $j.PSObject.Properties.Remove('env'); $j | ConvertTo-Json -Depth 5 | Set-Content $f -Encoding utf8
  ```
  e, se quiser, apagar a tarefa: `Unregister-ScheduledTask -TaskName 'JEV gateway (Claude Code)' -Confirm:$false`.
- **Estado:** `jev-claude --status` · **decisões em direto:** `jev-claude --logs` · **painel:** http://localhost:8789/dashboard

**Se o Claude Code deixar de responder:** o gateway não está a correr. `jev-claude --start`, ou desligar de vez (acima).

## 4. Riscos

- **Dados:** o texto de cada turno com ferramentas (código, conversa, saída de comandos) vai também para a TypeSafe, via OpenCode. Não colar segredos na conversa. O Jev só lê texto (imagens viram marcadores) e os últimos ~32k tokens.
- **Latência:** +0,5 a 1 s por turno com ferramentas.
- **Escolha errada:** um turno forçado para a ferramenta errada pode sair incompleto e o agente repete. Se acontecer com frequência, subir `JEV_MIN_CONFIDENCE` (hoje 0,7).
- **Máquina local:** qualquer processo desta máquina pode usar o gateway (não é acessível de fora).
- **Dependência:** projeto independente, não oficial da TypeSafe nem da Anthropic.

## 5. Medição e decisão

**Protocolo:** 5 sessões com `--routing off` e 5 com `--routing on`, de tarefas
comparáveis (ex.: corrigir um teste, uma migration pequena, uma página). No fim
de cada bloco, registar do painel (filtro "All") os números abaixo.

| | Baseline (routing off) | Com routing | Diferença |
|---|---|---|---|
| Sessões | — | — | |
| LLM input tokens (total) | — | — | — |
| LLM input tokens por sessão | — | — | — % |
| Pedidos encaminhados pelo Jev | n/a | — % | |
| Latência Jev p95 | n/a | — ms | |
| Turnos repetidos / respostas incompletas | — | — | |

Referência à data da instalação (1 pedido, sem baseline): 0 % encaminhado,
latência 1 148 ms, confiança média 0,87.

**Decisão:** manter se a poupança de tokens por sessão for **≥ 10 %** e a
latência p95 do Jev **< 1,5 s**, sem aumento visível de turnos repetidos.
Caso contrário, desligar de vez (§3) — uma peça a menos.

**Resultado:** _por preencher após a medição._

## 6. Verificação feita

- Tarefa do Agendador criada e executada (resultado 0); `jev-claude --status` → `router up on http://127.0.0.1:8789`.
- Sessão do Claude Code a passar pelo gateway (`ANTHROPIC_BASE_URL=http://localhost:8789`).
- **Falta:** confirmar que sobe sozinho depois de reiniciar o Windows.
