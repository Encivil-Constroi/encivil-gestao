// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco } from './pg-harness.mjs'

let db
beforeAll(async () => { db = await criarBanco() })

describe('eventos de recuperação de acesso', () => {
  it('aceita os tipos novos', async () => {
    for (const t of ['link_recuperacao_admin', 'senha_redefinida_admin']) {
      await db.query(`SELECT public._registar_evento($1, NULL, '{}'::jsonb)`, [t])
    }
    const { rows } = await db.query(`SELECT tipo FROM public.eventos_seguranca WHERE tipo LIKE '%admin'`)
    expect(rows.map(r => r.tipo)).toEqual(expect.arrayContaining(['link_recuperacao_admin', 'senha_redefinida_admin']))
  })
  it('tipo desconhecido continua a falhar', async () => {
    await expect(db.query(`INSERT INTO public.eventos_seguranca (tipo) VALUES ('xpto')`)).rejects.toThrow(/check/i)
  })
})
