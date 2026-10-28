// @vitest-environment node
// Checkup 2026-10-28, lote BD-3: MFA dos aprovadores e escrita de combustível (A1-03, A4-07, A4-12 — 20261028120300).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const MIGRATION = fileURLToPath(new URL('../migrations/20261028120300_checkup_mfa_combustivel.sql', import.meta.url))

let db, admin, gestor, armazem, motorista, outroMotorista, veiculo
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const q = async (uid, aal, sql, p = []) => (await como(db, { papel: 'authenticated', uid, aal }, tx => tx.query(sql, p))).rows
const mfa = (ativo) => db.query(`UPDATE public.seguranca_config SET mfa_obrigatorio = $1`, [ativo])
const podeAprovar = async (uid, aal) => (await q(uid, aal, `SELECT public.pode_aprovar_combustivel() AS ok`))[0].ok
const novoPendente = async (estado) => (await db.query(
  `INSERT INTO public.comb_abastecimentos_pendentes (veiculo_id, veiculo_nome, funcionario_nome, estado)
   VALUES ($1, 'Ford Transit', 'Zé', $2) RETURNING id`, [veiculo, estado])).rows[0].id

beforeAll(async () => {
  db = await criarBanco()
  admin = await novoUtilizador('admin', 'a@t.pt')
  gestor = await novoUtilizador('gestor', 'g@t.pt')
  armazem = await novoUtilizador('armazem', 'arm@t.pt')
  motorista = await novoUtilizador('motorista', 'm@t.pt')
  outroMotorista = await novoUtilizador('motorista', 'm2@t.pt')
  veiculo = (await db.query(`INSERT INTO public.comb_veiculos (nome, identificacao) VALUES ('Ford Transit', '50-AA-50') RETURNING id`)).rows[0].id
  await db.query(`INSERT INTO public.comb_aprovadores (user_id) VALUES ($1), ($2)`, [gestor, motorista])
}, 120_000)

describe('A1-03 — aprovador de combustível respeita o MFA obrigatório', () => {
  it('MFA ligado: gestor aprovador com aal1 não aprova nem designa aprovadores', async () => {
    await mfa(true)
    expect(await podeAprovar(gestor, 'aal1')).toBe(false)
    await expect(q(gestor, 'aal1', `SELECT public.definir_aprovador_combustivel($1, true)`, [outroMotorista]))
      .rejects.toThrow(/designar aprovadores/)
    await expect(q(gestor, 'aal1', `SELECT public.definir_preco_combustivel('gasoleo', 0.5)`))
      .rejects.toThrow(/Sem permissão/)
    const { rows } = await db.query(`SELECT 1 FROM public.comb_aprovadores WHERE user_id = $1`, [outroMotorista])
    expect(rows).toHaveLength(0)
  })

  it('MFA ligado: gestor aprovador com aal2 aprova e designa', async () => {
    await mfa(true)
    expect(await podeAprovar(gestor, 'aal2')).toBe(true)
    await q(gestor, 'aal2', `SELECT public.definir_aprovador_combustivel($1, true)`, [outroMotorista])
    await q(gestor, 'aal2', `SELECT public.definir_aprovador_combustivel($1, false)`, [outroMotorista])
  })

  it('MFA desligado: gestor aprovador com aal1 continua a aprovar (estado de hoje)', async () => {
    await mfa(false)
    expect(await podeAprovar(gestor, 'aal1')).toBe(true)
  })

  it('MFA ligado: aprovador motorista (papel sem MFA obrigatório) não é afetado', async () => {
    await mfa(true)
    expect(await podeAprovar(motorista, 'aal1')).toBe(true)
  })

  it('MFA ligado: autor designado gestor com aal1 deixa de valer como autor; aal2 mantém', async () => {
    await mfa(true)
    const obra = (await db.query(`INSERT INTO public.obras (nome, estado) VALUES ('Obra BD-3', 'ativa') RETURNING id`)).rows[0].id
    await db.query(`INSERT INTO public.obra_autores (obra_id, user_id) VALUES ($1, $2)`, [obra, gestor])
    const autor = async (aal) => (await db.transaction(async tx => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [gestor])
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ aal })])
      return tx.query(`SELECT public._autor_designado($1) AS ok`, [obra])
    })).rows[0].ok
    expect(await autor('aal1')).toBe(false)
    expect(await autor('aal2')).toBe(true)
    await mfa(false)
    expect(await autor('aal1')).toBe(true)
  })
})

describe('A4-07 — pedidos de abastecimento não se apagam por fora do fluxo', () => {
  it('armazem não apaga um pedido AUTORIZADO por DELETE direto', async () => {
    await mfa(false)
    const id = await novoPendente('AUTORIZADO')
    let apagadas = []
    try {
      apagadas = await q(armazem, null, `DELETE FROM public.comb_abastecimentos_pendentes WHERE id = $1 RETURNING id`, [id])
    } catch (e) {
      expect(e.message).toMatch(/permission denied/)
    }
    expect(apagadas).toHaveLength(0)
    expect((await db.query(`SELECT 1 FROM public.comb_abastecimentos_pendentes WHERE id = $1`, [id])).rows).toHaveLength(1)
  })

  it('rejeitar_abastecimento_pendente não é executável por authenticated', async () => {
    const id = await novoPendente('CONCLUIDO')
    await expect(q(gestor, null, `SELECT public.rejeitar_abastecimento_pendente($1)`, [id]))
      .rejects.toMatchObject({ code: '42501' })
    expect((await db.query(`SELECT 1 FROM public.comb_abastecimentos_pendentes WHERE id = $1`, [id])).rows).toHaveLength(1)
  })
})

describe('A4-12 — alteração de abastecimento fica no audit_log', () => {
  it('UPDATE de litros como armazem grava antes/depois', async () => {
    const id = (await db.query(
      `INSERT INTO public.comb_abastecimentos (veiculo_id, litros, custo_total, responsavel) VALUES ($1, 30, 45, 'x') RETURNING id`,
      [veiculo])).rows[0].id
    const upd = await q(armazem, null, `UPDATE public.comb_abastecimentos SET litros = 60 WHERE id = $1 RETURNING id`, [id])
    expect(upd).toHaveLength(1)
    const { rows } = await db.query(
      `SELECT actor_id, details FROM public.audit_log WHERE tabela = 'comb_abastecimentos' AND operacao = 'UPDATE' AND target_id = $1`, [id])
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_id).toBe(armazem)
    expect(Number(rows[0].details.litros.antes)).toBe(30)
    expect(Number(rows[0].details.litros.depois)).toBe(60)
  })
})

describe('migration', () => {
  it('é idempotente (aplica 2× sem erro)', async () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    await db.exec(sql)
    await db.exec(sql)
  })
})
