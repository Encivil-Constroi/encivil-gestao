// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin
beforeAll(async () => {
  db = await criarBanco()
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ('a@t.pt') RETURNING id`)
  admin = rows[0].id
  await db.query(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [admin])
}, 120_000)
const comoAdmin = fn => como(db, { papel: 'authenticated', uid: admin }, fn)
const ultimo = async (tabela) => (await db.query(
  `SELECT * FROM public.audit_log WHERE tabela = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [tabela])).rows[0]

describe('auditoria genérica', () => {
  // A tabela de faturas chama-se faturas_fornecedor (20260917000000_fase6_faturas.sql)
  it.each(['profiles', 'colaboradores', 'faturas_fornecedor', 'comb_aprovadores', 'configuracoes_empresa', 'seguranca_config', 'obras'])(
    'trigger instalado em %s', async (t) => {
      const { rows } = await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'auditar_alteracao' AND tgrelid = ('public.' || $1)::regclass`, [t])
      expect(rows).toHaveLength(1)
    })
  it('INSERT regista quem e o quê', async () => {
    const id = (await comoAdmin(tx => tx.query(`INSERT INTO public.colaboradores (nome, numero_mecan, cargo) VALUES ('Zé','A1','Servente') RETURNING id`))).rows[0].id
    const a = await ultimo('colaboradores')
    expect(a).toMatchObject({ action: 'colaboradores.insert', operacao: 'INSERT', actor_id: admin, target_id: id })
  })
  it('UPDATE regista só as colunas alteradas com antes/depois', async () => {
    const id = (await db.query(`SELECT id FROM public.colaboradores WHERE numero_mecan = 'A1'`)).rows[0].id
    await comoAdmin(tx => tx.query(`UPDATE public.colaboradores SET cargo = 'Encarregado' WHERE id = $1`, [id]))
    const a = await ultimo('colaboradores')
    expect(a.action).toBe('colaboradores.update')
    expect(a.details).toEqual({ cargo: { antes: 'Servente', depois: 'Encarregado' } })
  })
  it('UPDATE sem mudança real não regista', async () => {
    const antes = (await db.query(`SELECT count(*)::int n FROM public.audit_log`)).rows[0].n
    await comoAdmin(tx => tx.query(`UPDATE public.colaboradores SET cargo = cargo WHERE numero_mecan = 'A1'`))
    expect((await db.query(`SELECT count(*)::int n FROM public.audit_log`)).rows[0].n).toBe(antes)
  })
  it('chave primária não-uuid (seguranca_config) não rebenta', async () => {
    await db.query(`UPDATE public.seguranca_config SET mfa_obrigatorio = NOT mfa_obrigatorio`)
    const a = await ultimo('seguranca_config')
    expect(a.target_id).toBeNull()
  })
  it('audit_log é imutável, mesmo para o dono', async () => {
    await expect(db.query(`UPDATE public.audit_log SET action = 'x'`)).rejects.toThrow(/imutáve/)
    await expect(db.query(`DELETE FROM public.audit_log`)).rejects.toThrow(/imutáve/)
    await expect(db.query(`TRUNCATE public.audit_log`)).rejects.toThrow(/imutáve/)
  })
  it('as escritas antigas no audit_log continuam a funcionar (promover_role)', async () => {
    const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ('g2@t.pt') RETURNING id`)
    // aal2: o teste anterior pode ter deixado o interruptor do MFA ligado
    await como(db, { papel: 'authenticated', uid: admin, aal: 'aal2' }, tx =>
      tx.query(`SELECT public.promover_role($1, 'gestor')`, [rows[0].id]))
    const r = await db.query(`SELECT count(*)::int n FROM public.audit_log WHERE action = 'role_change' AND target_id = $1`, [rows[0].id])
    expect(r.rows[0].n).toBe(1)
  })
})
