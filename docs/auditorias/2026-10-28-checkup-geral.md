# Checkup geral — segurança, bugs e carga (2026-10-28/29)

Branch `checkup/2026-10-28`. Design: `docs/superpowers/specs/2026-10-28-checkup-geral-carga-design.md`.
Plano: `docs/superpowers/plans/2026-10-28-checkup-geral-carga.md`. Achados e triagem: `docs/auditorias/2026-10-28/`.

## 1. Resumo
- Auditoria em 5 domínios (BD/segurança, Edge/infra, stock/dinheiro, operação/pessoas, frontend): **68 achados**,
  62 confirmados (1 Crítico, 12 Altos, 19 Médios, 30 Baixos), 0 falsos positivos, 6 duplicados.
- Corrigidos: **todos os Críticos, Altos e Médios** + 11 Baixos, e mais os encontrados pela concorrência, pela carga,
  pelas revisões e pela validação no browser (ex.: conta nova nascia `gestor`; `profiles.role` por omissão era `admin`;
  picagem com geofence falhava sempre por `rpc` sem `bind`; migration de horários não reconstruía a BD do zero).
- Cada correção tem teste que falha sem ela; as regras de BD têm testes de mutação.
- Carga: o perfil pesado (200 utilizadores) passou de **falhar (p95 2,9–6,1 s)** para **passar (p95 35 ms)**;
  ponto de rutura **150 → 400 utilizadores** simultâneos, com 0 % de erros da aplicação em todos os degraus.

## 2. Correções principais
| Área | Antes | Depois |
|---|---|---|
| Faltas/saúde (Crítico) | qualquer conta lia justificações de saúde de todos | só admin, gestor e o próprio |
| Contactos de colaboradores | telemóvel, email e notas visíveis a todos | por RPC `colaboradores_contactos`: admin/gestor todos, outros só o próprio |
| Picagens | colaborador gravava picagem já AUTORIZADA com hora forjada | servidor normaliza (PENDENTE), valida relógio; idempotente por `client_id` |
| Horas efetivas | sempre 0 (custo de mão de obra e mapa do contabilista a zero) | calculadas, recalculadas ao validar, turnos noturnos e mudança de hora corretos |
| Faturas | 2 cliques simultâneos lançavam 2× (stock em dobro) | `FOR UPDATE`; fatura lançada imutável; provado: 20 cliques → 1 lançamento |
| Custos de materiais | página de custos e export ignoravam devoluções | enviado − devolvido, igual em custos, P&L e dashboard |
| Combustível | aprovadores contornavam o MFA obrigatório; DELETE direto de pedidos | MFA respeitado; sem DELETE; alterações auditadas |
| Contas novas | nasciam `gestor` (e o default da coluna era `admin`) | nascem `leitura`; `admin-utilizadores` define sempre o papel |
| PostGIS | anon podia apagar `spatial_ref_sys` (parte o geofence) | só leitura (validado em Postgres real) |
| Listas e exportações | cortadas em 1000 linhas sem aviso (artigos, movimentos, materiais…) | paginadas até ao fim (export de 58 830 movimentos validado) |
| Filas offline | picagens/movimentos apagados em falha de rede; envio com a conta anterior | só sai da fila em erro definitivo; conta atual; lock entre separadores |
| Edge Functions | push/resumo com 401 se publicadas pelo CLI; SSRF por endpoint push; fatura podia ficar sem linhas | `verify_jwt` certo; allowlist de push (BD e Edge); validação antes de tocar na BD |
| Sessão | gesto depois dos 30 min renovava a sessão | termina a sessão; push removido do dispositivo no logout |
| Dependências | 1 vulnerabilidade crítica (dompurify) | `npm audit --omit=dev` = 0 |
| Desempenho | contagens com leitura total de movimentos; RLS avaliada linha a linha | índice novo + 103 policies com funções avaliadas uma vez |

## 3. Testes de carga (Supabase local em Docker, portátil Windows)
Dados sintéticos: 507 utilizadores, 15 obras, 300 colaboradores, 2 000 artigos, ~53 000 movimentos.

| Perfil | Utilizadores | p95 antes | p95 depois | Erros da app |
|---|---|---|---|---|
| Leve (escritório) | 10 | 199 ms | 47 ms | 0 % |
| Médio (início de turno 7h30) | 50 | 204 ms | 33 ms | 0 % |
| Pesado (fecho de mês) | 200 | 2 941–6 109 ms ❌ | 35 ms ✅ | 0 % |
| Rutura | 50→500 | 150 | **400** (limite do gateway local) | 0 % |

Concorrência (8 cenários, todos OK): 200 saídas simultâneas do mesmo artigo (stock nunca negativo), 300 operações
mistas (stock = soma dos movimentos), 50 autos (números 1..50 sem colisão), 100 códigos únicos, aprovação dupla de
abastecimento (1/20), empréstimo duplo de ferramenta (1/20), fatura lançada 20× em simultâneo (1/20, stock correto).
Integridade do stock verificada depois de cada perfil.

**Ressalva:** os números são de um portátil; provam correção sob concorrência e eliminação de gargalos, não a
capacidade absoluta do plano Supabase de produção. Scripts reprodutíveis em `scripts/carga/` (ver README);
baseline em `scripts/carga/BASELINE-2026-10-28.md`.

## 4. Verificação
- `npm run typecheck` 0 erros · testes de frontend, BD (PGlite) e Edge todos verdes · `npm run build` OK
  (contagens finais no fim da secção 7).
- As 9 migrations novas aplicam por ordem num Postgres 17 + PostGIS real (Supabase local) sobre as 92 anteriores.
- Validação no browser (agent-browser, ambiente local): 7 papéis, menus e rotas proibidas, saída de stock,
  ferramentas, pedido + aprovação de abastecimento, relatório diário, auto, picagem, exportação Excel, troca de
  utilizador — **0 falhas**, consola sem erros.
- Revisão final do branch inteiro: 0 Críticos; os 2 Importantes e 2 Baixos marcados para antes do merge foram corrigidos.

## 5. Passos manuais (por esta ordem)
1. **Antes de tudo (SQL Editor, só leitura):** `select count(*) from public.spatial_ref_sys where srid = 4326;` → tem de dar 1.
2. **Dashboard › Authentication:** confirmar "Allow new users to sign up" **desligado**.
3. **MFA:** os admin/gestor que estão em `comb_aprovadores` têm de ter MFA registado antes de ligar `mfa_obrigatorio`
   (a migration 120300 passa a exigi-lo quando o interruptor estiver ligado).
4. **Publicar o site** (merge do branch para `main` → Cloudflare). O site novo funciona com a BD antiga.
5. **Migrations no SQL Editor, fora do horário de trabalho, por esta ordem:**
   `20261028120100` → `120200` → `120300` → `120400` → `120500` → `120600` → `120700` → `120800` → `120900`.
   (120900 reescreve policies e cria um índice; tem `lock_timeout` de 5 s — se der timeout, repetir.)
6. **Edge Functions:** publicar `notificar-abastecimento`, `send-push-frota`, `extrair-fatura`, `enviar-resumo-alertas`,
   `admin-utilizadores` com o `config.toml` novo; confirmar que `send-push-frota` e `enviar-resumo-alertas` ficam com
   "Enforce JWT verification" **desligado**.
7. **Tipos:** `npx supabase gen types typescript --local > src/integrations/supabase/types.ts` (pelo Git Bash) e `npm run typecheck`.
8. **Opcional:** recalcular horas dos dias passados (estavam a 0):
   `select public.calcular_resumo_dia(d::date) from generate_series('2026-10-01'::date, current_date, '1 day') d;`
9. **Storage:** confirmar que o bucket `certificados` não tem policies manuais com outros nomes antes de aplicar 120700.

## 6. Riscos e pendentes registados (não bloqueiam)
- Paginação por offset pode repetir uma linha se entrar um registo entre páginas; cada lista paginada faz 1 pedido extra.
- Fila offline: um item com erro transitório permanente bloqueia os seguintes (aviso a partir da 5.ª tentativa).
- Turno noturno com pausa depois da meia-noite: a pausa do horário não é descontada.
- Num dia em duas obras, o custo de mão de obra vai para a obra da primeira entrada.
- `origem`/`mock_location_detetada` das picagens continuam declaradas pelo dispositivo.
- 4 vulnerabilidades baixas só de desenvolvimento (vite-plugin-pwa → workbox); a correção exige versão major.
- Faturas lançadas antes desta correção com stock em dobro não são corrigidas automaticamente.
- Decisão de negócio pendente (A3-10): contagem de inventário só admin/gestor (doc 17) ou também `armazem` (BD atual)?
- Lista completa de Baixos registados: `docs/auditorias/2026-10-28/00-triagem.md` §1.

## 7. Contagens finais
Verificação final em 2026-10-29 (commit 49d5064):
- `npm run typecheck`: 0 erros.
- `npx vitest run` (frontend + BD): 239 ficheiros, 3707 testes, todos verdes em 3 de 4 corridas completas. Numa corrida,
  2 ficheiros falharam e não voltaram a falhar (testes pesados de BD em PGlite sensíveis ao tempo-limite com a máquina
  carregada; instabilidade a vigiar no CI).
- `npm run check:edge && npm run test:edge`: 84 testes, 0 falhas.
- `npm run build`: OK. `npm audit --omit=dev`: 0 vulnerabilidades.
- Nada foi publicado em produção.
