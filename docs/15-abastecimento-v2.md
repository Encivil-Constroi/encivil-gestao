# 15 — Abastecimento v2

> 2026-09-30. Pedido da Direção: pedido só com conta, aprovação só pelo CEO (ou
> quem ele designar), notificação imediata no telemóvel, leitura do contador da
> bomba antes e depois, e um relatório de análise para o CEO.
> Migrations `20260930000000_abastecimento_papel_motorista.sql` e
> `20260930010000_abastecimento_v2.sql`.

## O fluxo

1. **Pedir** (`/abastecimento/pedir`) — com sessão iniciada. O nome e a viatura vêm
   preenchidos: nome do colaborador ligado à conta (ou do perfil), viatura
   atribuída na Frota, ou a viatura do QR colado no carro (`/pub/combustivel?v=`
   redireciona para `/abastecimento/pedir?v=`). O motorista escolhe onde abastece
   (Polo 2, carrinha, posto de rua) e gasóleo/gasolina, e **fotografa os km na
   hora** (a câmara abre direto; fotos com mais de 10 min são recusadas). A IA
   lê os km e o motorista confirma ou corrige.
2. **Notificação imediata** a quem aprova: um trigger no banco chama a Edge
   Function `notificar-abastecimento` (pg_net), que envia a push cifrada
   (RFC 8291) com motorista, viatura, km, combustível e local. A notificação
   fica no ecrã até ser vista, vibra e põe o número de pedidos no ícone da app.
3. **Decidir** — só `comb_aprovadores` (o CEO e quem ele designar); sem ninguém
   designado, os admin. Autorizar ou recusar com motivo (há motivos rápidos).
   O motorista recebe logo a notificação da decisão.
4. **Executar na Polo 2** — no ecrã do pedido:
   foto do contador da bomba (leitura por IA, ou escrita se a IA falhar) →
   **LIGAR BOMBA** (o Shelly liga no próximo contacto, ≤ 5 s, por 10 min no
   máximo) → abastecer → **Terminei** → foto do contador no fim.
   Litros = final − inicial; custo = litros × preço em vigor.
   **Posto de rua / carrinha**: foto do talão (litros + valor) ou do medidor.
5. **Registo** — a conclusão entra logo nos abastecimentos; o pedido fica
   guardado com as três fotos, as leituras (e se vieram da IA ou à mão), as
   horas de cada passo e quem decidiu.

## Quem faz o quê

| | Motorista | Aprovador (CEO / designados) | Gestor / armazém / leitura | Admin |
|---|---|---|---|---|
| Pedir abastecimento | ✅ (só isto) | ✅ | ✅ | ✅ |
| Ver pedidos | os seus | todos | todos (sem decidir) | todos |
| Autorizar / recusar / cancelar | — | ✅ | — | só se não houver designados |
| Corte de emergência da bomba | — | ✅ | gestor e armazém, como antes | ✅ |
| Designar aprovadores, preço por litro | — | — | — | ✅ (`/abastecimento/configuracao`) |
| Relatório (`/abastecimento/analise`) | — | ✅ | ✅ | ✅ |

O papel **motorista** fica isolado como o mecânico: o site só lhe mostra o
pedido, os seus pedidos e a ajuda. A segurança real está no banco (RLS e RPCs):
o motorista só lê os seus pedidos e abastecimentos, só envia fotos para o seu
pedido autorizado e só liga a bomba do seu pedido.

**Ligar a conta ao colaborador** (Colaboradores → editar → "Conta na app", só o
admin): é isso que faz a viatura atribuída na Frota aparecer sozinha.

## "Os meus pedidos" e o controlo do CEO

`/abastecimento`: o aprovador vê todos, com filtros (a aguardar,
autorizados, concluídos, recusados/cancelados). Os que aguardam aparecem do
mais antigo para o mais recente, com o tempo de espera: até 30 min normal,
30–60 min atenção, **mais de 1 h crítico** (com aviso no topo). Decide ali
mesmo, sem abrir o pedido.

## Relatório — o analista de dados

`/abastecimento/analise`: período (esta semana, este mês, 30/90 dias, este
ano) e viatura, sempre comparado com o período anterior do mesmo tamanho.

- Indicadores: custo, litros, abastecimentos, preço médio, consumo médio
  (L/100 km) e tempo típico de resposta aos pedidos.
- **"O que os números dizem"** (regras em `src/features/combustivel/lib/analise.ts`):
  custo a subir/descer (±15 %, crítico a partir de +40 %); viatura com consumo
  30 % acima da mediana da frota (crítico a partir de 60 %); mesma viatura
  abastecida mais de uma vez no mesmo dia; pedidos com km fora do normal;
  pedidos que esperaram mais de 1 h; custo extra do posto de rua face à bomba
  da empresa; viatura que concentra 40 % do gasto; motoristas com 3+ recusas.
- Gráficos: custo/litros por dia, semana ou mês; ranking por viatura e por
  motorista; origem do combustível; tabelas completas e exportação para Excel.
- Paleta validada para daltonismo e contraste (claro e escuro), um só eixo por
  gráfico, valores sempre também em texto/tabela.

## Segurança — o que mudou

- Acabou o pedido anónimo: fora o INSERT anónimo, as RPCs anónimas
  (`check_pend_rate_limit`, `concluir_abastecimento`, `estado_bomba` para anon,
  `foto_abastecimento_valida`) e o upload anónimo de fotos. Inventário de
  funções executáveis por anónimo: só as 4 de sistema.
- A foto só se envia para o próprio pedido (ou, a dos km, para um pedido
  ainda por criar) e as RPCs confirmam que a foto existe e é desse pedido.
- `ler-foto-abastecimento` exige sessão, lê a foto pelo storage (nunca por
  URL vindo do browser) e só para o próprio pedido.
- A Edge Function `send-push` (sem texto, chamada sem login) foi retirada.
- A bomba: o token que liga o relé só é criado no "Ligar bomba" (não na
  autorização), dura 5 min até o Shelly o apanhar, e a janela é de 10 min.
  O Shelly e a `pump-status` não mudaram.
- Um pedido gera no máximo um abastecimento (índice único). O anti-duplicados
  antigo (viatura + dia + litros + custo) passou a valer só para registos
  manuais — com pedido, dois abastecimentos iguais no mesmo dia são legítimos.

## Publicação (ordem) — feita em 2026-09-30

1. SQL Editor: `20260930000000_abastecimento_papel_motorista.sql`, depois
   `20260930010000_abastecimento_v2.sql`.
2. Edge Functions (Dashboard, colar só o `index.ts`):
   - **nova** `notificar-abastecimento` — "Verify JWT" **desligado** (como a
     `send-push-frota`: quem a chama é o banco, com o segredo gerado lá);
   - `ler-foto-abastecimento` (atualizada);
   - `admin-utilizadores` (aceita o papel motorista);
   - apagar a `send-push`.
3. Site: push para `main` (Cloudflare Pages).
4. Na app, como admin: Abastecimento → Configuração → escolher o CEO como
   aprovador e pôr o preço por litro do gasóleo/gasolina.
5. Criar as contas dos motoristas (papel **Motorista**, com nome) e ligá-las
   aos colaboradores.

## Verificação feita antes de publicar

- Banco (PGlite com todas as migrations): 232 testes; 72 mutações no SQL
  novo, todas apanhadas exceto 2 equivalentes (comprimento do segredo, já
  garantido pela restrição CHECK; janela de 600 s repetida no "Ligar bomba").
- Edge Functions: 30 testes Deno (cifra contra o exemplo da RFC 8291,
  mensagens, regras de acesso da leitura por IA, interpretação da resposta).
- Frontend: testes de fases, números, analista, contrato das RPCs com o SQL
  (nomes dos parâmetros lidos das migrations), ecrãs, isolamento do motorista,
  notificações; mutações no frontend e nas Edge Functions.
- Desempenho: o JS de arranque cresce 6,8 kB (+1,1 %) — só o menu, o
  isolamento e as notificações; os ecrãs novos e o relatório carregam à parte.

## Pendentes conhecidos

- A leitura por IA demora (medido: ~20 s com o modelo completo sobrecarregado).
  Passou a usar o Flash-Lite primeiro; medir outra vez nos Logs depois de
  publicar (linha `[ler-foto] tempos`).
- A regra "foto na hora" confia na data do ficheiro que o telemóvel entrega —
  trava a galeria, não trava uma manipulação deliberada; a foto fica guardada
  e visível para quem aprova.

## Organização em módulos (2026-10-01)

- **Abastecimento** (`/abastecimento`, um só item no menu): Pedidos · Histórico ·
  Análise · Bomba Polo 2 · Configuração, conforme o papel. "Pedir combustível" no
  topo. O motorista vê só "Pedir combustível" e "Os meus pedidos".
- O registo manual sai do dia a dia: só o admin lança ou corrige registos
  (Histórico → "Lançar registo manual" / clicar num registo sem pedido).
- **Viaturas e máquinas** passaram para a **Frota**: "Nova viatura", e na ficha
  de cada viatura "Editar", "QR" (imprimir para colar no carro) e "Consumo"
  (abre a Análise filtrada por essa viatura).
- Endereços antigos continuam a funcionar e redirecionam (`/combustivel…`,
  `/abastecer…`, `/pub/combustivel?v=`), incluindo as notificações já enviadas.
- Plano: `docs/plans/2026-10-01-modulos-abastecimento-frota.md`.
