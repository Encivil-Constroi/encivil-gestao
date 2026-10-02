import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { OrcamentoItemRow, OrcamentoResumoRow, SubDocEstadoRow, SubDocumentoRow, SubsConfigRow } from '@/features/obras/db'

const resumoBase: OrcamentoResumoRow = {
  item_id: 'i1', codigo: '02.03', descricao: 'Reboco', unidade: 'm²', orcado_qtd: 100, orcado_valor: 1000,
  contratado_qtd: 50, contratado_valor: 500, medido_qtd: 10, medido_valor: 100, saldo_qtd: 50, saldo_valor: 500,
  perc_contratado: 50, perc_medido: 10, n_artigos: 1, estado: 'ok',
}

const st = vi.hoisted(() => ({
  role: 'gestor',
  resumo: [] as unknown[],
  itens: [] as unknown[],
  estados: [] as unknown[],
  docs: [] as unknown[],
  config: null as unknown,
  guardarItem: vi.fn().mockResolvedValue('i9'),
  apagarItem: vi.fn().mockResolvedValue(true),
  registarDoc: vi.fn().mockResolvedValue('d1'),
  removerDoc: vi.fn().mockResolvedValue(true),
  guardarCfg: vi.fn().mockResolvedValue(true),
  upload: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: st.role, isAdmin: st.role === 'admin',
    podeObras: ['admin', 'gestor'].includes(st.role),
    podeSubempreitadas: ['admin', 'gestor', 'medicoes'].includes(st.role),
  }),
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => undefined, from: () => undefined, storage: { from: () => ({ upload: st.upload }) } } }))
vi.mock('@/features/obras/lib/fotosObras', () => ({ urlAssinadaContrato: vi.fn().mockResolvedValue('https://x/y') }))
vi.mock('@/features/obras/hooks/useSubsControlo', () => ({
  useResumoOrcamento: () => ({ resumo: st.resumo, loading: false, error: null, reload: vi.fn() }),
  useItensOrcamento: () => ({ itens: st.itens, loading: false, error: null, reload: vi.fn() }),
  useGuardarItemOrcamento: () => ({ guardar: st.guardarItem, loading: false, error: null }),
  useApagarItemOrcamento: () => ({ apagar: st.apagarItem, loading: false, error: null }),
  useEstadoDocsSub: () => ({ estados: st.estados, loading: false, error: null, reload: vi.fn() }),
  useDocsSub: () => ({ documentos: st.docs, loading: false, error: null, reload: vi.fn() }),
  useRegistarDocSub: () => ({ registar: st.registarDoc, loading: false, error: null }),
  useRemoverDocSub: () => ({ remover: st.removerDoc, loading: false, error: null }),
  useConfigSubs: () => ({ config: st.config, loading: false, error: null, reload: vi.fn() }),
  useGuardarConfigSubs: () => ({ guardar: st.guardarCfg, loading: false, error: null }),
}))

import { Orcamento, agruparPorCapitulo } from '@/features/obras/components/ficha/Orcamento'
import { SubDocumentos, caminhoDocumento } from '@/features/obras/components/subempreitadas/SubDocumentos'
import { ConfigSubsDialog } from '@/features/obras/components/subempreitadas/ConfigSubsDialog'
import { avisosExcesso } from '@/features/obras/components/subempreitadas/SubempreiteiroFormPage'

const mostrar = (e: React.ReactNode) => render(<MemoryRouter>{e}</MemoryRouter>)
afterEach(() => { cleanup(); vi.clearAllMocks(); st.role = 'gestor' })

describe('Orcamento', () => {
  it('agrupa por capítulo e mostra selos com texto', () => {
    st.resumo = [resumoBase, { ...resumoBase, item_id: 'i2', codigo: '03.01', estado: 'excedido' }]
    const grupos = agruparPorCapitulo(st.resumo as OrcamentoResumoRow[])
    expect(grupos.map(g => g.capitulo)).toEqual(['02', '03'])
    mostrar(<Orcamento obraId="o1" />)
    expect(screen.getByText('Capítulo 02')).toBeInTheDocument()
    expect(screen.getByText('Excedido')).toBeInTheDocument()
    expect(screen.getByText('Dentro do orçamento')).toBeInTheDocument()
  })

  it('gestor cria item; leitura não vê ações', async () => {
    st.resumo = []
    mostrar(<Orcamento obraId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Novo item' }))
    fireEvent.change(screen.getByLabelText('Código EAP'), { target: { value: '01.01' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Escavação' } })
    fireEvent.change(screen.getByLabelText('Quantidade orçada'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Preço unitário orçado (€)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar item' }))
    await waitFor(() => expect(st.guardarItem).toHaveBeenCalledWith(expect.objectContaining({ p_obra_id: 'o1', p_id: null, p_codigo: '01.01', p_quantidade: 10 })))
    cleanup()
    st.role = 'leitura'
    mostrar(<Orcamento obraId="o1" />)
    expect(screen.queryByRole('button', { name: 'Novo item' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Configuração/ })).toBeNull()
  })

  it('apagar pede confirmação', async () => {
    st.resumo = [resumoBase]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostrar(<Orcamento obraId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Apagar 02.03' }))
    await waitFor(() => expect(st.apagarItem).toHaveBeenCalledWith('i1'))
  })

  it('só o admin vê o botão de configuração', () => {
    st.resumo = []
    st.role = 'admin'
    mostrar(<Orcamento obraId="o1" />)
    expect(screen.getByRole('button', { name: /Configuração/ })).toBeInTheDocument()
  })
})

describe('avisosExcesso', () => {
  const itens = [{ id: 'i1', tolerancia_pct: 10 }] as OrcamentoItemRow[]
  it('avisa quando contratado + linhas passa o limite com tolerância', () => {
    expect(avisosExcesso([{ itemId: 'i1', plannedQuantity: '60' }], [resumoBase], itens)).toHaveLength(0)
    const a = avisosExcesso([{ itemId: 'i1', plannedQuantity: '30' }, { itemId: 'i1', plannedQuantity: '31' }], [resumoBase], itens)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ codigo: '02.03', contratado: 111, orcado: 100 })
  })
  it('ignora linhas sem item', () => {
    expect(avisosExcesso([{ itemId: '', plannedQuantity: '999' }], [resumoBase], itens)).toEqual([])
  })
})

describe('SubDocumentos', () => {
  const estados: SubDocEstadoRow[] = [
    { tipo: 'CERT_SS', obrigatorio: true, estado: 'ok', validade: '2027-01-01', dias_restantes: 90, doc_id: 'd1', referencia: 'A1' },
    { tipo: 'CERT_AT', obrigatorio: true, estado: 'em_falta', validade: null, dias_restantes: null, doc_id: null, referencia: null },
    { tipo: 'SEGURO_AT', obrigatorio: true, estado: 'expirado', validade: '2026-01-01', dias_restantes: -5, doc_id: null, referencia: null },
  ]
  const doc: SubDocumentoRow = { id: 'd1', subempreiteiro_id: 's1', tipo: 'CERT_SS', referencia: 'A1', emitido_em: null, validade: '2027-01-01', path: 's1/doc-1.pdf', nome: 'cert.pdf', criado_por: null, criado_em: '2026-01-01T10:00:00Z' }

  it('mostra selos com texto por estado', () => {
    st.estados = estados; st.docs = [doc]
    mostrar(<SubDocumentos subId="s1" />)
    expect(screen.getByText('Em dia')).toBeInTheDocument()
    expect(screen.getByText('Em falta')).toBeInTheDocument()
    expect(screen.getByText('Expirado')).toBeInTheDocument()
  })

  it('caminho segue o padrão do bucket', () => {
    expect(caminhoDocumento('s1', 'application/pdf', 5)).toBe('s1/doc-5.pdf')
    expect(caminhoDocumento('s1', 'text/plain', 5)).toBeNull()
  })

  it('carrega o ficheiro e regista o documento', async () => {
    st.estados = []; st.docs = []
    mostrar(<SubDocumentos subId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Carregar documento' }))
    const file = new File(['x'], 'seguro.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Ficheiro/), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar documento' }))
    await waitFor(() => expect(st.registarDoc).toHaveBeenCalled())
    expect(st.upload).toHaveBeenCalledWith(expect.stringMatching(/^s1\/doc-\d+\.pdf$/), file, expect.anything())
    expect(st.registarDoc.mock.calls[0][0]).toMatchObject({ subId: 's1', tipo: 'CERT_SS', nome: 'seguro.pdf' })
  })

  it('formato inválido não envia', async () => {
    st.estados = []; st.docs = []
    mostrar(<SubDocumentos subId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Carregar documento' }))
    fireEvent.change(screen.getByLabelText(/Ficheiro/), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar documento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Formato não suportado')
    expect(st.upload).not.toHaveBeenCalled()
  })

  it('só gestor/admin removem; leitura não carrega', async () => {
    st.estados = estados; st.docs = [doc]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = mostrar(<SubDocumentos subId="s1" />)
    fireEvent.click(container.querySelector('summary')!)
    fireEvent.click(screen.getByRole('button', { name: 'Remover cert.pdf' }))
    await waitFor(() => expect(st.removerDoc).toHaveBeenCalledWith('d1'))
    cleanup()
    st.role = 'leitura'
    mostrar(<SubDocumentos subId="s1" />)
    expect(screen.queryByRole('button', { name: 'Carregar documento' })).toBeNull()
  })
})

describe('ConfigSubsDialog', () => {
  const cfg: SubsConfigRow = {
    id: true, retencao_padrao_pct: 5, prazo_pagamento_dias: 30, alcada_gestor_ate: 10000, docs_obrigatorios: ['CERT_SS'],
    bloquear_pagamento_sem_docs: true, exigir_fatura_para_pagar: true, aviso_validade_dias: 30, raio_padrao_m: 300,
    precisao_max_m: 50, foto_idade_max_min: 120, min_fotos_verificacao: 2, checklist_padrao: ['Um', { item: 'Dois' }],
    atualizado_em: '2026-01-01', atualizado_por: null,
  }
  it('não renderiza para não admin', () => {
    st.config = cfg
    mostrar(<ConfigSubsDialog aberto onFechar={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('admin guarda a configuração', async () => {
    st.role = 'admin'; st.config = cfg
    const fechar = vi.fn()
    mostrar(<ConfigSubsDialog aberto onFechar={fechar} />)
    fireEvent.change(screen.getByLabelText('Prazo de pagamento (dias)'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuração' }))
    await waitFor(() => expect(st.guardarCfg).toHaveBeenCalled())
    expect(st.guardarCfg.mock.calls[0][0]).toMatchObject({ prazo_pagamento_dias: 45, docs_obrigatorios: ['CERT_SS'], checklist_padrao: ['Um', 'Dois'] })
    expect(fechar).toHaveBeenCalled()
  })
  it('rejeita valores fora do intervalo', async () => {
    st.role = 'admin'; st.config = cfg
    mostrar(<ConfigSubsDialog aberto onFechar={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Retenção de garantia padrão (%)'), { target: { value: '150' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar configuração' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Retenção')
    expect(st.guardarCfg).not.toHaveBeenCalled()
  })
})
