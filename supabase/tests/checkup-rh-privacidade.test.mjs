// @vitest-environment node
// Checkup 2026-10-28, lote BD-1: faltas, assiduidade e contactos dos colaboradores só para
// admin, gestor e o próprio (A1-01, A1-02, A1-12 — 20261028120100).
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, motoristaUser, leitor, colabProprio, colabOutro
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const contar = (uid, sql, params = []) => comoU(uid, tx => tx.query(sql, params)).then(r => Number(r.rows[0].n))

beforeAll(async () => {
  db = await criarBanco()
  admin = await novoUtilizador('admin', 'a@t.pt')
  gestor = await novoUtilizador('gestor', 'g@t.pt')
  motoristaUser = await novoUtilizador('motorista', 'm@t.pt')
  leitor = await novoUtilizador('leitura', 'l@t.pt')
  colabProprio = (await db.query(
    `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id, telemovel, email, notas)
     VALUES ('Rui','RH1','Motorista',$1,'911111111','rui@x.pt','nota rui') RETURNING id`, [motoristaUser])).rows[0].id
  colabOutro = (await db.query(
    `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, telemovel, email, notas)
     VALUES ('Ana','RH2','Servente','922222222','ana@x.pt','baixa médica') RETURNING id`)).rows[0].id
  for (const c of [colabProprio, colabOutro]) {
    await db.query(
      `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo, estado, justificacao_texto, dado_saude)
       VALUES ($1, '2026-10-01', '2026-10-01', 'DIA', 'JUSTIFICADA', 'Internamento', true)`, [c])
    await db.query(
      `INSERT INTO public.resumo_assiduidade_dia (colaborador_id, data, horas_previstas, horas_efetivas, desvio)
       VALUES ($1, '2026-10-01', 8, 7, -1)`, [c])
  }
}, 120_000)

describe('faltas e resumo de assiduidade', () => {
  for (const tabela of ['faltas', 'resumo_assiduidade_dia']) {
    it(`motorista não lê ${tabela} de outro colaborador, mas lê as suas`, async () => {
      expect(await contar(motoristaUser, `SELECT count(*) AS n FROM public.${tabela} WHERE colaborador_id = $1`, [colabOutro])).toBe(0)
      expect(await contar(motoristaUser, `SELECT count(*) AS n FROM public.${tabela} WHERE colaborador_id = $1`, [colabProprio])).toBe(1)
    })
    it(`leitura sem ficha não lê ${tabela}`, async () => {
      expect(await contar(leitor, `SELECT count(*) AS n FROM public.${tabela}`)).toBe(0)
    })
    it(`admin e gestor leem ${tabela} de todos`, async () => {
      expect(await contar(gestor, `SELECT count(*) AS n FROM public.${tabela}`)).toBe(2)
      expect(await contar(admin, `SELECT count(*) AS n FROM public.${tabela}`)).toBe(2)
    })
  }
  it('gestor continua a registar faltas; motorista não', async () => {
    await comoU(gestor, tx => tx.query(
      `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo) VALUES ($1, '2026-10-02', '2026-10-02', 'DIA')`, [colabOutro]))
    await expect(comoU(motoristaUser, tx => tx.query(
      `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo) VALUES ($1, '2026-10-03', '2026-10-03', 'DIA')`, [colabProprio])))
      .rejects.toThrow(/row-level security/)
  })
})

describe('uma só policy de leitura por tabela de RH (A1-12)', () => {
  for (const tabela of ['faltas', 'resumo_assiduidade_dia', 'horario_colaborador', 'tipos_falta']) {
    it(tabela, async () => {
      const { rows } = await db.query(
        `SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 ORDER BY policyname`, [tabela])
      expect(rows.filter(r => r.cmd === 'SELECT')).toHaveLength(1)
      expect(rows.filter(r => r.cmd === 'ALL')).toHaveLength(1)
    })
  }
  it('horários e tipos de falta continuam legíveis por todos', async () => {
    await expect(comoU(motoristaUser, tx => tx.query(`SELECT * FROM public.tipos_falta`))).resolves.toBeTruthy()
    await expect(comoU(motoristaUser, tx => tx.query(`SELECT * FROM public.horario_colaborador`))).resolves.toBeTruthy()
  })
})

describe('contactos dos colaboradores (A1-02)', () => {
  it('motorista não lê telemovel, email nem notas diretamente', async () => {
    for (const col of ['telemovel', 'email', 'notas']) {
      await expect(comoU(motoristaUser, tx => tx.query(`SELECT ${col} FROM public.colaboradores`))).rejects.toThrow(/permission/)
    }
  })
  it('as colunas não sensíveis continuam legíveis', async () => {
    const { rows } = await comoU(motoristaUser, tx => tx.query(
      `SELECT id, nome, numero_mecan, cargo, obra_id, user_id, ativo, foto_path, setor, created_at FROM public.colaboradores`))
    expect(rows.length).toBe(2)
  })
  it('motorista obtém pela RPC só os seus contactos', async () => {
    const { rows } = await comoU(motoristaUser, tx => tx.query(`SELECT * FROM public.colaboradores_contactos()`))
    expect(rows).toEqual([{ id: colabProprio, telemovel: '911111111', email: 'rui@x.pt', notas: 'nota rui' }])
  })
  it('leitura sem ficha não obtém contactos', async () => {
    const { rows } = await comoU(leitor, tx => tx.query(`SELECT * FROM public.colaboradores_contactos()`))
    expect(rows).toEqual([])
  })
  it('admin e gestor obtêm os contactos de todos', async () => {
    for (const u of [admin, gestor]) {
      const { rows } = await comoU(u, tx => tx.query(`SELECT * FROM public.colaboradores_contactos() ORDER BY telemovel`))
      expect(rows.map(r => r.notas)).toEqual(['nota rui', 'baixa médica'])
    }
  })
  it('gestor continua a gravar contactos', async () => {
    await comoU(gestor, tx => tx.query(`UPDATE public.colaboradores SET telemovel = '933333333' WHERE id = $1`, [colabOutro]))
    const { rows } = await db.query(`SELECT telemovel FROM public.colaboradores WHERE id = $1`, [colabOutro])
    expect(rows[0].telemovel).toBe('933333333')
  })
  it('anon não executa a RPC', async () => {
    await expect(como(db, { papel: 'anon' }, tx => tx.query(`SELECT * FROM public.colaboradores_contactos()`))).rejects.toThrow()
  })
})
