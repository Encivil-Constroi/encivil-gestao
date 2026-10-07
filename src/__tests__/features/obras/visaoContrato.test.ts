import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obraFixture } from './obrasFixtures'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/features/obras/db', () => ({ obrasDb: { rpc } }))
import { buscarVisao } from '@/features/obras/services/obrasService'

beforeEach(() => rpc.mockReset())
describe('visão de obra na fronteira PostgREST', () => {
  it('abre uma obra devolvida como composto único', async () => {
    const obra = obraFixture()
    rpc.mockResolvedValue({ data: obra, error: null })
    expect(await buscarVisao(obra.obra_id)).toEqual(obra)
  })
  it('mantém compatibilidade com resposta em lista', async () => {
    const obra = obraFixture()
    rpc.mockResolvedValue({ data: [obra], error: null })
    expect(await buscarVisao(obra.obra_id)).toEqual(obra)
  })
  it.each([null, [], {}])('recusa resposta sem obra: %j', async data => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(buscarVisao('ausente')).rejects.toThrow(/Obra não encontrada/)
  })
  it('preserva o erro de autorização do servidor', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Sem permissão' } })
    await expect(buscarVisao('negada')).rejects.toMatchObject({ code: '42501' })
  })
})
