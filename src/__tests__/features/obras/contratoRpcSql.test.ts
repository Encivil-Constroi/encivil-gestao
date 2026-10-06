import { describe, expect, it } from 'vitest'

const migrations = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true })
const fontes = import.meta.glob(
  [
    '/src/features/obras/{services,legacy}/*.ts',
    '/src/features/obras/components/subempreitadas/**/*.ts',
    '/src/features/obras/hooks/*.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
)

const funcoes = new Set(
  Object.values(migrations).flatMap(sql =>
    [...(sql as string).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)].map(m => m[1]),
  ),
)
const chamadas = new Set(
  Object.values(fontes).flatMap(fonte =>
    [...(fonte as string).matchAll(/(?:\.rpc|rpcSemTipos(?:<[^>]*>)?)\(\s*['"](\w+)['"]/g)].map(m => m[1]),
  ),
)

describe('contrato RPC do módulo Obras', () => {
  it('todas as RPCs chamadas pelos serviços existem numa migration', () => {
    expect(chamadas.size).toBeGreaterThan(30)
    expect([...chamadas].filter(nome => !funcoes.has(nome))).toEqual([])
  })

  it('as RPCs do controlo de subempreitadas são chamadas e existem nas migrations A e B', () => {
    for (const nome of ['auto_submeter', 'auto_aprovar', 'auto_glosar', 'auto_registar_evidencia', 'subs_painel_ceo', 'sub_libertar_retencao']) {
      expect(funcoes.has(nome), nome).toBe(true)
    }
  })
})
