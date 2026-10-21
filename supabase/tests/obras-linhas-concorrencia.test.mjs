// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { criarBanco, como } from './pg-harness.mjs'

let db, uid, sub, numero = 0
const sql = async (s, p = []) => (await db.query(s, p)).rows
const q = async (s, p = []) => (await como(db, { papel: 'authenticated', uid }, tx => tx.query(s, p))).rows
const novoAuto = async () => (await sql(`INSERT INTO public.autos_medicao (subempreiteiro_id, numero, valor_periodo)
  VALUES ($1, $2, 100) RETURNING id`, [sub, ++numero]))[0].id
const linha = async a => (await q(`INSERT INTO public.auto_linhas (auto_id, descricao, unidade, preco_unitario, quantidade, is_extra, justificacao)
  VALUES ($1, 'Extra', 'un', 10, 10, true, 'Trabalho adicional') RETURNING id`, [a]))[0].id

beforeAll(async () => {
  db = await criarBanco()
  uid = (await sql('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [`${randomUUID()}@test.pt`]))[0].id
  await sql("UPDATE public.profiles SET role = 'medicoes' WHERE id = $1", [uid])
  const obra = (await sql("INSERT INTO public.obras (nome, estado) VALUES ('Locks isolados', 'ativa') RETURNING id"))[0].id
  sub = (await sql("INSERT INTO public.subempreiteiros (obra_id, nome, tipo, estado) VALUES ($1, 'Contrato', 'unitario', 'validado') RETURNING id", [obra]))[0].id
}, 120000)
afterAll(async () => { await db?.close() })

describe('Obras: linhas serializadas com o auto pai', () => {
  // PGlite tem uma sessão: a corrida efetiva é validada pelo script PostgreSQL de duas sessões.
  it.each(['UPDATE', 'DELETE'])('%s bloqueia o pai antes de devolver a linha (xmax de row lock)', async op => {
    const a = await novoAuto(), l = await linha(a)
    await como(db, { papel: 'authenticated', uid }, async tx => {
      await tx.query(op === 'UPDATE' ? 'UPDATE public.auto_linhas SET quantidade = 9 WHERE id = $1'
        : 'DELETE FROM public.auto_linhas WHERE id = $1', [l])
      expect((await tx.query(`SELECT xmax::text = pg_current_xact_id()::text AS locked
        FROM public.autos_medicao WHERE id = $1`, [a])).rows[0].locked).toBe(true)
    })
  })

  it.each(['UPDATE', 'DELETE', 'INSERT'])('%s em auto submetido mantém linhas e total', async op => {
    const a = await novoAuto(), l = await linha(a)
    await q('SELECT public.auto_submeter($1)', [a])
    const statements = {
      UPDATE: ['UPDATE public.auto_linhas SET quantidade = 999 WHERE id = $1', [l]],
      DELETE: ['DELETE FROM public.auto_linhas WHERE id = $1', [l]],
      INSERT: ["INSERT INTO public.auto_linhas (auto_id, descricao, unidade, preco_unitario, quantidade) VALUES ($1, 'Tardia', 'un', 10, 5)", [a]],
    }
    await expect(q(...statements[op])).rejects.toThrow(/já foi submetido/)
    expect(Number((await sql('SELECT sum(quantidade * preco_unitario) AS soma FROM public.auto_linhas WHERE auto_id = $1', [a]))[0].soma)).toBe(100)
    expect(Number((await sql('SELECT valor_periodo FROM public.autos_medicao WHERE id = $1', [a]))[0].valor_periodo)).toBe(100)
  })

  it('troca de pai verifica imutabilidade do antigo e do novo', async () => {
    const a = await novoAuto(), b = await novoAuto(), l = await linha(a)
    await linha(b)
    await q('SELECT public.auto_submeter($1)', [b])
    await expect(q('UPDATE public.auto_linhas SET auto_id = $2 WHERE id = $1', [l, b])).rejects.toThrow(/já foi submetido/)
    await q('SELECT public.auto_submeter($1)', [a])
    const c = await novoAuto()
    await expect(q('UPDATE public.auto_linhas SET auto_id = $2 WHERE id = $1', [l, c])).rejects.toThrow(/já foi submetido/)
    expect((await sql('SELECT auto_id FROM public.auto_linhas WHERE id = $1', [l]))[0].auto_id).toBe(a)
  })

  it('GUC pela API não autoriza escrita em auto submetido', async () => {
    const a = await novoAuto(), l = await linha(a)
    await q('SELECT public.auto_submeter($1)', [a])
    await expect(como(db, { papel: 'authenticated', uid }, async tx => {
      await tx.query("SELECT set_config('app.auto_rpc', 'on', true)")
      await tx.query('UPDATE public.auto_linhas SET quantidade = 999 WHERE id = $1', [l])
    })).rejects.toThrow(/já foi submetido/)
  })

  it('DELETE privilegiado em rascunho conserva cascata; API não ganha permissões', async () => {
    const a = await novoAuto(), l = await linha(a)
    await sql('DELETE FROM public.autos_medicao WHERE id = $1', [a])
    expect(await sql('SELECT id FROM public.auto_linhas WHERE id = $1', [l])).toHaveLength(0)
    const funcs = await sql(`SELECT p.proname, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('_trg_auto_linha_imutavel', 'pode_relatar_obra')`)
    expect(funcs).toHaveLength(2)
    for (const f of funcs) {
      expect(f.proconfig).toContain('search_path=public')
      expect(f.anon).toBe(false)
      expect(f.autenticado).toBe(f.proname === 'pode_relatar_obra')
    }
  })

  it('reaplicar migration conserva as guardas e dados', async () => {
    const a = await novoAuto(), l = await linha(a)
    const migration = readFileSync(new URL('../migrations/20261008100000_obras_concorrencia_mfa.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    expect((await sql('SELECT auto_id FROM public.auto_linhas WHERE id = $1', [l]))[0].auto_id).toBe(a)
    await q('SELECT public.auto_submeter($1)', [a])
    await expect(q('DELETE FROM public.auto_linhas WHERE id = $1', [l])).rejects.toThrow(/já foi submetido/)
  })
})
