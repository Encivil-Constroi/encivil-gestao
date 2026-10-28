// @vitest-environment node
// Checkup 2026-10-28, lote BD-2: picagens e assiduidade (A1-04/A4-01, A4-06, A4-05, A4-04 — 20261028120200).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120200_checkup_picagens_assiduidade.sql', import.meta.url))

let db, gestor, motorista, colabProprio, colabOutro, obra, horario
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const novoColab = async (nome, num, userId = null) => (await db.query(
  `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ($1, $2, 'Servente', $3) RETURNING id`,
  [nome, num, userId])).rows[0].id
// Hora de parede de Lisboa → timestamptz
const lx = (data, hora) => `('${data} ${hora}'::timestamp AT TIME ZONE 'Europe/Lisbon')`
const picarDireto = (colab, tipo, data, hora, extra = '') => db.query(
  `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, resultado${extra ? ', hora_final_validada' : ''})
   VALUES ($1, $2, $3, ${lx(data, hora)}, 'AUTORIZADA'${extra ? `, ${extra}` : ''})`, [colab, obra, tipo])
const atribuir = (colab, de, ate = null) => db.query(
  `INSERT INTO public.horario_colaborador (colaborador_id, horario_id, valido_de, valido_ate) VALUES ($1, $2, $3, $4)`,
  [colab, horario, de, ate])
const resumo = async (colab, data) => (await db.query(
  `SELECT obra_id, horas_previstas::float AS prev, horas_efetivas::float AS efe, desvio::float AS desvio,
          horas_supl_propostas::float AS propostas, horas_supl_validadas::float AS validadas
     FROM public.resumo_assiduidade_dia WHERE colaborador_id = $1 AND data = $2`, [colab, data])).rows[0]

beforeAll(async () => {
  db = await criarBanco()
  gestor = await novoUtilizador('gestor', 'g@t.pt')
  motorista = await novoUtilizador('motorista', 'm@t.pt')
  colabProprio = await novoColab('Rui', 'P1', motorista)
  colabOutro = await novoColab('Ana', 'P2')
  obra = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Obra Picagens') RETURNING id`)).rows[0].id
  horario = (await db.query(
    `INSERT INTO public.horarios (designacao, periodo_diario_h, periodo_semanal_h, intervalo_min, intervalo_inicio, intervalo_fim,
                                  dias_semana, hora_entrada, hora_saida)
     VALUES ('Normal', 8, 40, 60, '12:00', '13:00', '{1,2,3,4,5}', '08:00', '17:00') RETURNING id`)).rows[0].id
  // PostGIS não existe no PGlite: substitutos mínimos para exercitar a RPC de geofence
  await db.exec(`
    CREATE FUNCTION public.st_makepoint(double precision, double precision) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'PONTO' $$;
    CREATE FUNCTION public.geography(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
    CREATE FUNCTION public.st_distance(text, text) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$ SELECT 10::double precision $$;
  `)
  await db.query(`UPDATE public.obras SET geofence_tipo = 'RAIO', geofence_centro = 'CENTRO', geofence_raio_m = 100 WHERE id = $1`, [obra])
}, 120_000)

describe('A1-04/A4-01 — INSERT direto em picagens', () => {
  it('colaborador não grava a própria picagem já AUTORIZADA nem forja validação/carimbo', async () => {
    const { rows } = await comoU(motorista, tx => tx.query(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, timestamp_servidor, desvio_relogio_s,
                                    resultado, origem, hora_original_proposta, hora_final_validada, justificacao, validada_por, validada_em,
                                    distancia_geofence_m)
       VALUES ($1, $2, 'ENTRADA', now() - interval '3 hours', '2020-01-01', 0,
               'AUTORIZADA', 'OFFLINE', now() - interval '5 hours', now() - interval '5 hours', 'ok', $3, now(), 1)
       RETURNING resultado, origem, hora_original_proposta, hora_final_validada, justificacao, validada_por, validada_em,
                 distancia_geofence_m, desvio_relogio_s, (now() - timestamp_servidor) < interval '1 minute' AS servidor_agora`,
      [colabProprio, obra, gestor]))
    const r = rows[0]
    expect(r.resultado).toBe('PENDENTE_VALIDACAO')
    expect(r.origem).toBe('OFFLINE')
    for (const c of ['hora_original_proposta', 'hora_final_validada', 'justificacao', 'validada_por', 'validada_em', 'distancia_geofence_m']) {
      expect(r[c], c).toBeNull()
    }
    expect(r.servidor_agora).toBe(true)
    expect(r.desvio_relogio_s).toBeGreaterThanOrEqual(10790)
    expect(r.desvio_relogio_s).toBeLessThanOrEqual(10810)
  })

  it('picagem offline que chega dias depois (ou com relógio absurdo) é aceite e fica pendente', async () => {
    const { rows } = await comoU(motorista, tx => tx.query(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, origem)
       VALUES ($1, $2, 'SAIDA', now() - interval '3 days', 'OFFLINE'), ($1, $2, 'ENTRADA', '1900-01-01', 'OFFLINE')
       RETURNING resultado, desvio_relogio_s`, [colabProprio, obra]))
    expect(rows.map(r => r.resultado)).toEqual(['PENDENTE_VALIDACAO', 'PENDENTE_VALIDACAO'])
    expect(rows[0].desvio_relogio_s).toBeGreaterThan(3 * 86400 - 60)
    expect(rows[1].desvio_relogio_s).toBe(2147483647)
  })

  it('gestor continua a registar picagens autorizadas em nome de outro', async () => {
    const { rows } = await comoU(gestor, tx => tx.query(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, resultado, validada_por, validada_em)
       VALUES ($1, $2, 'ENTRADA', now() - interval '1 hour', 'AUTORIZADA', $3, now()) RETURNING resultado, validada_em`,
      [colabOutro, obra, gestor]))
    expect(rows[0].resultado).toBe('AUTORIZADA')
    expect(rows[0].validada_em).not.toBeNull()
  })
})

describe('A4-06 — geofence só autoriza com o relógio certo', () => {
  it('_picagem_dentro_do_desvio aceita até 5 min', async () => {
    const { rows } = await db.query(`SELECT public._picagem_dentro_do_desvio(now() - interval '2 hours') AS a,
      public._picagem_dentro_do_desvio(now()) AS b, public._picagem_dentro_do_desvio(now() - interval '4 minutes') AS c,
      public._picagem_dentro_do_desvio(now() + interval '10 minutes') AS d`)
    expect(rows[0]).toEqual({ a: false, b: true, c: true, d: false })
  })

  const geofence = ts => comoU(motorista, tx => tx.query(
    `SELECT public.registar_picagem_geofence($1, $2, 'ENTRADA', 38.7, -9.1, 10, ${ts}) AS r`, [colabProprio, obra]))
    .then(r => r.rows[0].r)
  const linha = id => db.query(`SELECT resultado, desvio_relogio_s FROM public.picagens WHERE id = $1`, [id]).then(r => r.rows[0])

  it('dentro do geofence e com hora atual → AUTORIZADA, com desvio gravado', async () => {
    const r = await geofence('now()')
    expect(r.resultado).toBe('AUTORIZADA')
    expect((await linha(r.id)).desvio_relogio_s).toBe(0)
  })

  it('dentro do geofence com hora 2 h atrás (ex.: fila offline) → aceite como PENDENTE_VALIDACAO', async () => {
    const r = await geofence(`now() - interval '2 hours'`)
    expect(r.resultado).toBe('PENDENTE_VALIDACAO')
    const l = await linha(r.id)
    expect(l.resultado).toBe('PENDENTE_VALIDACAO')
    expect(l.desvio_relogio_s).toBe(7200)
  })
})

describe('A4-05 — atribuições de horário sobrepostas', () => {
  let colab
  beforeAll(async () => { colab = await novoColab('Hugo', 'P5') })

  it('a nova atribuição fecha a anterior aberta', async () => {
    await atribuir(colab, '2026-01-01')
    await comoU(gestor, tx => tx.query(
      `INSERT INTO public.horario_colaborador (colaborador_id, horario_id, valido_de) VALUES ($1, $2, '2026-11-01')`, [colab, horario]))
    const { rows } = await db.query(
      `SELECT valido_de::text, valido_ate::text FROM public.horario_colaborador WHERE colaborador_id = $1 ORDER BY valido_de`, [colab])
    expect(rows).toEqual([{ valido_de: '2026-01-01', valido_ate: '2026-10-31' }, { valido_de: '2026-11-01', valido_ate: null }])
  })

  it('não deixa inserir antes de uma atribuição posterior que se sobreporia', async () => {
    await expect(atribuir(colab, '2026-06-01')).rejects.toThrow(/Já existe um horário atribuído a partir de/)
  })

  it('editar a mesma atribuição (upsert pela chave) continua a funcionar', async () => {
    await comoU(gestor, tx => tx.query(
      `INSERT INTO public.horario_colaborador (colaborador_id, horario_id, valido_de) VALUES ($1, $2, '2026-11-01')
       ON CONFLICT (colaborador_id, valido_de) DO UPDATE SET valido_ate = '2026-12-31'`, [colab, horario]))
    const { rows } = await db.query(
      `SELECT valido_ate::text FROM public.horario_colaborador WHERE colaborador_id = $1 AND valido_de = '2026-11-01'`, [colab])
    expect(rows[0].valido_ate).toBe('2026-12-31')
  })

  it('com sobreposição já existente, calcular_resumo_dia não falha e grava 1 linha por colaborador', async () => {
    const c = await novoColab('Sobreposto', 'P6')
    await db.exec(`SET session_replication_role = replica`)
    try {
      await atribuir(c, '2026-09-01')
      await atribuir(c, '2026-10-01')
    } finally {
      await db.exec(`SET session_replication_role = DEFAULT`)
    }
    await db.query(`SELECT public.calcular_resumo_dia('2026-10-20')`)
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.resumo_assiduidade_dia WHERE colaborador_id = $1`, [c])
    expect(rows[0].n).toBe(1)
  })
})

describe('A4-04 — horas efetivas a partir das picagens autorizadas', () => {
  const DIA = '2026-10-21' // quarta-feira
  let semPausa, comPausa, corrigida, soPendente
  beforeAll(async () => {
    semPausa = await novoColab('Turno 8h', 'E1')
    comPausa = await novoColab('Turno pausa', 'E2')
    corrigida = await novoColab('Hora corrigida', 'E3')
    soPendente = await novoColab('Pendente', 'E4')
    for (const c of [semPausa, comPausa, corrigida, soPendente]) await atribuir(c, '2026-01-01')
    await picarDireto(semPausa, 'ENTRADA', DIA, '08:00')
    await picarDireto(semPausa, 'SAIDA', DIA, '17:00')
    await picarDireto(comPausa, 'ENTRADA', DIA, '08:00')
    await picarDireto(comPausa, 'PAUSA_INI', DIA, '12:00')
    await picarDireto(comPausa, 'PAUSA_FIM', DIA, '12:30')
    await picarDireto(comPausa, 'SAIDA', DIA, '17:30')
    // o dispositivo marcou 06:00; o gestor validou 08:00
    await picarDireto(corrigida, 'ENTRADA', DIA, '06:00', lx(DIA, '08:00'))
    await picarDireto(corrigida, 'SAIDA', DIA, '17:00')
    await db.query(`INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES
      ($1, $2, 'ENTRADA', ${lx(DIA, '08:00')}), ($1, $2, 'SAIDA', ${lx(DIA, '17:00')})`, [soPendente, obra])
    await db.query(`SELECT public.calcular_resumo_dia($1)`, [DIA])
  })

  it('08:00–17:00 com intervalo de 60 min no horário → 8 h efetivas e obra preenchida', async () => {
    expect(await resumo(semPausa, DIA)).toMatchObject({ obra_id: obra, prev: 8, efe: 8, desvio: 0, propostas: 0 })
  })

  it('pausas picadas descontam-se em vez do intervalo do horário', async () => {
    expect(await resumo(comPausa, DIA)).toMatchObject({ efe: 9, desvio: 1, propostas: 1 })
  })

  it('usa a hora validada pelo gestor; picagens pendentes não contam', async () => {
    expect((await resumo(corrigida, DIA)).efe).toBe(8)
    expect(await resumo(soPendente, DIA)).toMatchObject({ efe: 0, obra_id: null })
  })

  it('recalcular não toca nas horas suplementares validadas', async () => {
    await db.query(`UPDATE public.resumo_assiduidade_dia SET horas_supl_validadas = 1 WHERE colaborador_id = $1 AND data = $2`, [comPausa, DIA])
    await db.query(`SELECT public.calcular_resumo_dia($1)`, [DIA])
    expect(await resumo(comPausa, DIA)).toMatchObject({ efe: 9, validadas: 1 })
  })

  it('o mapa de assiduidade da contabilidade conta o dia trabalhado', async () => {
    const { rows } = await comoU(gestor, tx => tx.query(
      `SELECT dias_trabalhados, horas_normais::float AS h FROM public.contabilidade_mapa_assiduidade('2026-10-01', '2026-10-31')
        WHERE colaborador_id = $1`, [semPausa]))
    expect(rows[0]).toEqual({ dias_trabalhados: 1, h: 8 })
  })
})

describe('A1-04 — UPDATE continua só para admin/gestor', () => {
  it('colaborador não passa a própria picagem a AUTORIZADA (UPDATE nem upsert)', async () => {
    const { rows } = await comoU(motorista, tx => tx.query(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES ($1, $2, 'ENTRADA', now()) RETURNING id`,
      [colabProprio, obra]))
    const id = rows[0].id
    const upd = await comoU(motorista, tx => tx.query(
      `UPDATE public.picagens SET resultado = 'AUTORIZADA', hora_final_validada = now() WHERE id = $1 RETURNING id`, [id]))
    expect(upd.rows).toEqual([])
    await expect(comoU(motorista, tx => tx.query(
      `INSERT INTO public.picagens (id, colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES ($1, $2, $3, 'ENTRADA', now())
       ON CONFLICT (id) DO UPDATE SET resultado = 'AUTORIZADA'`, [id, colabProprio, obra]))).rejects.toThrow(/row-level security/)
    const { rows: r } = await db.query(`SELECT resultado FROM public.picagens WHERE id = $1`, [id])
    expect(r[0].resultado).toBe('PENDENTE_VALIDACAO')
  })
})

describe('I1 — picagens validadas depois do cron entram nas horas', () => {
  const DIA = '2026-10-22'
  let colab, entrada, saida
  beforeAll(async () => {
    colab = await novoColab('Validado depois', 'V1')
    await atribuir(colab, '2026-01-01')
    const ins = (tipo, hora) => db.query(
      `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES ($1, $2, $3, ${lx(DIA, hora)}) RETURNING id`,
      [colab, obra, tipo]).then(r => r.rows[0].id)
    entrada = await ins('ENTRADA', '08:00')
    saida = await ins('SAIDA', '17:00')
    await db.query(`SELECT public.calcular_resumo_dia($1)`, [DIA])
  })
  const validar = (id, set) => comoU(gestor, tx => tx.query(`UPDATE public.picagens SET ${set} WHERE id = $1`, [id]))

  it('o gestor valida no dia seguinte → o resumo passa de 0 a 8 h sem esperar pelo cron', async () => {
    expect((await resumo(colab, DIA)).efe).toBe(0)
    await validar(entrada, `resultado = 'AUTORIZADA', validada_em = now()`)
    await validar(saida, `resultado = 'AUTORIZADA', validada_em = now()`)
    expect(await resumo(colab, DIA)).toMatchObject({ efe: 8, obra_id: obra })
  })

  it('corrigir a hora ou recusar recalcula', async () => {
    await validar(saida, `hora_final_validada = ${lx(DIA, '16:00')}`)
    expect((await resumo(colab, DIA)).efe).toBe(7)
    await validar(saida, `resultado = 'RECUSADA'`)
    expect((await resumo(colab, DIA)).efe).toBe(0)
  })

  it('calcular_resumo_recentes (cron) recalcula os últimos 14 dias', async () => {
    const c = await novoColab('Recente', 'V2')
    await atribuir(c, '2026-01-01')
    const dia = `((now() AT TIME ZONE 'Europe/Lisbon')::date - 3)`
    await db.exec(`SET session_replication_role = replica`)
    try {
      await db.query(`INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, resultado) VALUES
        ($1, $2, 'ENTRADA', ((${dia} + time '08:00') AT TIME ZONE 'Europe/Lisbon'), 'AUTORIZADA'),
        ($1, $2, 'SAIDA',   ((${dia} + time '17:00') AT TIME ZONE 'Europe/Lisbon'), 'AUTORIZADA')`, [c, obra])
    } finally {
      await db.exec(`SET session_replication_role = DEFAULT`)
    }
    await db.query(`SELECT public.calcular_resumo_recentes(14)`)
    const { rows } = await db.query(
      `SELECT horas_efetivas::float AS efe FROM public.resumo_assiduidade_dia WHERE colaborador_id = $1 AND data = ${dia}`, [c])
    expect(rows[0].efe).toBe(8)
  })
})

describe('I2 — turnos que atravessam a meia-noite contam no dia da ENTRADA', () => {
  let noturno
  const colabNoturno = async num => { const c = await novoColab(`Noite ${num}`, num); await db.query(
    `INSERT INTO public.horario_colaborador (colaborador_id, horario_id, valido_de) VALUES ($1, $2, '2026-01-01')`, [c, noturno]); return c }
  beforeAll(async () => {
    noturno = (await db.query(
      `INSERT INTO public.horarios (designacao, periodo_diario_h, periodo_semanal_h, dias_semana, hora_entrada, hora_saida)
       VALUES ('Noite', 8, 40, '{1,2,3,4,5,6,7}', '22:00', '06:00') RETURNING id`)).rows[0].id
  })
  const calc = (...dias) => Promise.all(dias.map(d => db.query(`SELECT public.calcular_resumo_dia($1)`, [d])))

  it('22:00 → 06:00 do dia seguinte = 8 h no dia da entrada, 0 no seguinte', async () => {
    const c = await colabNoturno('N1')
    await picarDireto(c, 'ENTRADA', '2026-10-21', '22:00')
    await picarDireto(c, 'SAIDA', '2026-10-22', '06:00')
    await calc('2026-10-21', '2026-10-22')
    expect((await resumo(c, '2026-10-21')).efe).toBe(8)
    expect((await resumo(c, '2026-10-22')).efe).toBe(0)
  })

  it('08:00 → 01:00 do dia seguinte = 17 h', async () => {
    const c = await colabNoturno('N2')
    await picarDireto(c, 'ENTRADA', '2026-10-27', '08:00')
    await picarDireto(c, 'SAIDA', '2026-10-28', '01:00')
    await calc('2026-10-27')
    expect((await resumo(c, '2026-10-27')).efe).toBe(17)
  })

  it('mudança de hora (25/10) 00:30 → 05:30 = 6 h de tempo real', async () => {
    const c = await colabNoturno('N3')
    await picarDireto(c, 'ENTRADA', '2026-10-25', '00:30')
    await picarDireto(c, 'SAIDA', '2026-10-25', '05:30')
    await calc('2026-10-25')
    expect((await resumo(c, '2026-10-25')).efe).toBe(6)
  })

  it('SAIDA mais de 18 h depois (picagem esquecida) não emparelha', async () => {
    const c = await colabNoturno('N5')
    await picarDireto(c, 'ENTRADA', '2026-10-15', '08:00')
    await picarDireto(c, 'SAIDA', '2026-10-16', '04:00')
    await calc('2026-10-15')
    expect((await resumo(c, '2026-10-15')).efe).toBe(0)
  })

  it('ENTRADA sem SAIDA não se cola à ENTRADA do dia seguinte', async () => {
    const c = await colabNoturno('N4')
    await picarDireto(c, 'ENTRADA', '2026-10-19', '08:00')
    await picarDireto(c, 'ENTRADA', '2026-10-20', '08:00')
    await picarDireto(c, 'SAIDA', '2026-10-20', '17:00')
    await calc('2026-10-19', '2026-10-20')
    expect((await resumo(c, '2026-10-19')).efe).toBe(0)
    expect((await resumo(c, '2026-10-20')).efe).toBe(9)
  })
})

describe('migration', () => {
  it('é idempotente (aplica 2× sem erro)', async () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    await db.exec(sql)
    await db.exec(sql)
  })
})
