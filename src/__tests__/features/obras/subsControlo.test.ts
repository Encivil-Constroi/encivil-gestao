import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { obrasDb } from '@/features/obras/db'
import * as svc from '@/features/obras/services/subsControloService'
import { useAprovarAuto, useGuardarConfigSubs, useLibertarRetencao } from '@/features/obras/hooks/useSubsControlo'
import * as asyncLib from '@/app/lib/useAsync'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))
vi.mock('@/app/lib/sentry', () => ({ captureError: vi.fn() }))

const rpc = vi.mocked(obrasDb.rpc)
const from = vi.mocked(obrasDb.from)
const ok = (data: unknown = null) => rpc.mockResolvedValueOnce({ data, error: null } as never)
const falha = (msg = 'falhou') => rpc.mockResolvedValueOnce({ data: null, error: new Error(msg) } as never)

beforeEach(() => vi.resetAllMocks())

describe('RPCs sem retorno: nome e argumentos', () => {
  it.each([
    ['subs_config_ler', () => svc.lerConfigSubs(), {}],
    ['subs_config_guardar', () => svc.guardarConfigSubs({ raio_padrao_m: 200 }), { p_cfg: { raio_padrao_m: 200 } }],
    ['obra_orcamento_apagar_item', () => svc.apagarItemOrcamento('i1'), { p_id: 'i1' }],
    ['obra_orcamento_resumo', () => svc.resumoOrcamento('o1'), { p_obra_id: 'o1' }],
    ['sub_doc_remover', () => svc.removerDocSub('d1'), { p_id: 'd1' }],
    ['sub_docs_estado', () => svc.estadoDocsSub('s1'), { p_sub_id: 's1' }],
    ['auto_apagar_evidencia', () => svc.apagarEvidencia('e1'), { p_id: 'e1' }],
    ['auto_evidencias_lista', () => svc.listarEvidenciasAuto('a1'), { p_auto_id: 'a1' }],
    ['auto_submeter', () => svc.submeterAuto('a1'), { p_auto_id: 'a1' }],
    ['auto_iniciar_verificacao', () => svc.iniciarVerificacao('a1'), { p_auto_id: 'a1' }],
    ['auto_registar_verificacao', () => svc.registarVerificacao('a1', [{ ordem: 1, resultado: 'conforme', observacao: null }]), { p_auto_id: 'a1', p_itens: [{ ordem: 1, resultado: 'conforme', observacao: null }] }],
    ['auto_verificar', () => svc.verificarAuto('a1'), { p_auto_id: 'a1', p_excecao_motivo: null }],
    ['auto_levantar_glosa', () => svc.levantarGlosa('g1', 'Corrigido'), { p_glosa_id: 'g1', p_motivo: 'Corrigido' }],
    ['auto_devolver', () => svc.devolverAuto('a1', 'Faltam fotos'), { p_auto_id: 'a1', p_motivo: 'Faltam fotos' }],
    ['auto_aprovar', () => svc.aprovarAuto('a1'), { p_auto_id: 'a1', p_excecao_docs_motivo: null }],
    ['validar_auto', () => svc.validarAutoLegado('a1'), { p_id: 'a1' }],
    ['marcar_auto_pago', () => svc.pagarAuto('a1'), { p_auto_id: 'a1', p_referencia: null, p_excecao_motivo: null }],
    ['marcar_auto_em_atraso', () => svc.marcarAutoEmAtrasoRpc('a1'), { p_auto_id: 'a1' }],
    ['subs_painel_ceo', () => svc.buscarPainelCeo(null), { p_obra_id: null }],
    ['subs_fluxo_caixa', () => svc.listarFluxoCaixa('o1'), { p_obra_id: 'o1', p_semanas: 12 }],
  ] as const)('%s', async (nome, chamar, args) => {
    ok(nome === 'subs_config_ler' ? {} : [])
    await chamar()
    if (nome === 'subs_config_ler') expect(rpc).toHaveBeenCalledWith(nome)
    else expect(rpc).toHaveBeenCalledWith(nome, args)
  })

  it.each([
    () => svc.lerConfigSubs(), () => svc.guardarConfigSubs({}), () => svc.guardarItemOrcamento({
      p_obra_id: 'o', p_id: null, p_codigo: '01', p_descricao: 'd', p_unidade: 'm2', p_quantidade: 1, p_preco_unitario: 1, p_tolerancia_pct: 0,
    }),
    () => svc.apagarItemOrcamento('i'), () => svc.resumoOrcamento('o'), () => svc.registarDocSub({ subId: 's', tipo: 'CERT_SS', referencia: null, emitidoEm: null, validade: null, path: 'p', nome: null }),
    () => svc.removerDocSub('d'), () => svc.estadoDocsSub('s'), () => svc.apagarEvidencia('e'), () => svc.listarEvidenciasAuto('a'),
    () => svc.submeterAuto('a'), () => svc.iniciarVerificacao('a'), () => svc.registarVerificacao('a', []), () => svc.verificarAuto('a', 'motivo longo'),
    () => svc.levantarGlosa('g', 'm'), () => svc.devolverAuto('a', 'm'), () => svc.aprovarAuto('a'), () => svc.validarAutoLegado('a'),
    () => svc.pagarAuto('a'), () => svc.marcarAutoEmAtrasoRpc('a'), () => svc.buscarPainelCeo('o'), () => svc.listarFluxoCaixa(null),
    () => svc.libertarRetencao({ subId: 's', valor: 1, motivo: 'outro', obs: null }),
    () => svc.glosarAuto({ p_auto_id: 'a', p_motivo: 'OUTRO', p_descricao: 'd', p_valor: 1, p_linha_id: null, p_ocorrencia_id: null }),
    () => svc.registarEvidencia({ p_auto_id: 'a', p_path: 'p', p_legenda: null, p_lat: 1, p_lon: 1, p_precisao_m: 5, p_tirada_em: 'x', p_hash: 'h', p_linha_id: null }),
    () => svc.registarFaturaAuto({ autoId: 'a', numero: '1', data: '2026-10-01', valor: 1, path: 'p', nome: null }),
    () => svc.criarAutoRpc({ subId: 's', data: '2026-10-01', percentagem: 0, valor: 1 }),
  ])('propaga o erro do servidor (%#)', async chamar => {
    falha('Excede o orçamento de controlo em 02.03')
    await expect(chamar()).rejects.toThrow('Excede o orçamento de controlo em 02.03')
  })
})

describe('RPCs com retorno', () => {
  it('guarda item do orçamento e devolve o id', async () => {
    ok('item-1')
    const args = { p_obra_id: 'o', p_id: null, p_codigo: '02.03', p_descricao: 'Betão', p_unidade: 'm3', p_quantidade: 10, p_preco_unitario: 90, p_tolerancia_pct: 5 }
    expect(await svc.guardarItemOrcamento(args)).toBe('item-1')
    expect(rpc).toHaveBeenCalledWith('obra_orcamento_guardar_item', args)
  })
  it('regista documento com os parâmetros do desenho', async () => {
    ok('doc-1')
    expect(await svc.registarDocSub({ subId: 's1', tipo: 'ALVARA', referencia: 'R', emitidoEm: '2026-01-01', validade: '2027-01-01', path: 's1/doc-1.pdf', nome: 'alvara.pdf' })).toBe('doc-1')
    expect(rpc).toHaveBeenCalledWith('sub_doc_registar', {
      p_sub_id: 's1', p_tipo: 'ALVARA', p_referencia: 'R', p_emitido_em: '2026-01-01', p_validade: '2027-01-01', p_path: 's1/doc-1.pdf', p_nome: 'alvara.pdf',
    })
  })
  it('regista evidência e devolve o resultado do servidor', async () => {
    const res = { id: 'e1', valida: false, dentro_obra: false, distancia_m: 520.5, precisao_ok: true, motivo: 'fora_do_raio' }
    ok(res)
    const args = { p_auto_id: 'a1', p_path: 'o/autos/1-a.jpg', p_legenda: null, p_lat: 38.7, p_lon: -9.1, p_precisao_m: 12, p_tirada_em: '2026-10-04T10:00:00Z', p_hash: 'abc', p_linha_id: null }
    expect(await svc.registarEvidencia(args)).toEqual(res)
    expect(rpc).toHaveBeenCalledWith('auto_registar_evidencia', args)
  })
  it('verificar e aprovar com exceção de admin', async () => {
    ok(); ok()
    await svc.verificarAuto('a1', 'Fotos indisponíveis por avaria')
    await svc.aprovarAuto('a1', 'Certidão em renovação')
    expect(rpc).toHaveBeenNthCalledWith(1, 'auto_verificar', { p_auto_id: 'a1', p_excecao_motivo: 'Fotos indisponíveis por avaria' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'auto_aprovar', { p_auto_id: 'a1', p_excecao_docs_motivo: 'Certidão em renovação' })
  })
  it('glosa devolve o id', async () => {
    ok('g1')
    const args = { p_auto_id: 'a1', p_motivo: 'QUALIDADE' as const, p_descricao: 'Fissuras', p_valor: 120, p_linha_id: null, p_ocorrencia_id: 'oc1' }
    expect(await svc.glosarAuto(args)).toBe('g1')
    expect(rpc).toHaveBeenCalledWith('auto_glosar', args)
  })
  it('guarda a fatura do subempreiteiro (com ficheiro)', async () => {
    ok()
    await svc.registarFaturaAuto({ autoId: 'a1', numero: 'FT 1/2026', data: '2026-10-02', valor: 855, path: 's1/fatura-1.pdf', nome: 'ft.pdf' })
    expect(rpc).toHaveBeenCalledWith('auto_registar_fatura', { p_auto_id: 'a1', p_numero: 'FT 1/2026', p_data: '2026-10-02', p_valor: 855, p_path: 's1/fatura-1.pdf', p_nome: 'ft.pdf' })
  })
  it('paga com referência e exceção', async () => {
    ok()
    await svc.pagarAuto('a1', 'TRF-9', 'Certidão em renovação')
    expect(rpc).toHaveBeenCalledWith('marcar_auto_pago', { p_auto_id: 'a1', p_referencia: 'TRF-9', p_excecao_motivo: 'Certidão em renovação' })
  })
  it('cria auto pela RPC legada e devolve a primeira linha', async () => {
    ok([{ id: 'a1', numero: 3 }])
    expect(await svc.criarAutoRpc({ subId: 's1', data: '2026-10-01', percentagem: 10, valor: 2000, notas: 'n' })).toEqual({ id: 'a1', numero: 3 })
    expect(rpc).toHaveBeenCalledWith('criar_auto_rpc', { p_sub_id: 's1', p_data: '2026-10-01', p_percentagem: 10, p_valor: 2000, p_notas: 'n' })
  })
  it('criar auto sem linha de retorno falha', async () => {
    ok([])
    await expect(svc.criarAutoRpc({ subId: 's1', data: '2026-10-01', percentagem: 0, valor: 1 })).rejects.toThrow('Não foi possível criar o auto.')
  })
  it('liberta retenção', async () => {
    ok('lib-1')
    expect(await svc.libertarRetencao({ subId: 's1', valor: 500, motivo: 'conclusao_obra', obs: null })).toBe('lib-1')
    expect(rpc).toHaveBeenCalledWith('sub_libertar_retencao', { p_sub_id: 's1', p_valor: 500, p_motivo: 'conclusao_obra', p_obs: null })
  })
  it('listas devolvem [] quando o servidor devolve null', async () => {
    ok(null); ok(null); ok(null); ok(null)
    expect(await svc.resumoOrcamento('o')).toEqual([])
    expect(await svc.estadoDocsSub('s')).toEqual([])
    expect(await svc.listarEvidenciasAuto('a')).toEqual([])
    expect(await svc.listarFluxoCaixa(null)).toEqual([])
  })
})

describe('leituras de tabela', () => {
  function cadeia(resultado: { data: unknown; error: unknown }) {
    const c = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
    c.select.mockReturnValue(c); c.eq.mockReturnValue(c); c.order.mockResolvedValue(resultado)
    from.mockReturnValueOnce(c as never)
    return c
  }
  it.each([
    ['obra_orcamento_itens', 'obra_id', () => svc.listarItensOrcamento('x')],
    ['sub_documentos', 'subempreiteiro_id', () => svc.listarDocsSub('x')],
    ['auto_verificacoes', 'auto_id', () => svc.listarVerificacoes('x')],
    ['auto_glosas', 'auto_id', () => svc.listarGlosasAuto('x')],
  ] as const)('%s filtra por %s', async (tabela, coluna, chamar) => {
    const c = cadeia({ data: [], error: null })
    expect(await chamar()).toEqual([])
    expect(from).toHaveBeenCalledWith(tabela)
    expect(c.eq).toHaveBeenCalledWith(coluna, 'x')
  })
  it('propaga erros de leitura', async () => {
    cadeia({ data: null, error: new Error('sem acesso') })
    await expect(svc.listarGlosasAuto('x')).rejects.toThrow('sem acesso')
  })
})

describe('hooks: invalidação de cache', () => {
  it('aprovar invalida o painel, o fluxo de caixa, o orçamento e os autos', async () => {
    const spy = vi.spyOn(asyncLib, 'invalidateCache')
    ok()
    const { result } = renderHook(() => useAprovarAuto())
    let r: boolean | undefined
    await act(async () => { r = await result.current.aprovar('a1') })
    expect(r).toBe(true)
    const chaves = spy.mock.calls[0]
    for (const k of ['auto-*', 'sub-painel-*', 'subs-resumo-*', 'subs-ceo-*', 'subs-fluxo-*', 'orcamento-*', 'sub-docs-*']) expect(chaves).toContain(k)
  })
  it('aprovar devolve false e expõe o erro do servidor, sem invalidar', async () => {
    const spy = vi.spyOn(asyncLib, 'invalidateCache')
    falha('Só o administrador pode aprovar este auto.')
    const { result } = renderHook(() => useAprovarAuto())
    let r: boolean | undefined
    await act(async () => { r = await result.current.aprovar('a1') })
    expect(r).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(result.current.error).toContain('administrador')
  })
  it('guardar configuração invalida config e painéis', async () => {
    const spy = vi.spyOn(asyncLib, 'invalidateCache')
    ok()
    const { result } = renderHook(() => useGuardarConfigSubs())
    await act(async () => { await result.current.guardar({ prazo_pagamento_dias: 45 }) })
    expect(spy.mock.calls[0]).toEqual(expect.arrayContaining(['subs-config', 'subs-ceo-*', 'subs-fluxo-*']))
  })
  it('libertar retenção invalida o painel do subempreiteiro', async () => {
    const spy = vi.spyOn(asyncLib, 'invalidateCache')
    ok('lib-1')
    const { result } = renderHook(() => useLibertarRetencao())
    const id = await act(async () => result.current.libertar({ subId: 's1', valor: 10, motivo: 'outro', obs: null }))
    expect(id).toBe('lib-1')
    expect(spy.mock.calls[0]).toContain('sub-painel-*')
  })
})
