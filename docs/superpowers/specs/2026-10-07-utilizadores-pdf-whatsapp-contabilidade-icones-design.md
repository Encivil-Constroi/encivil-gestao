# Utilizadores sem travas, PDFs, WhatsApp, Contabilidade e Ícones — Desenho

Data: 2026-10-07 · Estado: aprovado pelo utilizador · Execução: subagentes em paralelo por bloco.

## Objetivo
1. O admin cria contas diretamente na app (com ou sem email), com senha e papel, sem depender de SMTP.
2. Todos os impressos/PDF com a identidade visual atual.
3. Envio de relatórios por WhatsApp pedindo o número antes, com texto e com o PDF.
4. Contabilidade revista e completa para o contabilista (processamento salarial, CT português, faturas).
5. Ícones PWA/favicon com a identidade atual (logo branco sobre `#04090F`).

Fora de âmbito: obrigar troca de senha no 1.º login (decisão do utilizador: a senha fica), faturação/pagamentos, cálculo de salários (o contabilista processa; nós entregamos os mapas).

## A. Criação de utilizador

### Edge Function `supabase/functions/admin-utilizadores/index.ts`
- Ação nova `criar` — payload `{ email?, login?, senha, nome, role, colaboradorId?, telemovel?, fotoPath? }`.
  - Email efetivo: `email` normalizado (trim, lowercase) se existir; senão `login` normalizado → `${login}@contas.encivilconstroi.com`.
    `login`: `^[a-z0-9._-]{3,40}$` após normalização (minúsculas, sem acentos, espaços → `.`).
  - `senha` com ≥ 8 caracteres. `role` ∈ ROLES_VALIDOS. `nome` obrigatório.
  - `auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } })`.
  - Atualiza `profiles` (nome, role, telemovel, foto_path) e liga `colaboradores.user_id` quando há `colaboradorId`.
    **Se qualquer destas escritas falhar → `auth.admin.deleteUser(id)` e devolve erro** (sem contas com papel errado).
  - Email duplicado → "Este email/utilizador já está registado no sistema."
- Ação nova `redefinirSenha` — `{ userId, senha }` (≥ 8) → `updateUserById(userId, { password })`.
- `listar` devolve também `login` (parte local quando o domínio é o interno) e `semEmail: boolean`.
- `convidar` mantém-se (compatibilidade), mas a UI deixa de o usar.
- Lógica pura (normalizar login, email efetivo, validar senha) num módulo `supabase/functions/admin-utilizadores/regras.ts`
  e espelhada no frontend em `src/features/auth/lib/contaInterna.ts` (testado em Vitest). Domínio interno: constante
  `DOMINIO_CONTA_INTERNA = 'contas.encivilconstroi.com'`.

### Frontend
- `utilizadoresService.chamarAdmin`: quando `functions.invoke` devolve erro HTTP, ler `error.context` (Response) e mostrar
  `erro` do corpo JSON; fallback à mensagem genérica em pt-PT.
- Serviços novos: `criarUtilizador(dados)`, `redefinirSenha(userId, senha)`.
- `GestaoUtilizadoresPage`: modal "Novo utilizador" — nome, email (opcional) **ou** utilizador, senha (mostrar/gerar),
  papel. Ação "Redefinir senha" por linha. Lista mostra o utilizador quando não há email.
- `contaFicha.sincronizarConta`: cria conta via `criarUtilizador` (email opcional, login = nº mecanográfico por defeito,
  senha obrigatória quando cria). `ColaboradorForm`/`PermissoesSwitches` ganham campos utilizador + senha quando ainda
  não há conta.
- `LoginPage`: campo "Email ou utilizador"; sem `@` → `paraEmailLogin(valor)` (mesma normalização).

## B. Impressos com identidade

`src/app/components/print/`:
- `printTheme.ts` — `TINTA '#04090F'`, `MARCA '#001C7D'`, `SUAVE '#64748b'`, `LINHA '#e2e8f0'`, `FUNDO '#f8fafc'`,
  `FONTE "'Geist', system-ui, sans-serif"`, `FONTE_MONO`.
- `CabecalhoImpresso` — logo `/icone_oficial.png`, "ENCIVIL", título, subtítulo opcional, data/hora `Europe/Lisbon`,
  barra inferior na cor de marca.
- `RodapeImpresso` — "ENCIVIL Gestão · gerado em DD/MM/AAAA HH:MM · documento interno".
- `estiloPaginaImpressa(id)` — CSS `@page { size: A4; margin: 14mm 12mm 16mm }` + numeração `counter(page)/counter(pages)`
  em `@bottom-right`, `print-color-adjust: exact`, fonte Geist.

Aplicar em: `ReportsPage` (3 modelos), `relatorios/RelatorioImpressao`, `RelatorioSemanalPage`, `ObraRelatorioPage`,
`obras/RelatorioDiarioPage`, `obras/subempreitadas/AutoPdfPage`, `frota/FichaViaturaPrintPage`, `ToolLoanTermPrint`,
`livro-obra/GuiaPrintView`. Substituir só cabeçalho/rodapé/cores/fonte; conteúdo e dados intactos. Módulos de `features/`
importam de `@/app/components/print` (permitido).

## C. WhatsApp

- `src/app/lib/whatsapp.ts` (puro): `normalizarNumero(input)` → dígitos E.164 sem `+` (9 dígitos PT começados por 9/2 →
  prefixo 351; `00`/`+` removidos; inválido → `null`); `linkWhatsApp(numero, texto)`; `numerosRecentes()` /
  `guardarNumeroRecente()` em localStorage (máx. 5, try/catch).
- `src/app/lib/pdf/gerarPdf.ts`: `gerarPdfDeElemento(el, nomeFicheiro): Promise<File>` — `import()` dinâmico de
  `html2canvas-pro` e `jspdf`, A4 retrato, paginação por fatias da imagem.
- `src/app/components/EnviarWhatsAppDialog.tsx` — props `{ open, onOpenChange, texto, gerarPdf?: () => Promise<File> }`:
  número (+351, recentes), texto editável, "Abrir conversa" e "Enviar PDF" (se `navigator.canShare({files})` → partilha;
  senão descarrega e abre `wa.me`).
- Substituir os 2 usos atuais (`ReportsPage.partilharSemanalWhatsApp`, `RelatorioSemanalPage.partilharWhatsApp`) e
  adicionar o botão ao relatório CEO (`relatorios/RelatorioImpressao`).
- CSP (`public/_headers`): confirmar que `blob:`/`data:` em `img-src` permitem o html2canvas; ajustar se faltar.

## D. Contabilidade

### Migration `supabase/migrations/20261007100000_contabilidade_rh.sql`
1. `public.colaboradores_dados_laborais` (`colaborador_id` PK FK → colaboradores ON DELETE CASCADE, `niss`, `iban`,
   `data_admissao date`, `tipo_contrato text CHECK IN ('SEM_TERMO','TERMO_CERTO','TERMO_INCERTO','TEMPORARIO','ESTAGIO','OUTRO')`,
   `data_fim_contrato date`, `categoria_profissional`, `updated_at`). RLS: SELECT/INSERT/UPDATE só `auth_role() IN ('admin','gestor')`.
   GRANT SELECT, INSERT, UPDATE TO authenticated.
2. `faturas_fornecedor` + `nif_fornecedor text`, `base_tributavel numeric(12,2)`, `valor_iva numeric(12,2)` (nullable).
3. RPC `public.contabilidade_mapa_assiduidade(p_inicio date, p_fim date)` — `STABLE`, `SECURITY DEFINER`,
   `SET search_path = public`, recusa se `auth_role() NOT IN ('admin','gestor')`. Uma linha por colaborador ativo
   (ou com registos no período): `colaborador_id, numero_mecan, nome, nif, niss, cargo, dias_trabalhados, horas_normais,
   horas_extra_util_25, horas_extra_util_375, horas_extra_descanso_50, horas_extra_total, dias_subsidio_alimentacao,
   faltas_justificadas_dias, faltas_injustificadas_dias, faltas_descontaveis_dias, faltas_detalhe jsonb`.
   Regras por dia de `resumo_assiduidade_dia`:
   - dia de descanso/feriado = `horas_previstas` nulo ou 0 → todas as horas validadas a +50%.
   - dia útil → `min(validadas,1)` a +25%, resto a +37,5% (CT art. 268.º, n.º 1).
   - horas normais = `min(horas_efetivas, horas_previstas)` em dia útil.
   - dia trabalhado = `horas_efetivas > 0`; subsídio de alimentação = dia útil com `horas_efetivas ≥ 0,5 × previstas`
     ou dia de descanso com `horas_efetivas > 0`.
   - faltas: dias úteis de `faltas` sobrepostos ao período (seg–sex, excluindo `feriados_excecoes` FERIADO);
     `MANHA`/`TARDE` = 0,5; `HORAS` = 0 dias (contadas à parte no detalhe). Justificada = estado `JUSTIFICADA`;
     injustificada = `INJUSTIFICADA`; pendentes (`COMUNICADA`/`COM_COMPROVATIVO`) contam no detalhe como "por decidir".
   GRANT EXECUTE TO authenticated.

### Serviço `src/features/contabilidade/`
- `db.ts` com tipos das linhas/RPC sem tipos gerados (via `rpcSemTipos` para a RPC). Remover `as any`.
- `lib/periodo.ts` (puro): limites `Europe/Lisbon` → ISO UTC para filtros `timestamptz`; `mesAtual()`.
- `exportarAutos` filtra obra com `subempreiteiros!inner(obra_id)` + `.eq('subempreiteiros.obra_id', id)`.
- Novos: `exportarMapaAssiduidade`, `exportarDadosLaborais` (colaborador + dados laborais), `exportarFaturas`,
  `exportarFechoMes` (um `.xlsx` com folhas: Assiduidade, Faltas, Dados laborais, Faturas, Materiais, Combustível,
  Autos, P&L, Notas — notas com as regras legais usadas).
- `exportXlsx` ganha suporte multi-folha se não tiver.

### UI
- `ExportacaoContabilidadePage`: período por mês (atalho) ou datas, obra; cards novos (Assiduidade/salários, Dados
  laborais, Faturas) + botão "Fecho do mês". Sem `useEffect` manual para fetch.
- Ficha do colaborador: secção "Dados laborais" (admin/gestor) com NISS, IBAN, admissão, contrato, fim, categoria.
  Validação NISS (11 dígitos) e IBAN PT (PT50 + 21 dígitos, mod-97) em `lib` pura e testada.
- Faturas: campos NIF fornecedor (9 dígitos, validação NIF), base tributável, IVA no formulário de edição existente.

## E. Ícones
- `public/icon.svg`: fundo `#04090F` (rx 96 em 512), logo oficial vetorizado em branco (telhado em ângulo, 6 lâminas
  decrescentes, base), centrado com ~18% de margem.
- `scripts/gerar-icones.mjs` (usa `sharp` se disponível como dependência transitiva; senão `@resvg/resvg-js` como
  devDependency): gera `favicon.ico` (32), `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`,
  `maskable-icon-512x512.png` (logo dentro de 60% central, fundo cheio), `apple-touch-icon-180x180.png` (fundo cheio).
- `index.html`: `<link rel="icon" href="/icon.svg" type="image/svg+xml">` + png fallback; `theme-color` `#04090F`.
- `icone_oficial.png` (logo azul sobre branco) mantém-se para os impressos/UI.

## Erros
Mensagens pt-PT via `parseSupabaseError` / corpo `erro` da Edge Function. Exportações vazias → aviso "Sem dados no período".

## Testes
- Vitest: `contaInterna`, `whatsapp`, `periodo`, `validacoesLaborais` (NISS/IBAN/NIF), `utilizadoresService` (erro do
  corpo), `contabilidadeService` (mapeamento das linhas, filtro de obra dos autos), diálogo WhatsApp (render + link).
- BD (`supabase/tests/contabilidade.test.mjs`): RPC calcula escalões 25/37,5/50, subsídio, faltas meio dia; recusa
  papéis ≠ admin/gestor; RLS de `colaboradores_dados_laborais` (armazem não lê).
- Edge: `npm run check:edge && npm run test:edge` (teste de `regras.ts`).
- `npm run typecheck`, `npm test`, `npm run build`; `agent-browser` em localhost (só leitura).

## Passos manuais do utilizador
1. Aplicar `20261007100000_contabilidade_rh.sql` no SQL Editor.
2. `npx supabase functions deploy admin-utilizadores`.
3. Regenerar tipos e remover remendos de `db.ts`.
