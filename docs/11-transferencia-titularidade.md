# 11 — Transferência de Titularidade para a ENCIVIL

> **Objetivo:** o sistema passa a pertencer à ENCIVIL (contas, dados, código,
> deploy). O Mickael continua a ser quem opera tudo — muda **quem é dono**,
> não quem trabalha. Princípio: *separar identidade de operação*.
>
> **Atualização (2026-11-12):** o deploy está no Cloudflare Pages (`main` faz deploy) em `app.encivilconstroi.com`, com o domínio ligado desde 2026-09-30; o backup da BD passou a ser noturno por GitHub Actions (`docs/22-seguranca-operacao.md` §3). O resto da checklist (contas, 2FA, Vercel, declaração de propriedade) está por confirmar em `docs/13-infraestrutura-e-contas.md` §5. O texto abaixo é o histórico de 2026-07-14.
>
> Estado em 2026-07-14:
> - Código: `github.com/mickaelorlande/armazem-encivil` (conta pessoal)
> - Base de dados: projeto Supabase `<project-ref>` (org pessoal, free tier)
> - Deploy: Vercel Hobby (conta pessoal — plano **proíbe uso comercial**)

**Ordem das fases: Backup → Identidade → Código → Dados → Deploy → Continuidade → Papel.**
As fases 0–3 fazem-se num dia. A fase 4 (deploy) pode ser feita a seguir com calma.

---

## Fase 0 — Backup total (ANTES de mexer em qualquer conta)

Nunca transferir nada sem uma cópia fora das plataformas.

1. **Código** — cópia integral do repositório com todo o histórico:
   ```powershell
   git bundle create encivil-backup-2026-07-14.bundle --all
   ```
2. **Base de dados** — dump completo (schema + dados) via Supabase CLI:
   ```powershell
   supabase db dump -f backup-schema-2026-07-14.sql
   supabase db dump -f backup-dados-2026-07-14.sql --data-only
   ```
3. **Segredos** — copiar `.env.local` e anotar todas as variáveis configuradas
   na Vercel (Settings → Environment Variables).
4. Guardar os três num local **fora do PC de trabalho** (disco externo ou
   drive da empresa).

✅ *Critério de saída: consegues reconstruir tudo só com estes ficheiros.*

---

## Fase 1 — Identidade institucional (a raiz de tudo)

Tudo o que vem a seguir pendura nesta identidade. É o passo mais importante.

### 1.1 E-mail da empresa

- **Se a ENCIVIL tem domínio próprio** (ex.: `encivil.pt`): criar
  `ti@encivil.pt` (ou `sistemas@`). É a opção correta.
- **Se não tem domínio**: criar já um Gmail neutro (ex.:
  `encivil.sistemas@gmail.com`) como interino, e **comprar o domínio esta
  semana** (~10–15 €/ano). O domínio também resolve o problema do URL da app
  (ver Fase 4).

### 1.2 Regras da conta

- **2FA obrigatório** (app authenticator, não SMS).
- Password gerada, guardada num **gestor de passwords** (Bitwarden serve,
  plano grátis).
- **Acesso de emergência para o dono da empresa**: envelope físico fechado com
  a password mestra + códigos de recuperação, guardado no cofre/escritório.
  (Baixa tecnologia, mas resolve o "e se o Mickael desaparecer amanhã".)

✅ *Critério de saída: existe um e-mail que sobrevive a qualquer pessoa,
com recuperação documentada.*

---

## Fase 2 — Código: GitHub Organization

1. Criar a organization **`encivil`** (plano Free chega — repos privados
   ilimitados): github.com → New organization → e-mail de faturação = o
   e-mail institucional da Fase 1.
2. Adicionar **dois owners**: a conta pessoal `mickaelorlande` (quem opera) e
   uma conta nova criada com o e-mail institucional (a "conta cofre", que fica
   guardada e não se usa no dia-a-dia).
3. Transferir o repositório: em `mickaelorlande/armazem-encivil` →
   Settings → Danger Zone → **Transfer ownership** → para a org `encivil`.
   - O GitHub cria **redirects automáticos** — clones, remotes e links antigos
     continuam a funcionar. Issues, histórico e branches vão todos juntos.
4. Atualizar o remote local (opcional mas limpo):
   ```powershell
   git remote set-url origin https://github.com/encivil/armazem-encivil.git
   ```
5. ⚠️ **A integração Vercel↔GitHub parte com a transferência.** Não faz mal:
   a Vercel vai ser desligada na Fase 4. Até lá, se precisares de deploy,
   reconecta o repo no dashboard da Vercel (2 min).

✅ *Critério de saída: o repo vive em `github.com/encivil/...`, com 2 owners,
e `git push` continua a funcionar.*

---

## Fase 3 — Dados: Supabase Organization

A transferência de projeto entre organizations no Supabase é **sem downtime**:
o URL (`<project-ref>.supabase.co`), as keys e os dados não mudam.
Os utilizadores não notam nada.

1. Com a **conta cofre** (e-mail institucional): criar conta no Supabase e
   criar a organization **ENCIVIL**.
2. Na org ENCIVIL: **convidar `orlandemickael@gmail.com` como Owner/Admin**
   (Organization → Team → Invite). Aceitar o convite.
3. Na org pessoal atual: abrir o projeto → Project Settings → General →
   **Transfer project** → escolher a organization ENCIVIL.
   - Pré-requisito: ser membro das duas orgs (garantido pelo passo 2).
4. Confirmar que a app continua a funcionar (não deve haver qualquer
   interrupção — nada mudou de URL nem de key).
5. **Assim que houver cartão da empresa**: passar a org ENCIVIL para o plano
   **Pro (~25 USD/mês)** — traz backups diários automáticos e o projeto nunca
   é pausado por inatividade. Sistema de produção em free tier é risco, não
   poupança.

✅ *Critério de saída: o projeto aparece dentro da org ENCIVIL; a conta
pessoal é membro, não dona.*

---

## Fase 4 — Deploy: sair da Vercel Hobby → Cloudflare Pages

**Porquê:** o plano Hobby da Vercel proíbe uso comercial (risco real de
suspensão sem aviso) e está na conta pessoal. O Cloudflare Pages permite uso
comercial no plano grátis. Isto já estava previsto no ARCHITECTURE.md §9.

### 4.1 O problema do URL (ler antes de migrar)

A app é uma **PWA instalada nos telemóveis da equipa**, apontada ao URL da
Vercel. Mudar de plataforma muda o URL → todos teriam de reinstalar. A solução
definitiva é um **domínio próprio** (ex.: `app.encivil.pt`): instala-se uma
vez e nunca mais se muda, independentemente de onde a app estiver hospedada.

**Recomendação: comprar o domínio primeiro (Fase 1.1), migrar depois, e a
equipa reinstala a PWA uma única vez — a última.**

### 4.2 Migração

1. Criar conta Cloudflare com o e-mail institucional (2FA + password no gestor).
2. Registar/transferir o domínio no próprio Cloudflare (registrar a preço de
   custo) ou apontar os DNS para lá.
3. Workers & Pages → Create → **Pages** → Connect to Git → autorizar a org
   `encivil` → escolher `armazem-encivil`.
   - Build command: `npm run build` · Output: `dist` · Framework: Vite
4. Environment variables (produção):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (a mesma da Vercel)
5. Custom domain: `app.encivil.pt` → HTTPS automático.
6. Testar tudo no URL novo: login, movimentos, relatórios PDF, instalação PWA,
   modo offline.
7. Atualizar no Supabase: Authentication → URL Configuration → Site URL e
   Redirect URLs para o domínio novo.
8. Janela de transição (1–2 semanas): avisar a equipa, cada um instala a PWA
   no URL novo. Depois: **apagar o projeto na Vercel** e fechar esse capítulo.
9. Nota: a regra do e-mail noreply nos commits (limitação da Vercel Hobby)
   deixa de ser necessária após a migração.

✅ *Critério de saída: app servida em domínio da empresa, numa conta da
empresa, num plano que permite uso comercial. Vercel eliminada.*

---

## Fase 5 — Continuidade (o "setor de TI" em papel)

### 5.1 Documento de continuidade

Criar um documento de 1–2 páginas (fora deste repo — ex.: impresso + drive da
empresa) com:

| Item | Conteúdo |
|---|---|
| O que existe | ENCIVIL Gestão: app web (Cloudflare Pages) + base de dados (Supabase) + código (GitHub org `encivil`) |
| Contas | E-mail institucional (raiz), GitHub org, Supabase org, Cloudflare, registrar do domínio |
| Credenciais | Onde está o gestor de passwords; onde está o envelope de emergência |
| Custos mensais | Supabase Pro ~25 USD · domínio ~12 €/ano · resto grátis — **o que acontece se deixar de ser pago** |
| Responsável técnico | Mickael Orlande · contacto |
| Se o responsável não estiver disponível | Passos: abrir envelope → aceder ao e-mail raiz → todas as contas recuperam-se a partir daí. Qualquer programador ou empresa de TI consegue assumir com o repo + este documento. |

### 5.2 Backups fora do fornecedor

Rotina (mensal no mínimo, semanal ideal): `supabase db dump` → guardar num
storage da empresa (drive institucional). O plano Pro faz backups diários,
mas dentro do próprio Supabase — a cópia externa protege contra perda de
conta/fornecedor.

✅ *Critério de saída: se o Mickael for atropelado por um autocarro, a ENCIVIL
recupera o sistema em dias, não nunca.*

---

## Fase 6 — O papel (formalização)

Uma conversa com o dono + um e-mail escrito. Sugestão de texto:

> *"Confirma-se que o sistema ENCIVIL Gestão (aplicação, código-fonte e dados),
> desenvolvido por Mickael Orlande, é propriedade da ENCIVIL, que assume os
> custos de operação. Mickael Orlande é o responsável técnico pelo sistema,
> pela sua manutenção e evolução. As credenciais de emergência encontram-se
> depositadas em [local], acessíveis à gerência."*

Assinado/respondido pelo dono, fica arquivado. Protege a empresa (é dona de
facto e de direito) e protege o Mickael (reconhecimento formal do que
construiu e do papel que exerce).

✅ *Critério de saída: a pergunta "de quem é este software?" tem resposta escrita.*

---

## Checklist resumo (estado em 2026-07-14)

- [x] **F0** Backup do código (`git bundle`) + segredos em `C:\ENCIVIL-Backup-2026-07-14`
- [ ] **F0** Backup da base de dados (`supabase db dump`) — substituído pelo backup noturno do GitHub Actions (por confirmar que está ativo)
- [x] **F1** E-mail institucional criado: `encivil.sistemas@hotmail.com` (interino)
- [ ] **F1** 2FA nas contas novas + gestor de passwords + envelope de emergência
- [ ] **F1** Usar o domínio `encivil.pt` da empresa (e-mail `ti@encivil.pt` + `app.encivil.pt`)
- [x] **F2** GitHub org `Encivil-Constroi` + repo `encivil-gestao` com histórico completo
- [x] **F3** Projeto Supabase `<project-ref>` transferido para a org da empresa
- [ ] **F3** Apagar projeto vazio `<project-ref-vazio>` + utilizador de teste do auth
- [ ] **F3** Plano Pro com cartão da empresa (quando disponível)
- [x] **F4** Cloudflare Workers ligado ao GitHub, app funcional em `encivil-gestao.encivil-sistemas.workers.dev` (login validado)
- [ ] **F4** Domínio `app.encivil.pt` + PWA reinstalada pela equipa
- [ ] **F4** Projeto Vercel apagado (até lá: Vercel serve a equipa, congelada — pushes vão só para a org)
- [ ] **F5** Documento de continuidade entregue ao dono + rotina de backups externa
- [ ] **F6** Declaração de propriedade escrita e arquivada

> Nota (14/07): as variáveis de build no Cloudflare foram coladas com o nome
> dentro do valor ("Invalid API key"). Solução definitiva no commit `98f1108`:
> URL + publishable key (públicas) embutidas como fallback em
> `src/integrations/supabase/client.ts`; env vars válidas têm prioridade.
