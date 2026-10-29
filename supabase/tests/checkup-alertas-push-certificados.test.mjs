// @vitest-environment node
// Checkup 2026-10-28, lote BD-7: alertas, push e certificados (A4-08, A4-10, A2-03, A4-13 — 20261028120700).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120700_checkup_alertas_push_certificados.sql', import.meta.url))

let db, admin, gestor, leitura, userA, userB

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [role, email, rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const servico = fn => como(db, { papel: 'service_role' }, fn)
const novoColab = async nome => (await db.query(
  `INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ($1, $2, 'Servente') RETURNING id`,
  [nome, `M-${randomUUID().slice(0, 6)}`])).rows[0].id
const subscrever = (uid, endpoint) => u(uid, tx => tx.query(
  `SELECT public.registar_subscricao_push($1, 'chave-p256dh', 'chave-auth', 'Teste/1.0')`, [endpoint]))

beforeAll(async () => {
  db = await criarBanco()
  admin   = await utilizador('admin', 'admin@t.pt')
  gestor  = await utilizador('gestor', 'gestor@t.pt')
  leitura = await utilizador('leitura', 'leitura@t.pt')
  userA   = await utilizador('motorista', 'a@t.pt')
  userB   = await utilizador('motorista', 'b@t.pt')
}, 120_000)

describe('A4-08 — alertas de EPI e formação com o nome do colaborador', () => {
  let alertaEpi, alertaForm
  beforeAll(async () => {
    const colab = await novoColab('Joaquim Alves')
    const tipoEpi = (await db.query(`INSERT INTO public.tipos_epi (designacao, validade_dias) VALUES ('Capacete', 5) RETURNING id`)).rows[0].id
    await db.query(`INSERT INTO public.atribuicoes_epi (colaborador_id, tipo_epi_id, data_entrega) VALUES ($1, $2, CURRENT_DATE)`, [colab, tipoEpi])
    const tipoForm = (await db.query(`INSERT INTO public.tipos_formacao (designacao, validade_anos) VALUES ('Trabalhos em altura', 1) RETURNING id`)).rows[0].id
    await db.query(`INSERT INTO public.formacoes_colaborador (colaborador_id, tipo_id, data_conclusao) VALUES ($1, $2, CURRENT_DATE - 360)`, [colab, tipoForm])
    await db.query(`SELECT public.avaliar_regras_alerta()`)
    const { rows } = await db.query(`SELECT a.id, r.tipo FROM public.alertas a JOIN public.regras_alerta r ON r.id = a.regra_id
      WHERE r.tipo IN ('EPI_VALIDADE', 'FORMACAO_VALIDADE')`)
    alertaEpi  = rows.find(r => r.tipo === 'EPI_VALIDADE').id
    alertaForm = rows.find(r => r.tipo === 'FORMACAO_VALIDADE').id
  })

  it('gestor vê o nome do colaborador e o tipo de EPI/formação', async () => {
    const { rows } = await u(gestor, tx => tx.query(
      `SELECT id, entidade_nome, entidade_detalhe FROM public.alertas_detalhados WHERE id = ANY($1) ORDER BY regra_tipo`,
      [[alertaEpi, alertaForm]]))
    expect(rows).toEqual([
      { id: alertaEpi,  entidade_nome: 'Joaquim Alves', entidade_detalhe: 'Capacete' },
      { id: alertaForm, entidade_nome: 'Joaquim Alves', entidade_detalhe: 'Trabalhos em altura' },
    ])
  })

  it('o papel de serviço (Edge enviar-resumo-alertas) lê a view com os nomes', async () => {
    const { rows } = await servico(tx => tx.query(
      `SELECT entidade_nome FROM public.alertas_detalhados WHERE id = $1`, [alertaEpi]))
    expect(rows).toEqual([{ entidade_nome: 'Joaquim Alves' }])
  })

  it('mesmas colunas, pela mesma ordem, e security_invoker mantido', async () => {
    const { rows } = await db.query(`SELECT string_agg(column_name, ',' ORDER BY ordinal_position) AS c
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'alertas_detalhados'`)
    expect(rows[0].c).toBe('id,regra_id,entidade_id,estado,severidade,valor_atual,valor_limiar,criado_em,atualizado_em,'
      + 'reconhecido_por,reconhecido_em,resolvido_por,resolvido_em,regra_tipo,entidade_alvo,campo_ref,limiar_atencao,'
      + 'limiar_urgente,entidade_nome,entidade_detalhe')
    const { rows: [o] } = await db.query(`SELECT reloptions FROM pg_class WHERE oid = 'public.alertas_detalhados'::regclass`)
    expect(o.reloptions).toContain('security_invoker=on')
  })
})

describe('A2-03 — endpoint de push só dos serviços conhecidos', () => {
  it.each([
    'http://169.254.169.254/x',
    'https://169.254.169.254/x',
    'https://evil.com/fcm.googleapis.com/',
    'https://fcm.googleapis.com.evil.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://user@fcm.googleapis.com/x',
    'https://push.apple.com/x',
    'https://evil.com?.push.apple.com/',
    'https://evil.com#.push.apple.com/',
  ])('INSERT direto com %s → recusado pelo CHECK', async (endpoint) => {
    await expect(u(userA, tx => tx.query(
      `INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'k', 'a')`, [userA, endpoint])))
      .rejects.toThrow(/push_subscriptions_endpoint_https/)
  })

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://wns2-db5p.notify.windows.com/w/?token=x',
    'HTTPS://FCM.GOOGLEAPIS.COM/fcm/send/abc',
  ])('INSERT direto com %s → aceite', async (endpoint) => {
    const { rows } = await u(userA, tx => tx.query(
      `INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'k', 'a') RETURNING id`,
      [userA, endpoint + randomUUID()]))
    expect(rows).toHaveLength(1)
  })

  it('a constraint é NOT VALID (linhas antigas não bloqueiam a migration)', async () => {
    const { rows } = await db.query(`SELECT convalidated FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_https'`)
    expect(rows).toEqual([{ convalidated: false }])
  })
})

describe('A4-10 — registar_subscricao_push reatribui o endpoint ao utilizador atual', () => {
  it('A regista, B regista o mesmo endpoint → a linha passa a ser de B', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`
    await subscrever(userA, endpoint)
    await subscrever(userB, endpoint)
    const { rows } = await db.query(`SELECT user_id, p256dh, auth, user_agent FROM public.push_subscriptions WHERE endpoint = $1`, [endpoint])
    expect(rows).toEqual([{ user_id: userB, p256dh: 'chave-p256dh', auth: 'chave-auth', user_agent: 'Teste/1.0' }])
  })

  it('o mesmo utilizador volta a registar → atualiza as chaves sem duplicar', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`
    await subscrever(userA, endpoint)
    await u(userA, tx => tx.query(`SELECT public.registar_subscricao_push($1, 'nova', 'nova-auth', NULL)`, [endpoint]))
    const { rows } = await db.query(`SELECT user_id, p256dh FROM public.push_subscriptions WHERE endpoint = $1`, [endpoint])
    expect(rows).toEqual([{ user_id: userA, p256dh: 'nova' }])
  })

  it('endpoint fora da lista → recusado', async () => {
    await expect(subscrever(userA, 'http://169.254.169.254/latest/meta-data')).rejects.toThrow(/endpoint_https/)
  })

  it('sem sessão → recusado; anon não pode executar', async () => {
    await expect(u(null, tx => tx.query(
      `SELECT public.registar_subscricao_push('https://fcm.googleapis.com/x', 'k', 'a', NULL)`))).rejects.toThrow(/sessão/i)
    const { rows: [p] } = await db.query(`SELECT
      has_function_privilege('anon', 'public.registar_subscricao_push(text, text, text, text)', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'public.registar_subscricao_push(text, text, text, text)', 'EXECUTE') AS auth`)
    expect(p).toEqual({ anon: false, auth: true })
  })
})

describe('A4-13 — bucket certificados privado e só admin/gestor', () => {
  const caminho = () => `${randomUUID()}/${Date.now()}.pdf`
  const carregar = (uid, nome) => u(uid, tx => tx.query(
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('certificados', $1)`, [nome]))

  it('o bucket existe, é privado e tem limites', async () => {
    const { rows } = await db.query(`SELECT public, file_size_limit IS NOT NULL AS limite, allowed_mime_types
      FROM storage.buckets WHERE id = 'certificados'`)
    expect(rows).toEqual([{ public: false, limite: true, allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png'] }])
  })

  it.each(['gestor', 'admin'])('%s carrega <colaborador>/<n>.pdf e lê-o', async (p) => {
    const uid = p === 'gestor' ? gestor : admin
    const nome = caminho()
    await carregar(uid, nome)
    const { rows } = await u(uid, tx => tx.query(`SELECT name FROM storage.objects WHERE bucket_id = 'certificados' AND name = $1`, [nome]))
    expect(rows).toHaveLength(1)
  })

  it('gestor: extensão ou caminho fora do formato → recusado', async () => {
    await expect(carregar(gestor, `${randomUUID()}/1.html`)).rejects.toThrow(/row-level security/)
    await expect(carregar(gestor, `../x/1.pdf`)).rejects.toThrow(/row-level security/)
  })

  it('leitura não carrega nem lê certificados', async () => {
    await expect(carregar(leitura, caminho())).rejects.toThrow(/row-level security/)
    const { rows } = await u(leitura, tx => tx.query(`SELECT name FROM storage.objects WHERE bucket_id = 'certificados'`))
    expect(rows).toEqual([])
  })
})

describe('migration idempotente', () => {
  it('aplicar duas vezes não falha', async () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'certificados_%'`)
    expect(rows[0].n).toBe(2)
  })
})
