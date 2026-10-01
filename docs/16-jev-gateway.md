# 16 — JEV gateway no desenvolvimento

> 2026-10-01. Ferramenta de **desenvolvimento**, não do ERP: nada do site nem do
> Supabase passa por aqui. Decisão final só depois da medição (§5).

## 1. O que é

[`jev-gateway`](https://www.npmjs.com/package/jev-gateway) é um gateway local
entre os clientes de desenvolvimento e os respetivos fornecedores: Codex em
`127.0.0.1:8789` e Claude Code em `127.0.0.1:8790`. Em cada turno em que
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
| Pacote | `npm install -g jev-gateway` (versão instalada: `0.5.0`) |
| Chave do Jev (OpenCode) | `%USERPROFILE%\.jev-gateway\.env` — só o utilizador lê; **nunca no repositório** |
| Ligação do Claude Code | `%USERPROFILE%\.claude\settings.json` → `"env": { "ANTHROPIC_BASE_URL": "http://localhost:8790" }` |
| Ligação do Codex | `%USERPROFILE%\.codex\config.toml` → fornecedor `jev-gateway`, API Responses em `http://localhost:8789/v1`, login ChatGPT existente |
| Ambiente OpenAI | `OPENAI_BASE_URL=http://localhost:8789/v1` persistido nas variáveis do utilizador Windows e em `shell_environment_policy.set` do Codex |
| Portas persistidas | `%USERPROFILE%\.jev-gateway\.env` → `JEV_CODEX_PORT=8789`, `JEV_CLAUDE_PORT=8790` |
| Arranque automático | Agendador de Tarefas: **"JEV gateway (Claude Code)"**, ao iniciar sessão, executa `wscript.exe %USERPROFILE%\.jev-gateway\iniciar-oculto.vbs` (corre `jev-claude --start` sem janela) |
| Arranque automático Codex | Agendador de Tarefas: **"JEV gateway (Codex)"**, ao iniciar sessão, executa `wscript.exe %USERPROFILE%\.jev-gateway\iniciar-codex-oculto.vbs` (lança Node com `bin/jev-codex.mjs --start` sem janela) |
| Logs | `%USERPROFILE%\.jev-gateway\codex.log` e `claude.log` |

## 3. Ligar e desligar

- **Desligar só o routing** (mede o baseline, o tráfego continua a passar): `jev-claude --routing off` — voltar com `--routing on`.
- **Desligar de vez:** remover o bloco `"env"` do `settings.json` e reiniciar o VS Code:
  ```powershell
  $f="$env:USERPROFILE\.claude\settings.json"; $j=Get-Content $f -Raw | ConvertFrom-Json; $j.PSObject.Properties.Remove('env'); $j | ConvertTo-Json -Depth 5 | Set-Content $f -Encoding utf8
  ```
  e, se quiser, apagar a tarefa: `Unregister-ScheduledTask -TaskName 'JEV gateway (Claude Code)' -Confirm:$false`.
- **Estado Claude:** `jev-claude --status` · **decisões em direto:** `jev-claude --logs` · **painel:** http://localhost:8790/dashboard
- **Estado Codex:** `jev-codex --status` · **arranque manual:** `jev-codex --start` · **painel:** http://localhost:8789/dashboard

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

- Tarefa do Agendador do Claude criada e executada (resultado 0); inicialmente na porta 8789, agora configurada para 8790.
- Ligação do Claude Code configurada para `ANTHROPIC_BASE_URL=http://localhost:8790`.
- Tarefa do Agendador do Codex criada e executada (resultado 0); gateway na porta 8789.
- Codex `0.159.2` da extensão VS Code: `--strict-config doctor --json` confirmou configuração válida, fornecedor `jev-gateway`, autenticação existente e endpoint local acessível.
- Pedido real com `gpt-6-astra` para `http://localhost:8789/v1/responses`: HTTP 200, SSE concluído e resposta `JEV_PROXY_OK`; cabeçalho `x-jev-gateway-mode=passthrough` (pedido sem ferramentas).
- Teste de `/router/decide?format=responses`: Jev selecionou `get_weather`, confiança 1, latência 853 ms; nenhuma ferramenta executada.
- **Falta:** confirmar que sobe sozinho depois de reiniciar o Windows.

## 7. Codex: configuração permanente e ativação

Configuração no ficheiro do utilizador `%USERPROFILE%\.codex\config.toml`:

```toml
model_provider = "jev-gateway"
openai_base_url = "http://localhost:8789/v1"

[model_providers.jev-gateway]
name = "JEV gateway local"
base_url = "http://localhost:8789/v1"
wire_api = "responses"
requires_openai_auth = true
supports_websockets = false

[shell_environment_policy.set]
OPENAI_BASE_URL = "http://localhost:8789/v1"
```

O modelo e o nível de raciocínio anteriores foram preservados. O fornecedor
explícito encaminha os pedidos Responses dos modelos compatíveis disponíveis
na conta pelo mesmo proxy. O gateway encaminha para
`https://chatgpt.com/backend-api/codex`, porque a autenticação atual é ChatGPT.
HTTP/SSE é usado porque o gateway não implementa o transporte WebSocket.

Reiniciar o VS Code/Codex e abrir um novo chat para carregar o fornecedor.
Reiniciar também os clientes Claude já abertos para adotarem a porta 8790.
Uma sessão já iniciada pode manter o fornecedor e o endereço anteriores;
alterar ficheiros e variáveis persistidas não reconfigura processos em execução.

Esta instância está validada para Responses com login ChatGPT. Clientes que
usam uma chave da API OpenAI ou endpoints como Chat Completions precisam de
uma instância com upstream `https://api.openai.com/v1` e credenciais próprias.
Definir `OPENAI_BASE_URL` não torna todos os endpoints de fornecedores diferentes
compatíveis com o backend ChatGPT.

O diagnóstico usou o executável da extensão
`openai.chatgpt-26.928.31416-win32-x64/bin/windows-x86_64/codex.exe`.
O comando `codex` no PATH resolve primeiro um pacote npm antigo, versão
`0.2.3`; esse executável não foi usado para validar a configuração atual.

Backup anterior à integração em
`%USERPROFILE%\.jev-gateway\backups\codex-20261001-103013\`:
`codex-config.toml`, `claude-settings.json`, `jev.env` e `previous-state.json`.
O backup da configuração JEV contém credenciais e deve ficar fora do repositório.
Para reverter, parar os dois gateways, restaurar esses três ficheiros nos
respetivos locais e o valor anterior de `OPENAI_BASE_URL` registado no JSON,
remover a tarefa **"JEV gateway (Codex)"**, iniciar `jev-claude --start` e
reiniciar os clientes. Rever alterações posteriores antes de restaurar backups.

Referência de configuração:
https://learn.chatgpt.com/docs/config-file/config-advanced
