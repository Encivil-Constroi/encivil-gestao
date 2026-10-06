import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { AutoEvidenciaRow, AutoGlosaRow, AutoVerificacaoRow, SubDocEstadoRow, WorkflowAuto } from '@/features/obras/db'

type Linha = { id: string; autoId: string; itemId?: string; description: string; unit: string; unitPrice: number; quantity: number; isExtra: boolean }

const estado = vi.hoisted(() => ({
  role: 'medicoes' as string | null,
  auto: null as null | Record<string, unknown>,
  autos: [] as Record<string, unknown>[],
  sub: null as null | Record<string, unknown>,
  linhasDb: [] as { id: string; auto_id: string; artigo_id: string | null; quantidade: number; qtd_pedida: number | null; justificacao: string | null }[],
  config: null as null | Record<string, unknown>,
  evidencias: [] as AutoEvidenciaRow[],
  verificacoes: [] as AutoVerificacaoRow[],
  glosas: [] as AutoGlosaRow[],
  docs: [] as SubDocEstadoRow[],
  ocorrenciasAltas: 0,
  erroSubmeter: null as string | null,
  submeter: vi.fn(), devolver: vi.fn(), aprovar: vi.fn(), eliminar: vi.fn(),
  registarEvidencia: vi.fn(), apagarEvidencia: vi.fn(),
  iniciar: vi.fn(), registarVerificacao: vi.fn(), verificar: vi.fn(),
  glosar: vi.fn(), levantar: vi.fn(), registarFatura: vi.fn(), pagar: vi.fn(), marcarAtraso: vi.fn(),
  criar: vi.fn(), atualizar: vi.fn(), guardarLinhas: vi.fn(), guardarEvidencias: vi.fn(),
  obterGps: vi.fn(), prepararEvidencia: vi.fn(), enviarEvidencia: vi.fn(), enviarFatura: vi.fn(), urlAssinadaFatura: vi.fn(),
  navigate: vi.fn(), toastErro: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: estado.toastErro } }))
vi.mock('react-router', async importOriginal => ({ ...(await importOriginal<typeof import('react-router')>()), useNavigate: () => estado.navigate }))
vi.mock('@/features/auth/useRole', () => ({
  useRole: () => ({
    role: estado.role, isAdmin: estado.role === 'admin', isGestor: estado.role === 'gestor',
    podeSubempreitadas: ['admin', 'gestor', 'medicoes'].includes(estado.role ?? ''),
  }),
}))
vi.mock('@/features/obras/hooks/useSubsControlo', () => ({
  useConfigSubs: () => ({ config: estado.config }),
  useEvidenciasAutoLista: () => ({ evidencias: estado.evidencias, loading: false, error: null }),
  useVerificacoesAuto: () => ({ itens: estado.verificacoes, loading: false, error: null }),
  useEstadoDocsSub: () => ({ estados: estado.docs }),
  useGlosasAuto: () => ({ glosas: estado.glosas, loading: false, error: null }),
  useSubmeterAuto: () => ({ submeter: estado.submeter, loading: false, error: estado.erroSubmeter }),
  useDevolverAuto: () => ({ devolver: estado.devolver, loading: false, error: null }),
  useAprovarAuto: () => ({ aprovar: estado.aprovar, loading: false, error: null }),
  useRegistarEvidencia: () => ({ registar: estado.registarEvidencia, loading: false, error: null }),
  useApagarEvidencia: () => ({ apagar: estado.apagarEvidencia, loading: false, error: null }),
  useIniciarVerificacao: () => ({ iniciar: estado.iniciar, loading: false, error: null }),
  useRegistarVerificacao: () => ({ registar: estado.registarVerificacao, loading: false, error: null }),
  useVerificarAuto: () => ({ verificar: estado.verificar, loading: false, error: null }),
  useGlosarAuto: () => ({ glosar: estado.glosar, loading: false, error: null }),
  useLevantarGlosa: () => ({ levantar: estado.levantar, loading: false, error: null }),
  useRegistarFaturaAuto: () => ({ registar: estado.registarFatura, loading: false, error: null }),
  usePagarAuto: () => ({ pagar: estado.pagar, loading: false, error: null }),
  useMarcarAutoEmAtraso: () => ({ marcar: estado.marcarAtraso, loading: false, error: null }),
}))
vi.mock('@/features/obras/legacy/useAutos', () => ({
  useAuto: () => ({ auto: estado.auto, loading: false }),
  useAutos: () => ({ autos: estado.autos }),
  useEliminarAuto: () => ({ eliminar: estado.eliminar, loading: false }),
  useGuardarAuto: () => ({ criar: estado.criar, atualizar: estado.atualizar, loading: false, error: null }),
}))
vi.mock('@/features/obras/legacy/useSubempreiteiros', () => ({ useSubempreiteiro: () => ({ sub: estado.sub, loading: false }) }))
vi.mock('@/features/obras/components/subempreitadas/useSubData', () => ({
  usePainelSub: () => ({ painel: { ocorrencias_abertas: { baixa: 0, media: 0, alta: estado.ocorrenciasAltas } } }),
  useEvidenciasAuto: () => ({ evidencias: null }),
  useGuardarEvidencias: () => ({ guardar: estado.guardarEvidencias, loading: false }),
}))
vi.mock('@/features/obras/components/subempreitadas/AutoEvidenciasView', () => ({ AutoEvidenciasView: () => null }))
vi.mock('@/features/obras/components/FotoCapture', () => ({ FotoCapture: () => null }))
vi.mock('@/features/obras/lib/fotosObras', () => ({ urlFotoObra: (p: string) => `https://x/${p}`, caminhoFotoObra: vi.fn() }))
vi.mock('@/features/obras/lib/autoDados', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/obras/lib/autoDados')>()),
  useLinhasMedicao: () => ({ linhas: estado.linhasDb, loading: false, error: null }),
  useGuardarLinhasAuto: () => ({ guardar: estado.guardarLinhas, loading: false, error: null }),
  obterGps: estado.obterGps,
  prepararEvidencia: estado.prepararEvidencia,
  enviarEvidencia: estado.enviarEvidencia,
  enviarFatura: estado.enviarFatura,
  urlAssinadaFatura: estado.urlAssinadaFatura,
}))

import { AutoDetailPage } from '@/features/obras/components/subempreitadas/AutoDetailPage'
import { AutoFormPage } from '@/features/obras/components/subempreitadas/AutoFormPage'
import { EvidenciaCapture } from '@/features/obras/components/subempreitadas/auto/EvidenciaCapture'
import { AutoGlosas } from '@/features/obras/components/subempreitadas/auto/AutoGlosas'
import { AutoVerificacao } from '@/features/obras/components/subempreitadas/auto/AutoVerificacao'
import { AutoFaturaPagamento } from '@/features/obras/components/subempreitadas/auto/AutoFaturaPagamento'

const linha = (p: Partial<Linha> = {}): Linha => ({ id: 'l1', autoId: 'auto1', itemId: 'a1', description: 'Reboco', unit: 'm2', unitPrice: 10, quantity: 20, isExtra: false, ...p })

function fazerAuto(p: Record<string, unknown> = {}) {
  return {
    id: 'auto1', subcontractorId: 's1', number: 3, date: new Date('2026-09-30'), periodValue: 200, status: 'rascunho',
    workflow: 'rascunho', lines: [linha()], valorGlosado: 0, valorCertificado: 200, retencaoPercentagem: 5, valorRetido: 10,
    valorLiquido: 190, estadoPagamento: 'por_pagar', fatura: null, createdAt: new Date('2026-09-30'), ...p,
  }
}

const docEmFalta: SubDocEstadoRow = { tipo: 'CERT_SS', obrigatorio: true, estado: 'em_falta', validade: null, dias_restantes: null, doc_id: null, referencia: null }

function evid(p: Partial<AutoEvidenciaRow> = {}): AutoEvidenciaRow {
  return {
    id: 'e1', auto_id: 'auto1', linha_id: null, path: 'o1/autos/1-a.jpg', legenda: 'Parede norte', latitude: 38.7, longitude: -9.1,
    precisao_m: 8, tirada_em: '2026-10-02T09:00:00Z', enviada_em: '2026-10-02T09:01:00Z', hash_sha256: 'a'.repeat(64),
    distancia_obra_m: 35, dentro_obra: true, precisao_ok: true, valida: true, motivo_invalida: null, autor_id: 'u1', ...p,
  }
}

const verif = (ordem: number, item: string, resultado: AutoVerificacaoRow['resultado'] = 'pendente'): AutoVerificacaoRow =>
  ({ id: `v${ordem}`, auto_id: 'auto1', ordem, item, resultado, observacao: null, verificado_por: null, verificado_em: null })

const renderDetalhe = () => render(
  <MemoryRouter initialEntries={['/obras/auto/auto1']}><Routes><Route path="/obras/auto/:autoId" element={<AutoDetailPage />} /></Routes></MemoryRouter>,
)

beforeEach(() => {
  estado.role = 'medicoes'
  estado.auto = fazerAuto()
  estado.sub = {
    id: 's1', obraId: 'o1', name: 'Pladur Lda', obraName: 'Obra A', type: 'unitario', agreedValue: 1000, retencaoPercentagem: 5,
    items: [{ id: 'a1', subcontractorId: 's1', description: 'Reboco', unit: 'm2', unitPrice: 10, plannedQuantity: 100, isExtra: false }],
  }
  estado.autos = [
    fazerAuto({ id: 'auto0', workflow: 'validado', lines: [linha({ id: 'l0', autoId: 'auto0', quantity: 70 })] }),
    fazerAuto({ id: 'autoR', workflow: 'rascunho', lines: [linha({ id: 'lR', autoId: 'autoR', quantity: 50 })] }),
    estado.auto,
  ]
  estado.linhasDb = [{ id: 'l1', auto_id: 'auto1', artigo_id: 'a1', quantidade: 20, qtd_pedida: 25, justificacao: null }]
  estado.config = null
  estado.evidencias = []
  estado.verificacoes = []
  estado.glosas = []
  estado.docs = []
  estado.ocorrenciasAltas = 0
  estado.erroSubmeter = null
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AutoDetailPage — rascunho', () => {
  it('mostra Pedida/Verificada/Acumulada/Saldo, contando só autos que saíram do rascunho', () => {
    renderDetalhe()
    const tabela = screen.getByRole('table')
    for (const h of ['Pedida', 'Verificada', 'Acumulada', 'Saldo']) expect(within(tabela).getByText(h)).toBeInTheDocument()
    const celulas = within(tabela).getAllByRole('cell').map(c => c.textContent)
    expect(celulas).toEqual(expect.arrayContaining(['25', '20', '90', '10']))
  })

  it('submete o auto e mostra o erro do servidor tal como vem', async () => {
    estado.submeter.mockResolvedValue(true)
    estado.erroSubmeter = 'O contrato ainda não foi validado'
    renderDetalhe()
    fireEvent.click(screen.getByRole('button', { name: /Submeter para verificação/ }))
    expect(estado.submeter).toHaveBeenCalledWith('auto1')
    expect(screen.getByRole('alert')).toHaveTextContent('O contrato ainda não foi validado')
  })

  it('bloqueia a submissão quando o acumulado excede o contratado e explica porquê', () => {
    estado.auto = fazerAuto({ periodValue: 400, lines: [linha({ quantity: 40 })] })
    estado.linhasDb = [{ id: 'l1', auto_id: 'auto1', artigo_id: 'a1', quantidade: 40, qtd_pedida: null, justificacao: null }]
    renderDetalhe()
    expect(screen.getByRole('button', { name: /Submeter para verificação/ })).toBeDisabled()
    expect(screen.getByRole('list', { name: 'O que falta' })).toHaveTextContent('excede a prevista')
  })

  it('leitura não vê ações e percebe quem pode submeter', () => {
    estado.role = 'leitura'
    renderDetalhe()
    expect(screen.queryByRole('button', { name: /Submeter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tirar fotografia/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Só a equipa de medições/)).toBeInTheDocument()
  })

  it('trabalhos a mais sem justificação ficam assinalados', () => {
    estado.auto = fazerAuto({ periodValue: 250, lines: [linha(), linha({ id: 'x1', itemId: undefined, description: 'Furo extra', unitPrice: 50, quantity: 1, isExtra: true })] })
    renderDetalhe()
    expect(screen.getByText('Justificação: em falta')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'O que falta' })).toHaveTextContent('Trabalhos a mais exigem justificação')
  })
})

describe('AutoDetailPage — aprovação e devolução', () => {
  it('gestor não aprova autos com trabalhos a mais (alçada do administrador)', () => {
    estado.role = 'gestor'
    estado.auto = fazerAuto({ workflow: 'verificado', lines: [linha(), linha({ id: 'x1', itemId: undefined, isExtra: true, quantity: 1 })] })
    renderDetalhe()
    expect(screen.getByRole('button', { name: /Aprovar auto/ })).toBeDisabled()
    expect(screen.getByText(/só o administrador aprova/)).toBeInTheDocument()
  })

  it('gestor aprova dentro da alçada', async () => {
    estado.role = 'gestor'
    estado.aprovar.mockResolvedValue(true)
    estado.auto = fazerAuto({ workflow: 'verificado' })
    renderDetalhe()
    fireEvent.click(screen.getByRole('button', { name: /Aprovar auto/ }))
    await waitFor(() => expect(estado.aprovar).toHaveBeenCalledWith('auto1', null))
  })

  it('acima da alçada configurada só o admin', () => {
    estado.role = 'gestor'
    estado.config = { alcada_gestor_ate: 100, min_fotos_verificacao: 2, foto_idade_max_min: 120, exigir_fatura_para_pagar: true, bloquear_pagamento_sem_docs: true }
    estado.auto = fazerAuto({ workflow: 'verificado' })
    renderDetalhe()
    expect(screen.getByRole('button', { name: /Aprovar auto/ })).toBeDisabled()
  })

  it('admin aprova com exceção aos documentos só com motivo', async () => {
    estado.role = 'admin'
    estado.docs = [docEmFalta]
    estado.aprovar.mockResolvedValue(true)
    estado.auto = fazerAuto({ workflow: 'verificado' })
    renderDetalhe()
    fireEvent.change(screen.getByLabelText(/Motivo para aprovar sem os documentos/), { target: { value: 'amanhã' } })
    fireEvent.click(screen.getByRole('button', { name: /Aprovar com exceção/ }))
    expect(estado.aprovar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 10 caracteres')
    fireEvent.change(screen.getByLabelText(/Motivo para aprovar sem os documentos/), { target: { value: 'Certidão pedida, chega amanhã' } })
    fireEvent.click(screen.getByRole('button', { name: /Aprovar com exceção/ }))
    await waitFor(() => expect(estado.aprovar).toHaveBeenCalledWith('auto1', 'Certidão pedida, chega amanhã'))
  })

  it('gestor com documentos em falta não consegue aprovar', () => {
    estado.role = 'gestor'
    estado.docs = [docEmFalta]
    estado.auto = fazerAuto({ workflow: 'verificado' })
    renderDetalhe()
    expect(screen.getByRole('button', { name: /Aprovar auto/ })).toBeDisabled()
    expect(screen.getByRole('list', { name: 'O que falta' })).toHaveTextContent('Só o administrador pode aprovar com exceção')
  })

  it('devolve ao rascunho com motivo de pelo menos 5 caracteres', async () => {
    estado.devolver.mockResolvedValue(true)
    estado.auto = fazerAuto({ workflow: 'submetido' })
    renderDetalhe()
    fireEvent.click(screen.getByRole('button', { name: /Devolver ao rascunho/ }))
    fireEvent.change(screen.getByLabelText('Motivo da devolução'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao rascunho' }))
    expect(estado.devolver).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Motivo da devolução'), { target: { value: 'Quantidade errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao rascunho' }))
    await waitFor(() => expect(estado.devolver).toHaveBeenCalledWith('auto1', 'Quantidade errada'))
  })

  it('no estado submetido explica fotografias e checklist em falta', () => {
    estado.auto = fazerAuto({ workflow: 'submetido' })
    estado.evidencias = [evid()]
    estado.verificacoes = [verif(1, 'Execução conforme projeto'), verif(2, 'Quantidades confirmadas', 'conforme')]
    renderDetalhe()
    const falta = screen.getByRole('list', { name: 'O que falta' })
    expect(falta).toHaveTextContent('Faltam 1 item da ficha de verificação.')
    expect(falta).toHaveTextContent('pelo menos 2 fotografias válidas')
  })

  it('passo atual marcado e pagamento bloqueado sem fatura', () => {
    estado.role = 'gestor'
    estado.auto = fazerAuto({ workflow: 'validado', status: 'validado' })
    renderDetalhe()
    expect(screen.getByText('Aprovado', { selector: 'li[aria-current="step"]' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Bloqueios do pagamento' })).toHaveTextContent('Falta guardar a fatura')
  })
})

describe('EvidenciaCapture', () => {
  const props = { autoId: 'auto1', obraId: 'o1', podeAdicionar: true, podeApagar: true, idadeMaxMin: 120, minFotos: 2 }
  const foto = (lastModified = Date.now()) => new File(['x'], 'foto.jpg', { type: 'image/jpeg', lastModified })

  beforeEach(() => {
    estado.obterGps.mockResolvedValue({ lat: 38.7, lon: -9.1, precisaoM: 8 })
    estado.prepararEvidencia.mockImplementation(async (f: File) => ({ ficheiro: f, hash: 'ab'.repeat(32) }))
    estado.enviarEvidencia.mockResolvedValue('o1/autos/1-abc.jpg')
  })

  it('só aceita a câmara (sem galeria)', () => {
    const { container } = render(<EvidenciaCapture {...props} />)
    const inputs = container.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toHaveAttribute('capture', 'environment')
    expect(inputs[0]).toHaveAttribute('accept', 'image/*')
    expect(inputs[0]).not.toHaveAttribute('multiple')
  })

  it('pede GPS, faz hash, envia e regista; mostra dentro da obra', async () => {
    estado.registarEvidencia.mockResolvedValue({ id: 'e9', valida: true, dentro_obra: true, distancia_m: 35.2, precisao_ok: true, motivo: null })
    render(<EvidenciaCapture {...props} />)
    fireEvent.change(screen.getByLabelText('Legenda (opcional)'), { target: { value: 'Pilar 3' } })
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto()] } })
    await screen.findByText('Dentro da obra ✓ (35 m)')
    expect(estado.enviarEvidencia).toHaveBeenCalledWith('o1', expect.any(File))
    expect(estado.registarEvidencia).toHaveBeenCalledWith(expect.objectContaining({
      p_auto_id: 'auto1', p_path: 'o1/autos/1-abc.jpg', p_legenda: 'Pilar 3', p_lat: 38.7, p_lon: -9.1, p_precisao_m: 8,
      p_hash: 'ab'.repeat(32), p_linha_id: null,
    }))
    expect(screen.getByText(/Precisão do GPS: ±8 m/)).toBeInTheDocument()
  })

  it('fora do raio fica marcada e não conta', async () => {
    estado.registarEvidencia.mockResolvedValue({ id: 'e9', valida: false, dentro_obra: false, distancia_m: 420, precisao_ok: true, motivo: 'fora_do_raio' })
    render(<EvidenciaCapture {...props} />)
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto()] } })
    await screen.findByText('Fora ✗ (420 m)')
    expect(screen.getByText(/Fotografia tirada fora do raio da obra/)).toBeInTheDocument()
  })

  it('sem GPS envia coordenadas nulas', async () => {
    estado.obterGps.mockResolvedValue(null)
    estado.registarEvidencia.mockResolvedValue({ id: 'e9', valida: false, dentro_obra: null, distancia_m: null, precisao_ok: null, motivo: 'sem_gps' })
    render(<EvidenciaCapture {...props} />)
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto()] } })
    await screen.findByText(/Sem localização GPS/)
    expect(estado.registarEvidencia).toHaveBeenCalledWith(expect.objectContaining({ p_lat: null, p_lon: null, p_precisao_m: null }))
  })

  it('sem rede deixa a fotografia pendente e diz que é preciso rede', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    render(<EvidenciaCapture {...props} />)
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto()] } })
    await screen.findByText(/É preciso rede para a guardar/)
    expect(estado.enviarEvidencia).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    estado.registarEvidencia.mockResolvedValue({ id: 'e9', valida: true, dentro_obra: true, distancia_m: 10, precisao_ok: true, motivo: null })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar guardar agora' }))
    await screen.findByText('Dentro da obra ✓ (10 m)')
  })

  it('recusa fotografias antigas antes de enviar', async () => {
    render(<EvidenciaCapture {...props} />)
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto(Date.now() - 3 * 3600_000)] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('há mais de 120 minutos')
    expect(estado.enviarEvidencia).not.toHaveBeenCalled()
  })

  it('mostra o erro do servidor (hash repetido) e permite apagar só quando pode', async () => {
    estado.evidencias = [evid(), evid({ id: 'e2', valida: false, dentro_obra: false, distancia_obra_m: 900, motivo_invalida: 'fora_do_raio' })]
    estado.enviarEvidencia.mockRejectedValue(new Error('Não foi possível enviar a fotografia. Verifique a ligação e tente outra vez.'))
    const { rerender } = render(<EvidenciaCapture {...props} />)
    expect(screen.getByText(/Válidas: 1 de 2/)).toBeInTheDocument()
    expect(screen.getByText('Fora ✗ (900 m)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar fotografia 1' }))
    expect(estado.apagarEvidencia).toHaveBeenCalledWith('e1')
    fireEvent.change(screen.getByTestId('evidencia-camera'), { target: { files: [foto()] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar a fotografia')
    rerender(<EvidenciaCapture {...props} podeApagar={false} />)
    expect(screen.queryByRole('button', { name: /Apagar fotografia/ })).not.toBeInTheDocument()
  })
})

describe('AutoVerificacao', () => {
  const props = { autoId: 'auto1', workflow: 'submetido' as WorkflowAuto, podeMedir: true, isAdmin: false }

  it('inicia a verificação quando ainda não há ficha', () => {
    render(<AutoVerificacao {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar verificação' }))
    expect(estado.iniciar).toHaveBeenCalledWith('auto1')
  })

  it('não conforme exige observação; guarda e conclui', async () => {
    estado.verificacoes = [verif(1, 'Execução conforme projeto'), verif(2, 'Limpeza')]
    estado.registarVerificacao.mockResolvedValue(true)
    estado.verificar.mockResolvedValue(true)
    render(<AutoVerificacao {...props} />)
    fireEvent.change(screen.getByLabelText('Resultado: Execução conforme projeto'), { target: { value: 'nao_conforme' } })
    fireEvent.change(screen.getByLabelText('Resultado: Limpeza'), { target: { value: 'conforme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar verificação' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique a observação do item não conforme')
    expect(estado.registarVerificacao).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Observação: Execução conforme projeto'), { target: { value: 'Fissura na parede' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir verificação' }))
    await waitFor(() => expect(estado.verificar).toHaveBeenCalledWith('auto1', null))
    expect(estado.registarVerificacao).toHaveBeenCalledWith('auto1', [
      { ordem: 1, resultado: 'nao_conforme', observacao: 'Fissura na parede' },
      { ordem: 2, resultado: 'conforme', observacao: null },
    ])
  })

  it('só o admin vê a exceção às fotografias, com motivo', async () => {
    estado.verificacoes = [verif(1, 'Item', 'conforme')]
    estado.verificar.mockResolvedValue(true)
    const { rerender } = render(<AutoVerificacao {...props} />)
    expect(screen.queryByRole('button', { name: 'Verificar com exceção' })).not.toBeInTheDocument()
    rerender(<AutoVerificacao {...props} isAdmin />)
    fireEvent.change(screen.getByLabelText(/Motivo para verificar sem as fotografias/), { target: { value: 'sem gps' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar com exceção' }))
    expect(estado.verificar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Motivo para verificar sem as fotografias/), { target: { value: 'Obra em zona sem GPS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar com exceção' }))
    await waitFor(() => expect(estado.verificar).toHaveBeenCalledWith('auto1', 'Obra em zona sem GPS'))
  })

  it('fora do estado submetido fica só de leitura', () => {
    estado.verificacoes = [verif(1, 'Item', 'conforme')]
    render(<AutoVerificacao {...props} workflow="verificado" />)
    expect(screen.getByText('Conforme')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluir verificação' })).not.toBeInTheDocument()
  })
})

describe('AutoGlosas', () => {
  const props = { autoId: 'auto1', workflow: 'verificado' as WorkflowAuto, valorPeriodo: 200, podeMedir: true, podeGerir: false }
  const glosa = (p: Partial<AutoGlosaRow> = {}): AutoGlosaRow => ({
    id: 'g1', auto_id: 'auto1', linha_id: null, motivo: 'QUALIDADE', descricao: 'Reboco fissurado', valor: 150, estado: 'aplicada',
    ocorrencia_id: null, criado_por: null, criado_em: '2026-10-01', levantada_por: null, levantada_em: null, motivo_levantamento: null, ...p,
  })

  it('aplica uma glosa', async () => {
    estado.glosar.mockResolvedValue('g2')
    render(<AutoGlosas {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova glosa' }))
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'ATRASO' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Entregue fora do prazo' } })
    fireEvent.change(screen.getByLabelText('Valor (€)'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar glosa' }))
    await waitFor(() => expect(estado.glosar).toHaveBeenCalledWith({
      p_auto_id: 'auto1', p_motivo: 'ATRASO', p_descricao: 'Entregue fora do prazo', p_valor: 30, p_linha_id: null, p_ocorrencia_id: null,
    }))
  })

  it('não deixa glosar mais do que o valor do auto', () => {
    estado.glosas = [glosa()]
    render(<AutoGlosas {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova glosa' }))
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Valor (€)'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar glosa' }))
    expect(estado.glosar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('não pode ultrapassar o valor do auto')
  })

  it('só gestão levanta glosas, com motivo', async () => {
    estado.glosas = [glosa()]
    estado.levantar.mockResolvedValue(true)
    const { rerender } = render(<AutoGlosas {...props} />)
    expect(screen.queryByRole('button', { name: 'Levantar glosa' })).not.toBeInTheDocument()
    rerender(<AutoGlosas {...props} podeGerir />)
    fireEvent.click(screen.getByRole('button', { name: 'Levantar glosa' }))
    fireEvent.change(screen.getByLabelText('Motivo do levantamento'), { target: { value: 'ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar levantamento' }))
    expect(estado.levantar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Motivo do levantamento'), { target: { value: 'Reparado pelo subempreiteiro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar levantamento' }))
    await waitFor(() => expect(estado.levantar).toHaveBeenCalledWith('g1', 'Reparado pelo subempreiteiro'))
  })

  it('auto aprovado fecha as glosas', () => {
    render(<AutoGlosas {...props} workflow="validado" podeGerir />)
    expect(screen.queryByRole('button', { name: 'Nova glosa' })).not.toBeInTheDocument()
    expect(screen.getByText(/as glosas já não podem ser alteradas/)).toBeInTheDocument()
  })
})

describe('AutoFaturaPagamento', () => {
  const base = {
    autoId: 'auto1', subId: 's1', workflow: 'validado' as WorkflowAuto, certificado: 200, aPagar: 190, fatura: null,
    estadoPagamento: 'por_pagar' as const, bloqueios: [] as string[], avisos: [] as string[], isAdmin: false, podeGerir: true, hoje: '2026-10-02',
  }

  it('antes da aprovação não há fatura nem pagamento', () => {
    render(<AutoFaturaPagamento {...base} workflow="verificado" />)
    expect(screen.getByText(/Disponíveis depois de o auto ser aprovado/)).toBeInTheDocument()
  })

  it('guarda a fatura do subempreiteiro (envia o ficheiro e regista)', async () => {
    estado.enviarFatura.mockResolvedValue({ path: 's1/fatura-1.pdf', nome: 'FT 12.pdf' })
    estado.registarFatura.mockResolvedValue(true)
    render(<AutoFaturaPagamento {...base} />)
    expect(screen.getByText(/O ERP não emite faturas/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fatura do subempreiteiro' }))
    fireEvent.change(screen.getByLabelText('Número da fatura'), { target: { value: 'FT 2026/12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fatura' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Anexe o ficheiro da fatura')
    const pdf = new File(['%PDF'], 'FT 12.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Ficheiro da fatura/), { target: { files: [pdf] } })
    fireEvent.change(screen.getByLabelText('Valor sem IVA (€)'), { target: { value: '210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fatura' }))
    await waitFor(() => expect(estado.registarFatura).toHaveBeenCalledWith({
      autoId: 'auto1', numero: 'FT 2026/12', data: '2026-10-02', valor: 210, path: 's1/fatura-1.pdf', nome: 'FT 12.pdf',
    }))
    expect(estado.enviarFatura).toHaveBeenCalledWith('s1', pdf)
  })

  it('valor divergente é só aviso e o pagamento continua possível', async () => {
    estado.pagar.mockResolvedValue(true)
    render(<AutoFaturaPagamento {...base} fatura={{ numero: 'FT 1', valor: 250, path: 's1/fatura-1.pdf' }} avisos={['O valor da fatura diverge do valor aprovado.']} />)
    expect(screen.getByText(/diverge do valor aprovado.*não impede o pagamento/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Referência do pagamento/), { target: { value: 'TRF 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(estado.pagar).toHaveBeenCalledWith('auto1', 'TRF 1', null))
  })

  it('gestor bloqueado não paga; admin paga com exceção e motivo', async () => {
    estado.pagar.mockResolvedValue(true)
    const bloqueios = ['Existem ocorrências graves de qualidade ou segurança por resolver.']
    const { rerender } = render(<AutoFaturaPagamento {...base} bloqueios={bloqueios} />)
    expect(screen.queryByRole('button', { name: /Marcar como pago|Pagar com exceção/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Pagamento bloqueado/)).toBeInTheDocument()
    rerender(<AutoFaturaPagamento {...base} bloqueios={bloqueios} isAdmin />)
    fireEvent.change(screen.getByLabelText(/Motivo da exceção/), { target: { value: 'curto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar com exceção' }))
    expect(estado.pagar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 10 caracteres')
    fireEvent.change(screen.getByLabelText(/Motivo da exceção/), { target: { value: 'Ocorrência resolvida em obra hoje' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar com exceção' }))
    await waitFor(() => expect(estado.pagar).toHaveBeenCalledWith('auto1', null, 'Ocorrência resolvida em obra hoje'))
  })

  it('abre a fatura por URL assinada e mostra o pagamento feito', async () => {
    estado.urlAssinadaFatura.mockResolvedValue('https://assinado')
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AutoFaturaPagamento {...base} estadoPagamento="pago" dataPagamento={new Date('2026-10-01')} referenciaPagamento="TRF 9"
      fatura={{ numero: 'FT 1', valor: 200, path: 's1/fatura-1.pdf', nome: 'ft.pdf' }} />)
    expect(screen.getByText('Pagamento registado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Substituir fatura/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ver ficheiro/ }))
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://assinado', '_blank', 'noopener'))
    abrir.mockRestore()
  })

  it('leitura vê a fatura mas não a altera', () => {
    render(<AutoFaturaPagamento {...base} podeGerir={false} fatura={{ numero: 'FT 1', path: 's1/fatura-1.pdf' }} />)
    expect(screen.getByText('FT 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Substituir fatura|Marcar como pago/ })).not.toBeInTheDocument()
  })
})

describe('AutoFormPage', () => {
  const renderNovo = () => render(
    <MemoryRouter initialEntries={['/obras/subempreitada/s1/auto/novo']}>
      <Routes><Route path="/obras/subempreitada/:subId/auto/novo" element={<AutoFormPage />} /></Routes>
    </MemoryRouter>,
  )

  it('mostra Pedida/Verificada/Acumulada/Saldo e avisa quando a verificada excede a pedida', () => {
    estado.auto = null
    renderNovo()
    const artigo = screen.getByTestId('artigo-a1')
    fireEvent.change(within(artigo).getByLabelText('Pedida (m2)'), { target: { value: '10' } })
    fireEvent.change(within(artigo).getByLabelText('Verificada (m2)'), { target: { value: '15' } })
    expect(within(artigo).getByText('85')).toBeInTheDocument()
    expect(within(artigo).getByText('15')).toBeInTheDocument()
    expect(within(artigo).getByText(/A verificada excede a pedida/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Correções antes de submeter' })).toHaveTextContent('excede a pedida')
  })

  it('cria o auto e grava as linhas com a quantidade pedida e a justificação dos extras', async () => {
    estado.auto = null
    estado.criar.mockResolvedValue({ id: 'novo1' })
    estado.guardarLinhas.mockResolvedValue(true)
    estado.guardarEvidencias.mockResolvedValue(true)
    renderNovo()
    const artigo = screen.getByTestId('artigo-a1')
    fireEvent.change(within(artigo).getByLabelText('Pedida (m2)'), { target: { value: '12' } })
    fireEvent.change(within(artigo).getByLabelText('Verificada (m2)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar trabalho a mais/ }))
    fireEvent.change(screen.getByLabelText('Descrição do extra 1'), { target: { value: 'Furo' } })
    fireEvent.change(screen.getByLabelText('Preço do extra 1'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Quantidade do extra 1'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Justificação do extra 1'), { target: { value: 'Pedido do dono de obra' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Auto' }))
    await waitFor(() => expect(estado.guardarLinhas).toHaveBeenCalled())
    expect(estado.criar).toHaveBeenCalledWith(expect.not.objectContaining({ lines: expect.anything() }))
    expect(estado.criar).toHaveBeenCalledWith(expect.objectContaining({ subcontractorId: 's1', periodValue: 110 }))
    expect(estado.guardarLinhas).toHaveBeenCalledWith('novo1', [
      { artigoId: 'a1', descricao: 'Reboco', unidade: 'm2', precoUnitario: 10, quantidade: 10, qtdPedida: 12, isExtra: false, justificacao: null },
      { artigoId: null, descricao: 'Furo', unidade: 'un', precoUnitario: 5, quantidade: 2, qtdPedida: null, isExtra: true, justificacao: 'Pedido do dono de obra' },
    ])
    await waitFor(() => expect(estado.navigate).toHaveBeenCalledWith('/obras/auto/novo1'))
  })

  it('auto já submetido não se edita', async () => {
    estado.auto = fazerAuto({ workflow: 'submetido' })
    render(
      <MemoryRouter initialEntries={['/obras/auto/auto1/editar']}>
        <Routes><Route path="/obras/auto/:autoId/editar" element={<AutoFormPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(estado.navigate).toHaveBeenCalledWith('/obras/auto/auto1'))
    expect(estado.toastErro).toHaveBeenCalledWith('Este auto já foi submetido e não pode ser editado.')
  })

  it('ao editar preenche a quantidade pedida guardada', async () => {
    render(
      <MemoryRouter initialEntries={['/obras/auto/auto1/editar']}>
        <Routes><Route path="/obras/auto/:autoId/editar" element={<AutoFormPage />} /></Routes>
      </MemoryRouter>,
    )
    const artigo = screen.getByTestId('artigo-a1')
    await waitFor(() => expect(within(artigo).getByLabelText('Pedida (m2)')).toHaveValue(25))
    expect(within(artigo).getByLabelText('Verificada (m2)')).toHaveValue(20)
  })
})
