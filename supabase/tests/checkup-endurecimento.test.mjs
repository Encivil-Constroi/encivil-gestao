// @vitest-environment node
// Checkup 2026-10-28, lote BD-6: spatial_ref_sys só de leitura para a app (A1-05), EXECUTE de anon
// retirado (A1-07, A4-18, A3-13), conta nova nasce `leitura` (A1-09) e anon sem SELECT em
// colaboradores — 20261028120600.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = readFileSync(
  fileURLToPath(new URL('../migrations/20261028120600_checkup_endurecimento.sql', import.meta.url)), 'utf8')

const FUNCOES = [
  'public.promover_role(uuid, role_utilizador)',
  'public.contabilidade_mapa_assiduidade(date, date)',
  'public.custos_materiais_por_obra()',
]

let db
beforeAll(async () => {
  db = await criarBanco()
  // O PGlite não tem PostGIS: stub mínimo com a linha de que o geofence depende
  await db.exec(`
    CREATE TABLE public.spatial_ref_sys (srid int PRIMARY KEY, auth_name text);
    INSERT INTO public.spatial_ref_sys VALUES (4326, 'EPSG'), (3763, 'EPSG');
    -- Como os privilégios por omissão do Supabase em tabelas/funções do schema public
    GRANT ALL ON public.spatial_ref_sys TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION ${FUNCOES.join(', ')} TO anon;
    GRANT SELECT ON public.colaboradores TO anon;
    GRANT SELECT (id, nome) ON public.colaboradores TO anon;
  `)
  await db.exec(MIGRATION)
}, 120_000)

describe('spatial_ref_sys (A1-05)', () => {
  for (const papel of ['anon', 'authenticated']) {
    it(`${papel} não apaga, altera, insere nem trunca`, async () => {
      for (const sql of [
        `DELETE FROM public.spatial_ref_sys WHERE srid = 4326`,
        `UPDATE public.spatial_ref_sys SET auth_name = 'x' WHERE srid = 4326`,
        `INSERT INTO public.spatial_ref_sys VALUES (9999, 'x')`,
        `TRUNCATE public.spatial_ref_sys`,
      ]) {
        await expect(como(db, { papel }, tx => tx.query(sql))).rejects.toThrow()
      }
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.spatial_ref_sys WHERE srid = 4326`)
      expect(rows[0].n).toBe(1)
    })

    it(`${papel} continua a ler`, async () => {
      const { rows } = await como(db, { papel }, tx => tx.query(`SELECT srid FROM public.spatial_ref_sys WHERE srid = 4326`))
      expect(rows).toHaveLength(1)
    })
  }

  it('postgres (manutenção da extensão) continua a escrever', async () => {
    await db.query(`INSERT INTO public.spatial_ref_sys VALUES (9998, 'x')`)
    await db.query(`DELETE FROM public.spatial_ref_sys WHERE srid = 9998`)
  })

  it('o trigger recusa mesmo com o GRANT por omissão (em produção o REVOKE pode não pegar)', async () => {
    await db.exec(`GRANT ALL ON public.spatial_ref_sys TO anon, authenticated`)
    try {
      for (const papel of ['anon', 'authenticated']) {
        await expect(como(db, { papel }, tx => tx.query(`DELETE FROM public.spatial_ref_sys WHERE srid = 4326`)))
          .rejects.toThrow(/só de leitura/)
        await expect(como(db, { papel }, tx => tx.query(`TRUNCATE public.spatial_ref_sys`)))
          .rejects.toThrow(/só de leitura/)
      }
    } finally {
      await db.exec(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon, authenticated`)
    }
  })

  it('sem PostGIS a migration aplica-se na mesma (banco limpo)', async () => {
    // criarBanco() já aplicou a migration sem a tabela; reaplicar sobre a tabela prova a idempotência
    await db.exec(MIGRATION)
    await db.exec(MIGRATION)
    await expect(como(db, { papel: 'anon' }, tx => tx.query(`DELETE FROM public.spatial_ref_sys`))).rejects.toThrow()
  })
})

describe('EXECUTE de anon (A1-07, A4-18, A3-13)', () => {
  it.each(FUNCOES)('anon sem EXECUTE em %s; authenticated mantém', async (f) => {
    const { rows } = await db.query(
      `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') AS auth`, [f])
    expect(rows[0]).toEqual({ anon: false, auth: true })
  })
})

describe('colaboradores (revisão BD-1)', () => {
  it('anon sem SELECT na tabela nem em colunas', async () => {
    const { rows } = await db.query(
      `SELECT has_table_privilege('anon', 'public.colaboradores', 'SELECT') AS tabela,
              has_any_column_privilege('anon', 'public.colaboradores', 'SELECT') AS colunas`)
    expect(rows[0]).toEqual({ tabela: false, colunas: false })
  })
})

describe('papel por omissão de uma conta nova (A1-09)', () => {
  it('handle_new_user cria o perfil com papel leitura', async () => {
    const { rows } = await db.query(
      `INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('novo@t.pt', '{"nome":"Novo"}') RETURNING id`)
    const p = await db.query(`SELECT role, nome FROM public.profiles WHERE id = $1`, [rows[0].id])
    expect(p.rows[0]).toEqual({ role: 'leitura', nome: 'Novo' })
  })

  it('o default da coluna profiles.role também é leitura', async () => {
    const { rows } = await db.query(`
      SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'`)
    expect(rows[0].column_default).toMatch(/^'leitura'/)
  })

  it('admin promove a conta nova para gestor (caminho da Edge Function alterarPapel)', async () => {
    const admin = (await db.query(`INSERT INTO auth.users (email) VALUES ('adm@t.pt') RETURNING id`)).rows[0].id
    await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [admin])
    const alvo = (await db.query(`INSERT INTO auth.users (email) VALUES ('alvo@t.pt') RETURNING id`)).rows[0].id
    await como(db, { papel: 'authenticated', uid: admin },
      tx => tx.query(`SELECT public.promover_role($1, 'gestor')`, [alvo]))
    const { rows } = await db.query(`SELECT role FROM public.profiles WHERE id = $1`, [alvo])
    expect(rows[0].role).toBe('gestor')
  })
})
