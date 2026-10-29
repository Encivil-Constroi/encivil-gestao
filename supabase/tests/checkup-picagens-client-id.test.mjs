// @vitest-environment node
// Checkup 2026-10-28, lote BD-8: picagens idempotentes com client_id (reenvio da fila offline — 20261028120800).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120800_checkup_picagens_client_id.sql', import.meta.url))

let db, gestor, rui, ana, colabRui, colabAna, obra
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const novoColab = async (nome, num, userId) => (await db.query(
  `INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ($1, $2, 'Servente', $3) RETURNING id`,
  [nome, num, userId])).rows[0].id
// Como picagensService.registarPicagemOffline: INSERT direto com RETURNING (PostgREST .select())
const inserir = (uid, colab, clientId) => comoU(uid, tx => tx.query(
  `INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo, origem, client_id)
   VALUES ($1, $2, 'ENTRADA', now() - interval '1 hour', 'OFFLINE', $3) RETURNING id`, [colab, obra, clientId]))
const geofence = (uid, colab, clientId) => comoU(uid, tx => tx.query(
  `SELECT public.registar_picagem_geofence(p_colaborador_id => $1, p_obra_id => $2, p_tipo => 'ENTRADA', p_lat => 38.7,
     p_lon => -9.1, p_precisao_m => 10, p_timestamp_disp => now(), p_client_id => $3) AS r`, [colab, obra, clientId]))
  .then(r => r.rows[0].r)
const contar = async clientId => Number((await db.query(
  `SELECT count(*) AS n FROM public.picagens WHERE client_id = $1`, [clientId])).rows[0].n)

beforeAll(async () => {
  db = await criarBanco()
  gestor = await novoUtilizador('gestor', 'g@t.pt')
  rui = await novoUtilizador('leitura', 'rui@t.pt')
  ana = await novoUtilizador('leitura', 'ana@t.pt')
  colabRui = await novoColab('Rui', 'C1', rui)
  colabAna = await novoColab('Ana', 'C2', ana)
  obra = (await db.query(`INSERT INTO public.obras (nome) VALUES ('Obra Client Id') RETURNING id`)).rows[0].id
  // PostGIS não existe no PGlite: substitutos mínimos para exercitar a RPC de geofence
  await db.exec(`
    CREATE FUNCTION public.st_makepoint(double precision, double precision) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'PONTO' $$;
    CREATE FUNCTION public.geography(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
    CREATE FUNCTION public.st_distance(text, text) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$ SELECT 10::double precision $$;
  `)
  await db.query(`UPDATE public.obras SET geofence_tipo = 'RAIO', geofence_centro = 'CENTRO', geofence_raio_m = 100 WHERE id = $1`, [obra])
}, 120_000)

describe('INSERT direto (fila offline) com client_id', () => {
  it('o mesmo client_id enviado 2× → 1 linha; o reenvio não dá erro e não devolve linha', async () => {
    const id = randomUUID()
    const a = await inserir(rui, colabRui, id)
    const b = await inserir(rui, colabRui, id)
    expect(a.rows).toHaveLength(1)
    expect(b.rows).toHaveLength(0)
    expect(await contar(id)).toBe(1)
  })

  it('client_id diferentes → 2 linhas', async () => {
    const id1 = randomUUID(), id2 = randomUUID()
    await inserir(rui, colabRui, id1)
    await inserir(rui, colabRui, id2)
    expect(await contar(id1) + await contar(id2)).toBe(2)
  })

  it('outro colaborador com o mesmo client_id → recusado', async () => {
    const id = randomUUID()
    await inserir(rui, colabRui, id)
    await expect(inserir(ana, colabAna, id)).rejects.toThrow(/picagem já está registada/)
    expect(await contar(id)).toBe(1)
  })

  it('sem client_id (site/BD antigos) → continua a gravar sempre', async () => {
    const antes = Number((await db.query(`SELECT count(*) AS n FROM public.picagens WHERE client_id IS NULL`)).rows[0].n)
    await inserir(rui, colabRui, null)
    await inserir(rui, colabRui, null)
    const depois = Number((await db.query(`SELECT count(*) AS n FROM public.picagens WHERE client_id IS NULL`)).rows[0].n)
    expect(depois - antes).toBe(2)
  })

  it('o gestor reenvia uma picagem do colaborador com o mesmo client_id → ignorada', async () => {
    const id = randomUUID()
    await inserir(rui, colabRui, id)
    expect((await inserir(gestor, colabRui, id)).rows).toHaveLength(0)
    expect(await contar(id)).toBe(1)
  })

  it('o índice único parcial existe (duas transações em paralelo não passam as duas)', async () => {
    const { rows } = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'picagens_client_id_key'`)
    expect(rows[0].indexdef).toMatch(/UNIQUE INDEX .* \(client_id\) WHERE \(client_id IS NOT NULL\)/)
  })
})

describe('RPC registar_picagem_geofence com p_client_id', () => {
  it('o mesmo client_id 2× → 1 linha e a 2.ª chamada devolve a mesma picagem', async () => {
    const id = randomUUID()
    const r1 = await geofence(rui, colabRui, id)
    const r2 = await geofence(rui, colabRui, id)
    expect(r2).toEqual(r1)
    expect(r1.resultado).toBe('AUTORIZADA')
    expect(await contar(id)).toBe(1)
  })

  it('online pela RPC e depois reenviado pela fila (INSERT direto) → 1 linha', async () => {
    const id = randomUUID()
    await geofence(rui, colabRui, id)
    expect((await inserir(rui, colabRui, id)).rows).toHaveLength(0)
    expect(await contar(id)).toBe(1)
  })

  it('outro colaborador com o mesmo client_id → recusado', async () => {
    const id = randomUUID()
    await geofence(rui, colabRui, id)
    await expect(geofence(ana, colabAna, id)).rejects.toThrow(/picagem já está registada/)
  })

  it('chamada antiga sem p_client_id (7 argumentos, site atual) → continua a funcionar', async () => {
    const { rows } = await comoU(rui, tx => tx.query(
      `SELECT public.registar_picagem_geofence($1, $2, 'SAIDA', 38.7, -9.1, 10, now()) AS r`, [colabRui, obra]))
    expect(rows[0].r.resultado).toBe('AUTORIZADA')
  })

  it('a guarda de permissão continua: Ana não pica pelo Rui', async () => {
    await expect(geofence(ana, colabRui, randomUUID())).rejects.toThrow(/Sem permissão/)
  })

  it('só uma versão da RPC (sem ambiguidade no PostgREST) e anon não executa', async () => {
    const { rows } = await db.query(`SELECT p.oid::regprocedure::text AS f, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'registar_picagem_geofence'`)
    expect(rows).toEqual([{
      f: 'registar_picagem_geofence(uuid,uuid,text,double precision,double precision,integer,timestamp with time zone,uuid)',
      anon: false, auth: true,
    }])
  })
})

describe('migration idempotente', () => {
  it('aplicar duas vezes não falha e mantém o comportamento', async () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const id = randomUUID()
    await inserir(rui, colabRui, id)
    await inserir(rui, colabRui, id)
    expect(await contar(id)).toBe(1)
  })
})
