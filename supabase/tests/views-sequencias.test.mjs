// @vitest-environment node
// View de alertas com direitos do chamador e USAGE na sequência dos códigos de produto.
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, leitura
async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)

beforeAll(async () => {
  db = await criarBanco()
  admin = await utilizador('admin', 'admin@t.pt')
  leitura = await utilizador('leitura', 'leitura@t.pt')
}, 120_000)

describe('views e sequências', () => {
  it('alertas_detalhados corre com os direitos de quem consulta', async () => {
    const { rows } = await db.query(`SELECT reloptions FROM pg_class WHERE oid = 'public.alertas_detalhados'::regclass`)
    expect(rows[0].reloptions ?? []).toContain('security_invoker=on')
  })
  it('authenticated continua a conseguir ler a view (todos os papéis)', async () => {
    for (const uid of [admin, leitura]) {
      await u(uid, tx => tx.query(`SELECT id, entidade_nome, entidade_detalhe FROM public.alertas_detalhados LIMIT 1`))
    }
  })
  it('authenticated lê as tabelas/colunas base e as policies de SELECT não filtram por papel', async () => {
    const { rows } = await db.query(`SELECT
      bool_and(has_table_privilege('authenticated', t, 'SELECT')) AS tabelas,
      has_column_privilege('authenticated', 'public.colaboradores', 'id', 'SELECT')
        AND has_column_privilege('authenticated', 'public.colaboradores', 'nome', 'SELECT') AS colunas
      FROM unnest(ARRAY['public.alertas','public.regras_alerta','public.comb_veiculos',
        'public.frota_veiculo_itens','public.frota_itens_catalogo']) AS t`)
    expect(rows[0]).toEqual({ tabelas: true, colunas: true })
    // Sem isto a view com security_invoker esconderia nomes a papéis sem leitura direta
    const { rows: pol } = await db.query(`SELECT tablename, qual FROM pg_policies
      WHERE schemaname = 'public' AND cmd = 'SELECT'
        AND tablename IN ('alertas','regras_alerta','comb_veiculos','colaboradores','frota_veiculo_itens','frota_itens_catalogo')`)
    expect(pol.length).toBeGreaterThan(0)
    for (const p of pol) expect(p.qual ?? '', p.tablename).not.toMatch(/auth_role|pode_escrever/)
  })
  it('authenticated tem USAGE em produto_codigo_seq', async () => {
    const { rows } = await db.query(`SELECT has_sequence_privilege('authenticated', 'public.produto_codigo_seq', 'USAGE') AS ok`)
    expect(rows[0].ok).toBe(true)
  })
  it('anon não tem USAGE em produto_codigo_seq', async () => {
    const { rows } = await db.query(`SELECT has_sequence_privilege('anon', 'public.produto_codigo_seq', 'USAGE') AS ok`)
    expect(rows[0].ok).toBe(false)
  })
})

describe('view de alertas para a Edge Function (service_role)', () => {
  it('service_role lê todas as tabelas/colunas base da view', async () => {
    const { rows } = await db.query(`SELECT
      bool_and(has_table_privilege('service_role', t, 'SELECT')) AS tabelas,
      has_column_privilege('service_role', 'public.colaboradores', 'id', 'SELECT')
        AND has_column_privilege('service_role', 'public.colaboradores', 'nome', 'SELECT') AS colunas,
      has_table_privilege('service_role', 'public.alertas_detalhados', 'SELECT') AS vista
      FROM unnest(ARRAY['public.alertas','public.regras_alerta','public.comb_veiculos',
        'public.frota_veiculo_itens','public.frota_itens_catalogo']) AS t`)
    expect(rows[0]).toEqual({ tabelas: true, colunas: true, vista: true })
  })
})
