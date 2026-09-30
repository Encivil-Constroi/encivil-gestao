# 14 — O que aproveitar do protótipo FlutterFlow

> Análise de 2026-09-30 das 45 capturas do protótipo FlutterFlow feito por um
> colega (parado, ~60%). Capturas em `_referencia/capturas/` (fora do git).
> Decisão: **não** continuar o FlutterFlow nem manter dois sistemas — trazer para
> o ENCIVIL Gestão (React + Supabase) os ecrãs e fluxos que ele pensou melhor,
> com a lógica no servidor (Postgres + RLS), como o resto do sistema. Ver ADR-009.

## O que é o protótipo

Sobretudo **desenho de ecrãs e fluxos** (vários mostram ainda dados de exemplo
como `[matricula]`, `Page Title`), pensado para o telemóvel de quem está no
terreno: botões grandes, poucos campos por ecrã, escolhas por toque em vez de
escrita. O backend não é visível nas capturas. O valor está nos fluxos — é isso
que se aproveita.

## Módulo a módulo

Legenda: ✅ já existe cá e está ao nível ou melhor · ⭐ ele pensou melhor — trazer ·
➕ não existe cá

| Módulo | O que ele tem | Cá hoje | Veredito |
|---|---|---|---|
| **Frota — entregar / devolver viatura** | Entrega: viatura livre, obra de destino, condutor, data, km, **nível de combustível** (reserva/¼/½/¾/cheio), AdBlue, óleo, refrigeração, pneus, limpeza com botões N/A-Baixo-OK, **diagrama do carro onde se toca para marcar danos**, inventário de segurança (colete, triângulo, documentos, macaco). Devolução: o mesmo + km finais, comparado com a entrega | Atribuição de condutor + checklist, em ecrãs separados | ⭐➕ **O mais valioso.** É exatamente o "responsabilizar pelo estado do carro" pedido pelo Carlos: o que mudou entre a entrega e a devolução fica provado, com quem estava a viatura |
| **Frota — estado da viatura** | Livre / Em uso / **Oficina**; filtro por obra; interruptor "viatura operacional"; fotos dos documentos do seguro e da IPO | Prazos e alertas (Fase 9); sem estado "oficina", sem obra, sem fotos de documentos | ⭐ Trazer estado + obra + fotos de documentos |
| **Manutenção — registo** | Uma intervenção marca **vários trabalhos de uma vez** (chips: óleo motor, filtro óleo, filtro ar…) | Um trabalho por registo | ⭐ Trazer: uma revisão = vários itens, cada um recomeça o seu prazo |
| **Navegação — início** | **Mosaico de 8 botões grandes** (Abastecer, Stock, Frota, Manutenção, Obras, Requisições, Relatórios, Equipa) | Menu lateral + barra inferior | ⭐ Trazer como página inicial no telemóvel, só com os botões do papel de cada um |
| **Obras** | Código interno (ex. OB-2026-01), **datas de início e fim previsto**, **% de progresso**, estado (planeamento/em curso/concluída), morada com mapa, painel da obra (materiais, equipa, frota, ferramentas, relatório, fotos) | Nome, cliente, localização, estado, orçamentos, ficha agregadora, custos | ⭐➕ Trazer código, datas, progresso e o painel com atalhos |
| **Obras — relatório diário** | "Checklist de fim de dia" num só ecrã: meteorologia por toque, trabalhos feitos, **contagem da equipa presente** (−/+), ocorrências sim/não, fotos da câmara ou galeria | Livro de obra (registos por categoria, com fotos) | ⭐ Trazer o formato de um relatório diário único, gravado no livro de obra que já existe |
| **Equipa** | Filtros por grupo (encarregados, motoristas, administrativo, empresas do grupo), **botão de ligar**, foto, telemóvel, email | Colaboradores (nome, nº mecanográfico, NIF, cargo, obra) | ➕ Trazer telemóvel com ligar, foto, email e filtros por grupo |
| **Perfil próprio** | Foto, telemóvel, alterar credencial | — | ➕ Pequeno, útil |
| **Armazém** | Foto do artigo; botões Entrada/Saída em cada artigo da lista; "novo total" em tempo real; entrada vinda de uma obra; saída como devolução a fornecedor | Tudo o essencial (movimentos atómicos, histórico, alertas de stock, por obra) | ✅ + ⭐ pequenos atalhos (foto, botões rápidos, novo total) |
| **Abastecimento** | Com conta de utilizador: "os meus pedidos"; **foto inicial e final do contador da bomba** (litros = diferença) | QR sem conta, autorização, bomba Polo 2 automática, leitura por IA, aprovação final | ✅ o nosso é mais completo; ⭐ a foto inicial + final do contador é uma boa ideia contra fraude — avaliar |
| **Ferramentas** | Transferir para obra / devolver ao armazém / em uso | Empréstimos com termo de responsabilidade assinado, por obra | ✅ |
| **Entrar na app** | Email + **PIN de 6 dígitos**, "Ativar conta", **troca obrigatória do PIN provisório** no 1.º acesso | Email + password, convites, reposição | ⚠️ Decidir com a Direção: um PIN é mais fácil para quem está no terreno mas bem mais fraco que uma password. A troca obrigatória da credencial provisória vale a pena trazer já |
| **Notificações** | Ecrã por fazer | Sino + notificações push | ✅ |

## Ordem proposta

1. **Frota — entregar / devolver viatura com diagrama de danos** + estado
   livre/em uso/oficina + obra da viatura. Continua a Fase 9 e responde ao
   pedido do Carlos.
2. **Manutenção com vários trabalhos numa intervenção** (pequeno, na Fase 9).
3. **Início em mosaico no telemóvel**, por papel.
4. **Obras**: código, datas, progresso, painel da obra + **relatório diário**.
5. **Equipa e perfil**: telemóvel com ligar, foto, email, filtros.
6. **Armazém**: foto do artigo e atalhos.
7. **Abastecimento**: foto inicial/final do contador (avaliar com a bomba Polo 2).
8. **PIN** — só depois de decisão da Direção sobre o risco.

Cada item segue o processo de sempre: migration com testes num Postgres real,
mutações, verificação em produção, e nada do que já funciona fica partido.
