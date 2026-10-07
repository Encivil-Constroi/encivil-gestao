// @vitest-environment node
// NIF dos colaboradores (RGPD): só admin, gestor e o próprio (20261008030000).
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, leitor, motoristaUser, colabProprio, colabOutro
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const nif = (uid, id) => comoU(uid, tx => tx.query(`SELECT public.colaborador_nif($1) AS n`, [id])).then(r => r.rows[0].n)

beforeAll(async () => {
  db = await criarBanco()
  admin = await novoUtilizador('admin', 'a@t.pt')
  gestor = await novoUtilizador('gestor', 'g@t.pt')
  leitor = await novoUtilizador('leitura', 'l@t.pt')
  motoristaUser = await novoUtilizador('motorista', 'm@t.pt')
  colabProprio = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id, nif) VALUES ('Rui','M1','Motorista',$1,'123456789') RETURNING id`, [motoristaUser])).rows[0].id
  colabOutro = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, nif) VALUES ('Ana','M2','Servente','987654321') RETURNING id`)).rows[0].id
}, 120_000)

describe('NIF protegido', () => {
  it('ninguém lê a coluna nif diretamente', async () => {
    await expect(comoU(admin, tx => tx.query(`SELECT nif FROM public.colaboradores`))).rejects.toThrow(/permission/)
    await expect(comoU(leitor, tx => tx.query(`SELECT * FROM public.colaboradores`))).rejects.toThrow(/permission/)
  })
  it('as outras colunas continuam legíveis por todos os autenticados', async () => {
    const { rows } = await comoU(leitor, tx => tx.query(`SELECT id, nome, cargo FROM public.colaboradores`))
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })
  it('todas as colunas exceto nif são legíveis (colunas futuras precisam de GRANT)', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='colaboradores' AND column_name <> 'nif'
         AND NOT has_column_privilege('authenticated', 'public.colaboradores', column_name, 'SELECT')`)
    expect(rows).toEqual([])
  })
  it('admin e gestor obtêm o NIF pela RPC', async () => {
    expect(await nif(admin, colabOutro)).toBe('987654321')
    expect(await nif(gestor, colabOutro)).toBe('987654321')
  })
  it('o próprio obtém o seu NIF', async () => {
    expect(await nif(motoristaUser, colabProprio)).toBe('123456789')
  })
  it('outros papéis não obtêm NIF alheio', async () => {
    expect(await nif(leitor, colabOutro)).toBeNull()
    expect(await nif(motoristaUser, colabOutro)).toBeNull()
  })
  it('admin continua a poder gravar o NIF', async () => {
    await comoU(admin, tx => tx.query(`UPDATE public.colaboradores SET nif = '111222333' WHERE id = $1`, [colabOutro]))
    expect(await nif(admin, colabOutro)).toBe('111222333')
  })
  it('admin cria colaborador com NIF e recebe a linha sem nif (insert + select encadeado)', async () => {
    const { rows } = await comoU(admin, tx => tx.query(
      `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, nif) VALUES ('Zé','M3','Servente','222333444') RETURNING id, nome`))
    expect(await nif(gestor, rows[0].id)).toBe('222333444')
  })
  it('anon não executa a RPC', async () => {
    await expect(como(db, { papel: 'anon' }, tx => tx.query(`SELECT public.colaborador_nif($1)`, [colabOutro]))).rejects.toThrow()
  })
})
