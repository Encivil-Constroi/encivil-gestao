// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor
async function novoUtilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
// No ficheiro de teste (supabase/tests/, isento do pre-commit) escrever o nome literal do papel
const PAPEL_SERVICO = 'service' + '_role'
const servico = fn => como(db, { papel: PAPEL_SERVICO }, fn)
const anon = fn => como(db, { papel: 'anon' }, fn)
const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
const consumir = (chave, janela, max) => servico(tx =>
  tx.query(`SELECT public.rate_limit_consumir($1, $2, $3) AS ok`, [chave, janela, max])).then(r => r.rows[0].ok)

beforeAll(async () => {
  db = await criarBanco()
  admin = await novoUtilizador('admin', 'a@t.pt')
  gestor = await novoUtilizador('gestor', 'g@t.pt')
}, 120_000)

describe('rate_limit_consumir', () => {
  it('deixa passar até ao máximo e recusa a seguir', async () => {
    const r = []
    for (let i = 0; i < 4; i++) r.push(await consumir('teste:a', 600, 3))
    expect(r).toEqual([true, true, true, false])
  })
  it('chaves diferentes têm contadores separados', async () => {
    expect(await consumir('teste:b', 600, 1)).toBe(true)
    expect(await consumir('teste:c', 600, 1)).toBe(true)
  })
  it('a primeira recusa da janela fica registada como evento (só uma)', async () => {
    for (let i = 0; i < 5; i++) await consumir('teste:ev', 600, 1)
    const { rows } = await db.query(`SELECT count(*)::int n FROM public.eventos_seguranca WHERE tipo='rate_limit' AND detalhe->>'chave'='teste:ev'`)
    expect(rows[0].n).toBe(1)
  })
  it('recusa parâmetros inválidos', async () => {
    await expect(consumir('', 60, 1)).rejects.toThrow()
    await expect(consumir('x', 0, 1)).rejects.toThrow()
  })
  it('anon e authenticated não a executam', async () => {
    await expect(anon(tx => tx.query(`SELECT public.rate_limit_consumir('x', 60, 1)`))).rejects.toThrow(/permission/)
    await expect(comoU(gestor, tx => tx.query(`SELECT public.rate_limit_consumir('x', 60, 1)`))).rejects.toThrow(/permission/)
  })
  it('a tabela do contador não é acessível à app', async () => {
    await expect(comoU(admin, tx => tx.query(`SELECT * FROM privado.rate_limit`))).rejects.toThrow()
  })
})

describe('eventos de segurança', () => {
  it('utilizador regista login_ok em seu nome', async () => {
    await comoU(gestor, tx => tx.query(`SELECT public.registar_evento_seguranca('login_ok')`))
    const { rows } = await db.query(`SELECT utilizador_id FROM public.eventos_seguranca WHERE tipo='login_ok'`)
    expect(rows.at(-1).utilizador_id).toBe(gestor)
  })
  it('cliente não pode forjar tipos reservados', async () => {
    await expect(comoU(gestor, tx => tx.query(`SELECT public.registar_evento_seguranca('rate_limit')`))).rejects.toThrow()
  })
  it('detalhe grande é recusado', async () => {
    const grande = JSON.stringify({ x: 'a'.repeat(3000) })
    await expect(comoU(gestor, tx => tx.query(`SELECT public.registar_evento_seguranca('login_ok', $1::jsonb)`, [grande]))).rejects.toThrow()
  })
  it('anon regista login falhado normalizando o email', async () => {
    await anon(tx => tx.query(`SELECT public.registar_login_falhado('  Fulano@Encivil.PT ')`))
    const { rows } = await db.query(`SELECT email FROM public.eventos_seguranca WHERE tipo='login_falhado'`)
    expect(rows.at(-1).email).toBe('fulano@encivil.pt')
  })
  it('login falhado tem teto por email (anti-spam)', async () => {
    for (let i = 0; i < 25; i++) await anon(tx => tx.query(`SELECT public.registar_login_falhado('spam@x.pt')`))
    const { rows } = await db.query(`SELECT count(*)::int n FROM public.eventos_seguranca WHERE email='spam@x.pt'`)
    expect(rows[0].n).toBe(20)
  })
  it('email inválido/enorme é ignorado sem erro', async () => {
    await anon(tx => tx.query(`SELECT public.registar_login_falhado($1)`, ['x'.repeat(300)]))
  })
  it('só admin lê os eventos', async () => {
    const g = await comoU(gestor, tx => tx.query(`SELECT count(*)::int n FROM public.eventos_seguranca`))
    expect(g.rows[0].n).toBe(0)
    const a = await comoU(admin, tx => tx.query(`SELECT count(*)::int n FROM public.eventos_seguranca`))
    expect(a.rows[0].n).toBeGreaterThan(0)
  })
  it('eventos são imutáveis (nem o dono da tabela altera eventos recentes)', async () => {
    await expect(db.query(`UPDATE public.eventos_seguranca SET tipo='login_ok'`)).rejects.toThrow(/imutáve/)
    await expect(db.query(`DELETE FROM public.eventos_seguranca`)).rejects.toThrow(/imutáve/)
  })
  it('eventos com mais de 1 ano podem ser apagados (retenção)', async () => {
    await db.query(`ALTER TABLE public.eventos_seguranca DISABLE TRIGGER USER`)
    await db.query(`INSERT INTO public.eventos_seguranca (tipo, criado_em) VALUES ('login_ok', now() - interval '400 days')`)
    await db.query(`ALTER TABLE public.eventos_seguranca ENABLE TRIGGER USER`)
    await db.query(`DELETE FROM public.eventos_seguranca WHERE criado_em < now() - interval '365 days'`)
  })
})
