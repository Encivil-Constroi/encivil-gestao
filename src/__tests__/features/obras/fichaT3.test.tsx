import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { obraFixture } from './obrasFixtures'

const state = vi.hoisted(() => ({
  role: 'gestor',
  uploading: false,
  autorDesignado: false,
  visao: null as unknown,
  fases: [] as unknown[], afericoes: [] as unknown[], fotos: [] as unknown[], eventos: [] as unknown[], relatorios: [] as unknown[],
  guardarFase: vi.fn().mockResolvedValue('fase-1'), apagarFase: vi.fn().mockResolvedValue(undefined),
  registarAfericao: vi.fn().mockResolvedValue('afericao-1'), adicionarFotos: vi.fn().mockResolvedValue(1),
}))
vi.mock('@/features/auth/useRole', () => ({ useRole: () => ({ role: state.role }) }))
vi.mock('@/features/obras/hooks/useObras', () => ({ useVisaoObra: () => ({ visao: state.visao, loading: false, error: null }) }))
vi.mock('@/features/obras/hooks/useFichaObra', () => ({
  useFasesObra: () => ({ fases: state.fases, loading: false, error: null, reload: vi.fn() }),
  useAfericoesObra: () => ({ afericoes: state.afericoes, loading: false, error: null, reload: vi.fn() }),
  useFotosObra: () => ({ fotos: state.fotos, loading: false, error: null, reload: vi.fn() }),
  useEventosObra: () => ({ eventos: state.eventos, loading: false, error: null, reload: vi.fn() }),
  useUltimosRelatoriosObra: () => ({ relatorios: state.relatorios, loading: false, error: null, reload: vi.fn() }),
  useGuardarFase: () => ({ guardar: state.guardarFase, loading: false, error: null }),
  useApagarFase: () => ({ apagar: state.apagarFase, loading: false, error: null }),
  useRegistarAfericao: () => ({ registar: state.registarAfericao, loading: false, error: null }),
  useAdicionarFotos: () => ({ adicionar: state.adicionarFotos, loading: false, error: null }),
  usePermissaoFotosObra: () => ({ podeAdicionar: ['admin', 'gestor', 'medicoes'].includes(state.role) || state.autorDesignado }),
}))
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: ({ onUploadingChange }: { onUploadingChange?: (v: boolean) => void }) => <button type="button" onClick={() => onUploadingChange?.(true)}>Escolher fotografias</button> }))
vi.mock('@/features/obras/components/FotosGaleria', () => ({ FotosGaleria: ({ fotos }: { fotos: { path: string }[] }) => <span>{fotos.map(f => f.path).join(', ')}</span> }))
vi.mock('@/features/obras/components/MapaObra', () => ({ MapaObra: () => <a href="/maps/dir">Navegar</a> }))

import { Resumo } from '@/features/obras/components/ficha/Resumo'
import { Progresso } from '@/features/obras/components/ficha/Progresso'
import { Fotos } from '@/features/obras/components/ficha/Fotos'
import { Atividade } from '@/features/obras/components/ficha/Atividade'

const mostrar = (elemento: React.ReactNode) => render(<MemoryRouter>{elemento}</MemoryRouter>)
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Ficha de obra T3', () => {
  it('aguarda o upload antes de registar uma aferição', () => {
    state.role = 'medicoes'
    mostrar(<Progresso obraId="obra-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova aferição' }))
    fireEvent.change(screen.getByLabelText('Resumo dos trabalhos'), { target: { value: 'Trabalhos verificados' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escolher fotografias' }))
    expect(screen.getByRole('button', { name: 'Registar aferição' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })
  it('resume saúde, progresso, orçamento e acesso às secções e ações', () => {
    state.visao = obraFixture({ saude: 'critico', motivos: ['Prazo ultrapassado'], progresso_pct: 35, progresso_esperado_pct: 70, orcamento: 100000, custo_total: 95000, cliente: 'Cliente A', responsavel_nome: 'Responsável A', engenheiro_nome: 'Engenheira A' })
    mostrar(<Resumo obraId="obra-1" />)
    expect(screen.getByText('Prazo ultrapassado')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getByText('Previsto: 70%')).toBeInTheDocument()
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Relatório diário/ })).toHaveAttribute('href', '/obras/obra-1/relatorio-diario/novo')
    expect(screen.getByRole('link', { name: 'Nova aferição' })).toHaveAttribute('href', '/obras/obra-1?sec=progresso')
    expect(screen.getByRole('link', { name: 'Adicionar foto' })).toHaveAttribute('href', '/obras/obra-1?sec=fotos')
  })

  it('permite criar fase e aferição, mas oculta escrita para leitura', async () => {
    state.role = 'medicoes'
    state.fases = []
    state.afericoes = []
    mostrar(<Progresso obraId="obra-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova fase' }))
    fireEvent.change(screen.getByLabelText('Nome da fase'), { target: { value: 'Fundação' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fase' }))
    await waitFor(() => expect(state.guardarFase).toHaveBeenCalledWith(expect.objectContaining({ p_nome: 'Fundação', p_obra_id: 'obra-1' })))
    fireEvent.click(screen.getByRole('button', { name: 'Nova aferição' }))
    fireEvent.change(screen.getByLabelText('Resumo dos trabalhos'), { target: { value: 'Laje concluída' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registar aferição' }))
    await waitFor(() => expect(state.registarAfericao).toHaveBeenCalledWith(expect.objectContaining({ p_resumo: 'Laje concluída', p_obra_id: 'obra-1' })))
    cleanup()
    state.role = 'leitura'
    mostrar(<Progresso obraId="obra-1" />)
    expect(screen.queryByRole('button', { name: 'Nova fase' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova aferição' })).not.toBeInTheDocument()
  })

  it('filtra as fotos por origem e mostra atividade cronológica', () => {
    state.fotos = [
      { obra_id: 'obra-1', path: 'avulsa.jpg', legenda: null, data: '2026-09-01', origem: 'GALERIA', ref_id: '1', autor_id: null },
      { obra_id: 'obra-1', path: 'afericao.jpg', legenda: null, data: '2026-09-02', origem: 'AFERICAO', ref_id: '2', autor_id: null },
    ]
    state.eventos = [{ id: '1', tipo: 'afericao', titulo: 'Aferição registada', detalhe: 'Laje', autor_nome: 'Ana', criado_em: '2026-09-02T10:00:00Z' }]
    mostrar(<><Fotos obraId="obra-1" /><Atividade obraId="obra-1" /></>)
    fireEvent.change(screen.getByLabelText('Origem das fotos'), { target: { value: 'AFERICAO' } })
    expect(screen.getByText('afericao.jpg')).toBeInTheDocument()
    expect(screen.queryByText('avulsa.jpg')).not.toBeInTheDocument()
    expect(screen.getByText('Aferição registada')).toBeInTheDocument()
    expect(screen.getByText('Laje')).toBeInTheDocument()
  })

  it('permite a um autor designado adicionar fotos e oculta a ação dos restantes leitores', () => {
    state.role = 'leitura'
    state.autorDesignado = true
    const primeira = mostrar(<Fotos obraId="obra-1" />)
    expect(screen.getByRole('button', { name: 'Adicionar fotos' })).toBeInTheDocument()
    primeira.unmount()
    state.autorDesignado = false
    mostrar(<Fotos obraId="obra-1" />)
    expect(screen.queryByRole('button', { name: 'Adicionar fotos' })).not.toBeInTheDocument()
  })
})
