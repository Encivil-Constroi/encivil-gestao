// @vitest-environment node
// Checkup 2026-10-28, lote BD-9: desempenho medido na carga (Task 7 — 20261028120900).
// A matriz de acesso por papel é calculada na MESMA base, com os mesmos dados, antes e depois
// de aplicar a migration: tem de ficar idêntica (as policies só mudam de forma, não de sentido).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco } from './pg-harness.mjs'

const NOME = '20261028120900_checkup_desempenho.sql'
const MIGRATION = fileURLToPath(new URL(`../migrations/${NOME}`, import.meta.url))
const PAPEIS = ['admin', 'gestor', 'armazem', 'medicoes', 'mecanico', 'motorista', 'leitura']
const ROLLBACK = Symbol('rollback')
// Chamadas sem dependência da linha que a migration embrulha em (SELECT …) — e pode_ver_obra(col)
const NAO_EMBRULHADA = /(?<!SELECT )(?<![.\w])(auth\.uid\(\)|auth\.role\(\)|(public\.)?(auth_role|pode_ler_obras|pode_gerir_obras|pode_medir_obras|pode_aprovar_combustivel)\(\)|(public\.)?pode_escrever\('[a-z_]+'::text\)|pode_ver_obra\()/

let db, uids = {}, antes, depois, matrizAntes, matrizDepois, rlsAntes, rlsDepois, sqlMigration

const q = (sql, p = []) => db.query(sql, p)
const id1 = async (sql, p = []) => (await q(sql, p)).rows[0].id

async function politicas() {
  const { rows } = await q(`SELECT tablename, policyname, cmd, roles::text AS roles, permissive, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`)
  return Object.fromEntries(rows.map(r => [`${r.tablename}.${r.policyname}`, r]))
}

// Avalia uma expressão de policy, como postgres mas com a sessão do papel, sobre todas as
// linhas da tabela e mais uma linha toda a NULL (exercita as partes que não dependem da linha).
async function avaliar(tabela, expr, papel) {
  if (expr == null) return null
  const uid = papel === 'anon' ? '' : uids[papel]
  try {
    return await db.transaction(async tx => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
        [uid, papel === 'anon' ? 'anon' : 'authenticated'])
      const { rows } = await tx.query(`SELECT coalesce(string_agg(CASE WHEN (${expr}) THEN 't' WHEN NOT (${expr}) THEN 'f' ELSE 'n' END,
          '' ORDER BY _ordem_teste), '') AS m
        FROM (SELECT x.*, x.ctid::text AS _ordem_teste FROM public.${tabela} x
              UNION ALL SELECT (NULL::public.${tabela}).*, 'zz') AS ${tabela}`)
      return rows[0].m
    })
  } catch (e) { return `erro:${e.code ?? e.message}` }
}

async function matrizExpressoes(pols) {
  const m = {}
  for (const [k, p] of Object.entries(pols)) {
    for (const papel of [...PAPEIS, 'anon']) {
      m[`${k}|${papel}|using`] = await avaliar(p.tablename, p.qual, papel)
      m[`${k}|${papel}|check`] = await avaliar(p.tablename, p.with_check, papel)
    }
  }
  return m
}

// Acesso real (RLS + GRANTs) como cada papel: linhas visíveis, e UPDATE/DELETE desfeitos no fim
async function comoPapel(papel, sql) {
  let r
  try {
    await db.transaction(async tx => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`,
        [papel === 'anon' ? '' : uids[papel], papel === 'anon' ? 'anon' : 'authenticated'])
      await tx.exec(`SET LOCAL ROLE ${papel === 'anon' ? 'anon' : 'authenticated'}`)
      const res = await tx.query(sql)
      r = String(res.rows[0]?.n ?? res.affectedRows)
      throw ROLLBACK
    })
  } catch (e) { if (e !== ROLLBACK) r = `erro:${e.code ?? e.message}` }
  return r
}

async function matrizRls(tabelas) {
  const m = {}
  for (const t of tabelas) {
    const { rows: [c] } = await q(`SELECT a.attname FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0
      AND NOT a.attisdropped AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') ORDER BY a.attnum LIMIT 1`, [`public.${t}`])
    for (const papel of [...PAPEIS, 'anon']) {
      m[`${t}|${papel}|select`] = await comoPapel(papel, `SELECT count(*)::int AS n FROM public.${t}`)
      if (c) m[`${t}|${papel}|update`] = await comoPapel(papel, `UPDATE public.${t} SET "${c.attname}" = "${c.attname}"`)
      m[`${t}|${papel}|delete`] = await comoPapel(papel, `DELETE FROM public.${t}`)
    }
  }
  return m
}

async function semear() {
  for (const p of PAPEIS) {
    uids[p] = await id1(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${p}@carga.pt`])
    await q(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [p, p, uids[p]])
  }
  const outro = await id1(`INSERT INTO auth.users (email) VALUES ('outro@carga.pt') RETURNING id`)
  const colabs = {}
  for (const p of ['leitura', 'motorista', 'armazem']) {
    colabs[p] = await id1(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo, user_id) VALUES ($1, $2, 'Servente', $3) RETURNING id`,
      [`Colab ${p}`, `N-${p}`, uids[p]])
  }
  const colabSemUser = await id1(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Sem conta', 'N-x', 'Servente') RETURNING id`)
  const obraA = await id1(`INSERT INTO public.obras (nome) VALUES ('Obra A') RETURNING id`)
  await q(`INSERT INTO public.obras (nome) VALUES ('Obra B')`)
  await q(`INSERT INTO public.obra_autores (obra_id, user_id) VALUES ($1, $2), ($1, $3)`, [obraA, uids.armazem, uids.mecanico])
  const prod = await id1(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
    VALUES ('D-1', 'Cimento', 'cimento', 'saco', 0, 5) RETURNING id`)
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uids.admin])
  await q(`SELECT public.registar_movimento($1, 'entrada', 50, 'Zé')`, [prod])
  await q(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  for (const c of [...Object.values(colabs), colabSemUser]) {
    await q(`INSERT INTO public.picagens (colaborador_id, obra_id, tipo, timestamp_dispositivo) VALUES ($1, $2, 'ENTRADA', now())`, [c, obraA])
  }
  for (const u of [...Object.values(uids), outro]) {
    await q(`INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'k', 'a')`,
      [u, `https://fcm.googleapis.com/fcm/send/${u}`])
  }
  const v = await id1(`INSERT INTO public.comb_veiculos (nome, identificacao) VALUES ('Carrinha', '00-AA-00') RETURNING id`)
  await q(`INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, responsavel, solicitante_id) VALUES ($1, 10, 15, 'x', $2), ($1, 20, 30, 'y', $3)`,
    [v, uids.motorista, outro])
  await q(`INSERT INTO public.ferramentas (codigo, nome) VALUES ('F-1', 'Berbequim')`)
}

beforeAll(async () => {
  db = await criarBanco({ ate: '20261028120800_zzz' })
  await semear()
  antes = await politicas()
  const tabelas = [...new Set(Object.values(antes).map(p => p.tablename))]
  matrizAntes = await matrizExpressoes(antes)
  rlsAntes = await matrizRls(tabelas)
  sqlMigration = readFileSync(MIGRATION, 'utf8')
  await db.exec(sqlMigration)
  depois = await politicas()
  matrizDepois = await matrizExpressoes(depois)
  rlsDepois = await matrizRls(tabelas)
}, 300_000)

const reescritas = () => Object.keys(antes).filter(k =>
  antes[k].qual !== depois[k].qual || antes[k].with_check !== depois[k].with_check)

describe('BD-9 — índice para as contagens do dashboard', () => {
  it('movimentos_stock (tipo, created_at DESC)', async () => {
    const { rows } = await q(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'movimentos_stock'
      AND indexname = 'idx_movimentos_stock_tipo_created_at'`)
    expect(rows[0]?.indexdef).toMatch(/\(tipo, created_at DESC\)/)
  })
})

describe('BD-9 — policies com as funções avaliadas uma vez (initplan)', () => {
  it('as mesmas policies, com os mesmos comandos, papéis e tipo', () => {
    expect(Object.keys(depois)).toEqual(Object.keys(antes))
    for (const k of Object.keys(antes)) {
      const { cmd, roles, permissive } = antes[k]
      expect({ k, cmd: depois[k].cmd, roles: depois[k].roles, permissive: depois[k].permissive }).toEqual({ k, cmd, roles, permissive })
    }
  })

  it('as policies das tabelas medidas na carga foram reescritas', () => {
    expect(reescritas()).toEqual(expect.arrayContaining([
      'movimentos_stock.movimentos_select_auth', 'produtos.produtos_select_auth', 'obras.obras_select_modulo',
      'picagens.picagens_sel', 'comb_abastecimentos.comb_abast_select_auth', 'profiles.profiles_select_own_or_admin',
    ]))
    expect(reescritas().length).toBeGreaterThan(80)
  })

  it('nenhuma policy de public fica com chamadas por linha das funções de sessão', () => {
    const resto = Object.entries(depois)
      .filter(([, p]) => NAO_EMBRULHADA.test(p.qual ?? '') || NAO_EMBRULHADA.test(p.with_check ?? ''))
      .map(([k]) => k)
    expect(resto).toEqual([])
  })

  it('as reescritas usam (SELECT …)', () => {
    for (const k of reescritas()) {
      expect(`${depois[k].qual ?? ''} ${depois[k].with_check ?? ''}`, k).toMatch(/\( SELECT /)
    }
  })

  it('obras: pode_ver_obra(id) passa a (SELECT pode_ler_obras()) OR _autor_designado(id)', () => {
    expect(depois['obras.obras_select_modulo'].qual)
      .toBe('(( SELECT pode_ler_obras() AS pode_ler_obras) OR _autor_designado(id))')
  })

  it('pode_ver_obra continua a ser pode_ler_obras() OR _autor_designado() (se mudar, rever as policies)', async () => {
    const { rows: [r] } = await q(`SELECT prosrc FROM pg_proc WHERE oid = 'public.pode_ver_obra(uuid)'::regprocedure`)
    expect(r.prosrc.trim()).toBe('SELECT public.pode_ler_obras() OR public._autor_designado(p_obra_id)')
  })
})

describe('BD-9 — semântica de acesso idêntica antes/depois (mesma base, mesmos dados)', () => {
  it('matriz das expressões das policies por papel (8 papéis, todas as policies de public)', () => {
    expect(Object.keys(matrizAntes).length).toBeGreaterThan(1500)
    expect(Object.values(matrizAntes).some(v => v?.includes('t'))).toBe(true)
    expect(matrizDepois).toEqual(matrizAntes)
  })

  it('matriz de acesso real (SELECT/UPDATE/DELETE como cada papel, com RLS e GRANTs)', () => {
    expect(rlsDepois).toEqual(rlsAntes)
    // Sanidade: a matriz distingue papéis
    expect(rlsAntes['picagens|leitura|select']).toBe('1')
    expect(rlsAntes['picagens|gestor|select']).toBe('4')
    expect(rlsAntes['obras|mecanico|select']).toBe('0')
    expect(rlsAntes['obras|leitura|select']).toBe('2')
    expect(rlsAntes['comb_abastecimentos|motorista|select']).toBe('1')
    expect(rlsAntes['push_subscriptions|leitura|select']).toBe('1')
    expect(rlsAntes['movimentos_stock|anon|select']).toMatch(/^erro:/)
  })
})

describe('migration idempotente', () => {
  it('aplicar outra vez não falha nem volta a mexer nas policies', async () => {
    await db.exec(sqlMigration)
    expect(await politicas()).toEqual(depois)
  })
})
