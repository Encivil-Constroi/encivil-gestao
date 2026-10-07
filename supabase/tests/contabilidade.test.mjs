// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, armazem, colab
async function novo(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const mapa = uid => comoU(uid, tx => tx.query(`SELECT * FROM public.contabilidade_mapa_assiduidade('2026-09-01','2026-09-30')`))
const tipo = async nome => (await db.query(`SELECT id FROM public.tipos_falta WHERE designacao = $1 LIMIT 1`, [nome])).rows[0]?.id

beforeAll(async () => {
  db = await criarBanco()
  admin = await novo('admin', 'admin@teste.pt')
  gestor = await novo('gestor', 'gestor@teste.pt')
  armazem = await novo('armazem', 'armazem@teste.pt')
  colab = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, nif, cargo) VALUES ('Carlos', '900', '123456789', 'Pedreiro') RETURNING id`)).rows[0].id

  const dias = [
    ['2026-09-01', 8, 10.5, 2.5, 2.5],
    ['2026-09-02', 8, 3, null, null],
    ['2026-09-06', 0, 4, 4, 4],
    ['2026-09-03', 8, 9, 1, null],
  ]
  for (const [d, prev, efe, prop, val] of dias) {
    await db.query(
      `INSERT INTO public.resumo_assiduidade_dia (colaborador_id, data, horas_previstas, horas_efetivas, desvio, horas_supl_propostas, horas_supl_validadas)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [colab, d, prev, efe, efe - prev, prop, val])
  }
  const consulta = await tipo('Consulta médica')
  const injust = await tipo('Falta injustificada')
  expect(consulta && injust).toBeTruthy()
  const falta = (ini, fim, per, t, estado) => db.query(
    `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo, tipo_falta_id, estado) VALUES ($1,$2,$3,$4,$5,$6)`,
    [colab, ini, fim, per, t, estado])
  await falta('2026-09-10', '2026-09-10', 'MANHA', consulta, 'JUSTIFICADA')
  await falta('2026-09-11', '2026-09-14', 'DIA', injust, 'INJUSTIFICADA')
  await falta('2026-09-15', '2026-09-15', 'DIA', injust, 'COMUNICADA')
  await falta('2026-08-31', '2026-09-01', 'DIA', injust, 'INJUSTIFICADA')
}, 120_000)

describe('contabilidade_mapa_assiduidade', () => {
  it('calcula horas, subsídio e faltas do período', async () => {
    const l = (await mapa(gestor)).rows.find(r => r.numero_mecan === '900')
    expect(l.nif).toBe('123456789')
    expect(l.dias_trabalhados).toBe(4)
    expect(Number(l.horas_normais)).toBe(19)
    expect(Number(l.horas_extra_util_25)).toBe(1)
    expect(Number(l.horas_extra_util_375)).toBe(1.5)
    expect(Number(l.horas_extra_descanso_50)).toBe(4)
    expect(Number(l.horas_extra_total)).toBe(6.5)
    expect(l.dias_subsidio_alimentacao).toBe(3)
    expect(Number(l.faltas_justificadas_dias)).toBe(0.5)
    expect(Number(l.faltas_injustificadas_dias)).toBe(3)
    expect(Number(l.faltas_descontaveis_dias)).toBe(3)
    expect(l.faltas_detalhe.some(f => f.estado === 'COMUNICADA')).toBe(true)
  })
  it('faltas sobrepostas no mesmo dia não contam a dobrar; ponte não conta', async () => {
    const c2 = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Duplo', '901', 'Servente') RETURNING id`)).rows[0].id
    const injust = await tipo('Falta injustificada')
    const falta = (ini, fim, per) => db.query(
      `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo, tipo_falta_id, estado) VALUES ($1,$2,$3,$4,$5,'INJUSTIFICADA')`,
      [c2, ini, fim, per, injust])
    await falta('2026-09-21', '2026-09-21', 'DIA')   // duas DIA no mesmo dia
    await falta('2026-09-21', '2026-09-21', 'DIA')
    await falta('2026-09-22', '2026-09-22', 'MANHA') // MANHA + DIA no mesmo dia
    await falta('2026-09-22', '2026-09-22', 'DIA')
    await db.query(`INSERT INTO public.feriados_excecoes (data, tipo, designacao, ambito) VALUES ('2026-09-24','PONTE','Ponte','empresa')`)
    await falta('2026-09-23', '2026-09-25', 'DIA')   // 23 e 25 contam; 24 é ponte
    const l = (await mapa(gestor)).rows.find(r => r.numero_mecan === '901')
    expect(Number(l.faltas_injustificadas_dias)).toBe(4)
    expect(Number(l.faltas_descontaveis_dias)).toBe(4)
  })
  it('manhã injustificada + tarde justificada no mesmo dia = 0,5 + 0,5', async () => {
    const c3 = (await db.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Meio', '902', 'Servente') RETURNING id`)).rows[0].id
    const consulta = await tipo('Consulta médica')
    const injust = await tipo('Falta injustificada')
    const falta = (per, t, estado) => db.query(
      `INSERT INTO public.faltas (colaborador_id, data_inicio, data_fim, periodo, tipo_falta_id, estado) VALUES ($1,'2026-09-16','2026-09-16',$2,$3,$4)`,
      [c3, per, t, estado])
    await falta('MANHA', injust, 'INJUSTIFICADA')
    await falta('TARDE', consulta, 'JUSTIFICADA')
    const l = (await mapa(gestor)).rows.find(r => r.numero_mecan === '902')
    expect(Number(l.faltas_injustificadas_dias)).toBe(0.5)
    expect(Number(l.faltas_justificadas_dias)).toBe(0.5)
    expect(Number(l.faltas_descontaveis_dias)).toBe(0.5)
  })
  it('admin também pode; armazém e período inválido são recusados', async () => {
    expect((await mapa(admin)).rows.length).toBeGreaterThan(0)
    await expect(mapa(armazem)).rejects.toThrow(/permissão/)
    await expect(comoU(gestor, tx => tx.query(`SELECT * FROM public.contabilidade_mapa_assiduidade('2026-09-30','2026-09-01')`))).rejects.toThrow(/Período inválido/)
  })
})

describe('colaboradores_dados_laborais', () => {
  it('armazém não lê nem escreve', async () => {
    await db.query(`INSERT INTO public.colaboradores_dados_laborais (colaborador_id, niss) VALUES ($1, '12345678901')`, [colab])
    const r = await comoU(armazem, tx => tx.query(`SELECT * FROM public.colaboradores_dados_laborais`))
    expect(r.rows).toHaveLength(0)
    await expect(comoU(armazem, tx => tx.query(`UPDATE public.colaboradores_dados_laborais SET niss = '00000000000'`).then(() => tx.query(`SELECT niss FROM public.colaboradores_dados_laborais`)))).resolves.toBeTruthy()
    expect((await db.query(`SELECT niss FROM public.colaboradores_dados_laborais`)).rows[0].niss).toBe('12345678901')
    await db.query(`DELETE FROM public.colaboradores_dados_laborais`)
    await expect(comoU(armazem, tx => tx.query(`INSERT INTO public.colaboradores_dados_laborais (colaborador_id, niss) VALUES ($1,'12345678901')`, [colab]))).rejects.toThrow()
  })
  it('gestor insere e lê; contrato inválido falha o CHECK', async () => {
    await comoU(gestor, tx => tx.query(`INSERT INTO public.colaboradores_dados_laborais (colaborador_id, niss, iban, tipo_contrato) VALUES ($1,'12345678901','PT50000201231234567890154','SEM_TERMO')`, [colab]))
    const r = await comoU(gestor, tx => tx.query(`SELECT niss FROM public.colaboradores_dados_laborais`))
    expect(r.rows[0].niss).toBe('12345678901')
    await expect(comoU(gestor, tx => tx.query(`UPDATE public.colaboradores_dados_laborais SET tipo_contrato = 'XPTO'`))).rejects.toThrow(/check/i)
    expect((await mapa(gestor)).rows.find(x => x.numero_mecan === '900').niss).toBe('12345678901')
  })
})

describe('contabilidade_dados_laborais', () => {
  const exportar = uid => comoU(uid, tx => tx.query(`SELECT * FROM public.contabilidade_dados_laborais()`))

  it('gestor recebe o NIF (coluna restrita) e os dados laborais', async () => {
    const l = (await exportar(gestor)).rows.find(r => r.numero_mecan === '900')
    expect(l.nif).toBe('123456789')
    expect(l.niss).toBe('12345678901')
    expect(l.tipo_contrato).toBe('SEM_TERMO')
  })
  it('armazem é recusado', async () => {
    await expect(exportar(armazem)).rejects.toThrow(/permissão/i)
  })
  it('authenticated não lê o NIF diretamente da tabela', async () => {
    await expect(comoU(gestor, tx => tx.query(`SELECT nif FROM public.colaboradores`))).rejects.toThrow(/permission denied/i)
  })
})
