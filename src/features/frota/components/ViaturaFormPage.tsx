import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { useViaturaEdicao, useGuardarViatura, useArquivarViatura, useDefinirEstadoViatura } from '../hooks/useFrota'
import { hojeIso, numeroOuNulo } from '../lib/frota'
import { TIPOS_VIATURA, COMBUSTIVEIS, unidadePorTipo } from '../lib/viaturas'
import { Cabecalho, inputCls, botaoSecundario } from './ui'
import { FotoDocumento } from './FotoDocumento'

type Estado = {
  marca: string; modelo: string; tipo: string; identificacao: string; combustivel: string
  unidade: 'km' | 'horas'; leitura: string
  dataRevisao: string; leituraRevisao: string
  dataSeguro: string; seguroFoto: string | null
  dataIpo: string; ipoFoto: string | null
  observacoes: string; operacional: boolean
}

const VAZIO: Estado = {
  marca: '', modelo: '', tipo: 'viatura', identificacao: '', combustivel: 'gasoleo', unidade: 'km', leitura: '',
  dataRevisao: '', leituraRevisao: '', dataSeguro: '', seguroFoto: null, dataIpo: '', ipoFoto: null,
  observacoes: '', operacional: true,
}

function Campo({ id, rotulo, opcional, children }: { id: string; rotulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {rotulo} {opcional && <span className="text-muted-foreground font-normal text-xs">(opcional)</span>}
      </label>
      {children}
    </div>
  )
}

export function ViaturaFormPage() {
  const navigate = useNavigate()
  const { id: idRota } = useParams()
  const editar = !!idRota
  const { podeFrota, podeCombustivel } = useRole()
  const permitido = podeFrota || podeCombustivel

  // O id gera-se já no browser: as fotos do seguro e da IPO vão para viaturas/<id>/ antes de a viatura existir
  const [idNovo] = useState(() => crypto.randomUUID())
  const id = idRota ?? idNovo

  const { dados, loading, error } = useViaturaEdicao(idRota)
  const { guardar, loading: aGuardar } = useGuardarViatura()
  const { arquivar, loading: aArquivar } = useArquivarViatura()
  const { definir } = useDefinirEstadoViatura()

  const [f, setF] = useState<Estado>(VAZIO)
  const [unidadeManual, setUnidadeManual] = useState(false)
  const [confirmaArquivo, setConfirmaArquivo] = useState(false)
  const set = (p: Partial<Estado>) => setF(prev => ({ ...prev, ...p }))

  useEffect(() => {
    if (!permitido) {
      toast.error('Não tem permissão para registar ou editar viaturas.')
      navigate('/frota', { replace: true })
    }
  }, [permitido, navigate])

  useEffect(() => {
    if (!dados) return
    const v = dados.viatura
    setUnidadeManual(true)
    setF({
      marca: v.marca ?? '', modelo: v.modelo ?? '', tipo: v.tipo, identificacao: v.identificacao ?? '',
      combustivel: v.tipo_combustivel, unidade: v.unidade_contador === 'horas' ? 'horas' : 'km',
      leitura: String(dados.kmAtual),
      dataRevisao: v.data_ultima_revisao ?? '', leituraRevisao: v.km_ultima_revisao != null ? String(v.km_ultima_revisao) : '',
      dataSeguro: v.data_fim_seguro ?? '', seguroFoto: v.seguro_foto_path,
      dataIpo: v.data_proxima_ipo ?? '', ipoFoto: v.ipo_foto_path,
      observacoes: v.observacoes ?? '', operacional: v.estado_operacional !== 'OFICINA',
    })
  }, [dados])

  if (!permitido) return null
  if (editar && loading && !dados) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  if (editar && (error || !dados)) return (
    <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
      <p className="text-sm text-destructive">{error ?? 'Viatura não encontrada.'}</p>
      <button onClick={() => navigate('/frota/viaturas')} className={botaoSecundario}>Voltar à lista</button>
    </div>
  )

  const original = dados?.viatura
  const emUso = original?.estado_operacional === 'EM_USO'
  const arquivada = !!original && !original.ativo
  const un = f.unidade === 'horas' ? 'horas' : 'km'

  const mudarTipo = (tipo: string) => set({ tipo, ...(unidadeManual ? {} : { unidade: unidadePorTipo(tipo) }) })

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.marca.trim() && !f.modelo.trim()) { toast.error('Indique a marca e o modelo.'); return }
    const leitura = numeroOuNulo(f.leitura)
    if (leitura === null || Number.isNaN(leitura) || leitura < 0) { toast.error(`Indique os ${un} atuais.`); return }
    const leituraRev = numeroOuNulo(f.leituraRevisao)
    if (leituraRev !== null && (Number.isNaN(leituraRev) || leituraRev < 0)) { toast.error(`Os ${un} da última revisão não são válidos.`); return }
    if (leituraRev !== null && leituraRev > leitura) { toast.error('A leitura da última revisão não pode ser superior à atual.'); return }
    if (f.dataRevisao && f.dataRevisao > hojeIso()) { toast.error('A data da última revisão não pode ser futura.'); return }

    const idGuardado = await guardar({
      id, marca: f.marca, modelo: f.modelo, tipo: f.tipo, identificacao: f.identificacao,
      unidade: f.unidade, combustivel: f.combustivel, leituraAtual: leitura,
      dataUltimaRevisao: f.dataRevisao || null, leituraUltimaRevisao: leituraRev,
      dataSeguro: f.dataSeguro || null, seguroFoto: f.seguroFoto,
      dataIpo: f.dataIpo || null, ipoFoto: f.ipoFoto, observacoes: f.observacoes,
    })
    if (!idGuardado) return

    // Em uso não muda aqui (a devolução é que liberta); o resto segue o interruptor
    const estadoAtual = original?.estado_operacional ?? 'LIVRE'
    if (!emUso && podeFrota) {
      const alvo = f.operacional ? 'LIVRE' : 'OFICINA'
      if (alvo !== estadoAtual && !(await definir(idGuardado, alvo))) {
        toast.error('A viatura foi guardada, mas não foi possível alterar o estado.')
        navigate(`/frota/viatura/${idGuardado}`)
        return
      }
    }
    toast.success(editar ? 'Alterações guardadas.' : 'Viatura registada.')
    navigate(`/frota/viatura/${idGuardado}`)
  }

  const alterarArquivo = async () => {
    if (!idRota) return
    if (await arquivar(idRota, !arquivada)) {
      toast.success(arquivada ? 'Viatura restaurada.' : 'Viatura arquivada.')
      navigate(arquivada ? `/frota/viatura/${idRota}` : '/frota/viaturas')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <Cabecalho titulo={editar ? 'Editar viatura' : 'Nova viatura / máquina'}
        subtitulo={editar ? original?.codigo : 'Estado do equipamento à chegada à empresa'} />

      <form onSubmit={submeter} className="space-y-4">
        {podeFrota && (
          <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold" id="op-t">Viatura operacional</p>
              <p className="text-xs text-muted-foreground">
                {emUso ? 'Está em uso: registe primeiro a devolução para a poder pôr na oficina.' : 'Desligue se for para a Oficina.'}
              </p>
            </div>
            <button type="button" role="switch" aria-checked={f.operacional} aria-labelledby="op-t" disabled={emUso}
              onClick={() => set({ operacional: !f.operacional })}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${f.operacional ? 'bg-success' : 'bg-muted-foreground/40'}`}>
              <span className={`absolute top-0.5 w-6 h-6 rounded-full shadow transition-all ${f.operacional ? 'left-[22px] bg-success-foreground' : 'left-0.5 bg-foreground'}`} />
            </button>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="vf-marca" rotulo="Marca">
              <input id="vf-marca" value={f.marca} onChange={e => set({ marca: e.target.value })} className={inputCls} placeholder="Ex: Toyota" />
            </Campo>
            <Campo id="vf-modelo" rotulo="Modelo">
              <input id="vf-modelo" value={f.modelo} onChange={e => set({ modelo: e.target.value })} className={inputCls} placeholder="Ex: Hilux" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="vf-tipo" rotulo="Tipo de veículo">
              <select id="vf-tipo" value={f.tipo} onChange={e => mudarTipo(e.target.value)} className={inputCls}>
                {TIPOS_VIATURA.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </Campo>
            <Campo id="vf-mat" rotulo="Matrícula / identificação" opcional>
              <input id="vf-mat" value={f.identificacao} onChange={e => set({ identificacao: e.target.value.toUpperCase() })}
                className={`${inputCls} uppercase`} placeholder="00-XX-00" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="vf-comb" rotulo="Combustível">
              <select id="vf-comb" value={f.combustivel} onChange={e => set({ combustivel: e.target.value })} className={inputCls}>
                {COMBUSTIVEIS.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </Campo>
            <Campo id="vf-un" rotulo="Contador">
              <select id="vf-un" value={f.unidade} onChange={e => { setUnidadeManual(true); set({ unidade: e.target.value === 'horas' ? 'horas' : 'km' }) }} className={inputCls}>
                <option value="km">Quilómetros (km)</option>
                <option value="horas">Horas</option>
              </select>
            </Campo>
          </div>
          <Campo id="vf-leitura" rotulo={`${un === 'horas' ? 'Horas' : 'Km'} atuais`}>
            <input id="vf-leitura" inputMode="decimal" value={f.leitura} onChange={e => set({ leitura: e.target.value })}
              disabled={editar} className={inputCls} placeholder="Ex: 15000" />
            <p className="text-xs text-muted-foreground mt-1">
              {editar ? 'A leitura atual atualiza-se com entregas, devoluções e abastecimentos.' : 'É o estado à chegada: fica registado como ponto de partida.'}
            </p>
          </Campo>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Última revisão</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="vf-drev" rotulo="Data da última revisão" opcional>
              <input id="vf-drev" type="date" max={hojeIso()} value={f.dataRevisao} onChange={e => set({ dataRevisao: e.target.value })} className={inputCls} />
            </Campo>
            <Campo id="vf-lrev" rotulo={`${un === 'horas' ? 'Horas' : 'Km'} na última revisão`} opcional>
              <input id="vf-lrev" inputMode="decimal" value={f.leituraRevisao} onChange={e => set({ leituraRevisao: e.target.value })} className={inputCls} placeholder="Ex: 15000" />
            </Campo>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Seguro e IPO</h2>
          <p className="text-xs text-muted-foreground -mt-2">As fotos servem para mostrar rapidamente os documentos, por exemplo numa operação da GNR.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-4">
              <Campo id="vf-seg" rotulo="Seguro válido até" opcional>
                <input id="vf-seg" type="date" value={f.dataSeguro} onChange={e => set({ dataSeguro: e.target.value })} className={inputCls} />
              </Campo>
              <FotoDocumento viaturaId={id} documento="seguro" rotulo="Foto do seguro" valor={f.seguroFoto} onChange={seguroFoto => set({ seguroFoto })} />
            </div>
            <div className="space-y-4">
              <Campo id="vf-ipo" rotulo="Próxima IPO" opcional>
                <input id="vf-ipo" type="date" value={f.dataIpo} onChange={e => set({ dataIpo: e.target.value })} className={inputCls} />
              </Campo>
              <FotoDocumento viaturaId={id} documento="ipo" rotulo="Foto da IPO" valor={f.ipoFoto} onChange={ipoFoto => set({ ipoFoto })} />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4">
          <Campo id="vf-obs" rotulo="Observações" opcional>
            <textarea id="vf-obs" rows={2} value={f.observacoes} onChange={e => set({ observacoes: e.target.value })} className={`${inputCls} resize-none`} />
          </Campo>
        </div>

        {editar && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
            <h2 className="text-sm font-semibold">{arquivada ? 'Viatura arquivada' : 'Arquivar viatura'}</h2>
            <p className="text-xs text-muted-foreground">
              {arquivada ? 'Não aparece nas listas. Pode restaurá-la quando quiser.'
                : emUso ? 'Está em uso: registe primeiro a devolução para a poder arquivar.'
                : 'Deixa de aparecer nas listas; o histórico mantém-se.'}
            </p>
            {!confirmaArquivo && !arquivada ? (
              <button type="button" disabled={emUso} onClick={() => setConfirmaArquivo(true)} className={botaoSecundario}>
                <Archive className="w-4 h-4" aria-hidden="true" /> Arquivar
              </button>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={alterarArquivo} disabled={aArquivar}
                  className={`${botaoSecundario} ${arquivada ? '' : '!bg-destructive/10 !text-destructive'}`}>
                  {arquivada ? <ArchiveRestore className="w-4 h-4" aria-hidden="true" /> : <Archive className="w-4 h-4" aria-hidden="true" />}
                  {arquivada ? 'Restaurar viatura' : 'Confirmar arquivo'}
                </button>
                {!arquivada && <button type="button" onClick={() => setConfirmaArquivo(false)} className={botaoSecundario}>Cancelar</button>}
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent">
          <button type="submit" disabled={aGuardar}
            className="w-full inline-flex items-center justify-center gap-2 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            <Save className="w-5 h-5" aria-hidden="true" /> {aGuardar ? 'A guardar…' : editar ? 'Guardar alterações' : 'Registar viatura'}
          </button>
        </div>
      </form>
    </div>
  )
}
