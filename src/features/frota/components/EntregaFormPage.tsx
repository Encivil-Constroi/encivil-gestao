import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { KeyRound, Undo2, Search, Check } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import type {
  DanoMarcado, InventarioSeguranca, NivelAdblue, NivelCombustivel, NivelLimpeza, NivelOleo, NivelPneus, ResumoViaturaRow,
} from '../db'
import { useResumoFrota, useColaboradoresAtivos } from '../hooks/useFrota'
import { useEntregas, useObrasAtivas, useEntregarViatura, useDevolverViatura } from '../hooks/useEntregas'
import {
  ITENS_INVENTARIO, OPCOES_ADBLUE, OPCOES_COMBUSTIVEL, OPCOES_LIMPEZA, OPCOES_OLEO, OPCOES_PNEUS,
  ROTULO_COMBUSTIVEL, entregaEmCurso, formatarContador, formatarData, hojeISO, parseNumero, validarEntrega,
} from '../lib/entregas'
import { Cabecalho, Seccao, Vazio, inputCls } from './ui'
import { Interruptor, Segmentado } from './EntregaCampos'
import { MapaDanos } from './MapaDanos'

type Tipo = 'ENTREGA' | 'DEVOLUCAO'

function motivoIndisponivel(v: ResumoViaturaRow, tipo: Tipo): string | null {
  if (v.estado_operacional === 'OFICINA') return 'na oficina'
  if (tipo === 'ENTREGA' && v.estado_operacional === 'EM_USO') return `em uso por ${v.condutor_nome ?? 'outro colaborador'}`
  if (tipo === 'DEVOLUCAO' && v.estado_operacional === 'LIVRE') return 'livre — não está entregue'
  return null
}

const modeloDe = (v: ResumoViaturaRow) => [v.marca, v.modelo].filter(Boolean).join(' ') || v.nome
const matriculaDe = (v: ResumoViaturaRow) => v.identificacao ?? v.codigo

export function EntregaFormPage({ tipo }: { tipo: Tipo }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { podeFrota } = useRole()
  const ehEntrega = tipo === 'ENTREGA'

  const { viaturas } = useResumoFrota()
  const { colaboradores } = useColaboradoresAtivos()
  const { obras } = useObrasAtivas()
  const { entregas } = useEntregas(!ehEntrega)
  const { entregar, loading: aEntregar, error: erroEntregar } = useEntregarViatura()
  const { devolver, loading: aDevolver, error: erroDevolver } = useDevolverViatura()

  const [veiculoId, setVeiculoId] = useState('')
  const [pesquisaViatura, setPesquisaViatura] = useState('')
  const [obraId, setObraId] = useState('')
  const [colaboradorId, setColaboradorId] = useState('')
  const [pesquisaColab, setPesquisaColab] = useState('')
  const [data, setData] = useState(hojeISO)
  const [km, setKm] = useState('')
  const [combustivel, setCombustivel] = useState<NivelCombustivel | null>(null)
  const [adblue, setAdblue] = useState<NivelAdblue>('NA')
  const [oleo, setOleo] = useState<NivelOleo>('NA')
  const [refrigeracao, setRefrigeracao] = useState<NivelOleo>('NA')
  const [pneus, setPneus] = useState<NivelPneus>('NA')
  const [limpeza, setLimpeza] = useState<NivelLimpeza>('NA')
  const [inventario, setInventario] = useState<InventarioSeguranca>({})
  const [danos, setDanos] = useState<DanoMarcado[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [paraOficina, setParaOficina] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const viatura = viaturas.find(v => v.id === veiculoId) ?? null
  const unidade = viatura?.unidade_contador ?? 'km'
  const rotuloUnidade = unidade === 'horas' ? 'Horas' : 'KM'

  const entrega = useMemo(
    () => (!ehEntrega && veiculoId ? entregaEmCurso(entregas.filter(e => e.veiculo_id === veiculoId)) : null),
    [ehEntrega, veiculoId, entregas],
  )

  function escolherViatura(v: ResumoViaturaRow) {
    setVeiculoId(v.id)
    setKm(v.km_atual != null ? String(v.km_atual) : '')
    setDanos([])
    setErro(null)
  }

  // ?viatura=<id>: pré-seleciona (só se estiver disponível para esta operação)
  const viaturaParam = params.get('viatura')
  useEffect(() => {
    if (!viaturaParam || veiculoId) return
    const v = viaturas.find(x => x.id === viaturaParam)
    if (v && !motivoIndisponivel(v, tipo)) escolherViatura(v)
  }, [viaturaParam, viaturas, veiculoId, tipo])

  // Devolução: parte do estado da entrega para só se corrigir o que mudou.
  // O combustível fica por escolher de propósito — tem de ser lido na devolução.
  useEffect(() => {
    if (!entrega) return
    setAdblue(entrega.adblue); setOleo(entrega.oleo); setRefrigeracao(entrega.refrigeracao)
    setPneus(entrega.pneus); setLimpeza(entrega.limpeza); setInventario(entrega.inventario ?? {})
  }, [entrega?.id])

  const colaboradoresFiltrados = useMemo(() => {
    const q = pesquisaColab.trim().toLowerCase()
    return q ? colaboradores.filter(c => c.nome.toLowerCase().includes(q)) : colaboradores
  }, [colaboradores, pesquisaColab])

  const viaturasOrdenadas = useMemo(() => {
    const q = pesquisaViatura.trim().toLowerCase()
    const certas = viaturas.filter(v => !q || [v.identificacao, v.nome, v.marca, v.modelo, v.codigo]
      .some(t => t?.toLowerCase().includes(q)))
    const livres = certas.filter(v => !motivoIndisponivel(v, tipo))
    return [...livres, ...certas.filter(v => motivoIndisponivel(v, tipo))]
  }, [viaturas, pesquisaViatura, tipo])

  const existentes = entrega?.danos ?? []
  const aGuardar = aEntregar || aDevolver
  const erroServidor = erroEntregar ?? erroDevolver

  async function confirmar() {
    const problema = validarEntrega({
      tipo, veiculoId, colaboradorId, data, km, unidade,
      kmMinimo: viatura?.km_atual ?? null, combustivel,
    })
    setErro(problema)
    if (problema || !combustivel) return
    const base = {
      veiculoId, data, km: parseNumero(km)!, combustivel, adblue, oleo, refrigeracao, pneus, limpeza, inventario,
      danos: [...existentes, ...danos], observacoes: observacoes.trim() || null,
    }
    const id = ehEntrega
      ? await entregar({ ...base, colaboradorId, obraId: obraId || null })
      : await devolver({ ...base, paraOficina })
    if (!id) return
    toast.success(ehEntrega ? 'Viatura entregue' : paraOficina ? 'Devolução registada — viatura na oficina' : 'Devolução registada')
    navigate(`/frota/viatura/${veiculoId}`)
  }

  if (!podeFrota) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Cabecalho titulo={ehEntrega ? 'Entregar viatura' : 'Devolver viatura'} />
        <Vazio>Não tem permissão para registar entregas e devoluções.</Vazio>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <Cabecalho
        titulo={ehEntrega ? 'Entregar viatura' : 'Devolver viatura'}
        subtitulo={ehEntrega ? 'Registe o estado da viatura e quem fica com a chave.' : 'Registe o estado em que a viatura volta.'}
      />

      <Seccao titulo={ehEntrega ? 'Dados da entrega' : 'Dados da devolução'} icone={ehEntrega ? <KeyRound className="w-4 h-4" aria-hidden="true" /> : <Undo2 className="w-4 h-4" aria-hidden="true" />}>
        {viatura ? (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-start gap-3">
            <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{matriculaDe(viatura)} · {viatura.nome}</div>
              <div className="text-sm text-muted-foreground">Modelo: {modeloDe(viatura)}</div>
              {!ehEntrega && (
                <div className="text-sm mt-1 space-y-0.5">
                  <div>Condutor: <strong>{viatura.condutor_nome ?? '—'}</strong></div>
                  <div>Obra: {viatura.obra_nome ?? '—'}</div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setVeiculoId('')}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-secondary/20 hover:bg-secondary/30 shrink-0">Alterar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="pesq-viatura">
              {ehEntrega ? 'Selecionar viatura (disponível)' : 'Selecionar viatura (em uso)'}
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input id="pesq-viatura" value={pesquisaViatura} onChange={e => setPesquisaViatura(e.target.value)}
                placeholder="Pesquisar por matrícula ou modelo" className={`${inputCls} pl-10`} />
            </div>
            <ul className="space-y-2 max-h-80 overflow-y-auto" aria-label="Viaturas">
              {viaturasOrdenadas.map(v => {
                const motivo = motivoIndisponivel(v, tipo)
                return (
                  <li key={v.id}>
                    <button type="button" disabled={!!motivo} onClick={() => escolherViatura(v)}
                      className={`w-full min-h-14 text-left rounded-xl border p-3 transition-colors ${
                        motivo ? 'bg-muted/40 border-border opacity-60 cursor-not-allowed' : 'bg-card border-border hover:border-primary hover:bg-primary/5'}`}>
                      <div className="font-semibold">{matriculaDe(v)} · {v.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        {modeloDe(v)}{motivo && <> · <span className="font-medium">{motivo}</span></>}
                      </div>
                    </button>
                  </li>
                )
              })}
              {viaturasOrdenadas.length === 0 && <li><Vazio>Nenhuma viatura encontrada.</Vazio></li>}
            </ul>
          </div>
        )}

        {ehEntrega && (
          <>
            <div>
              <label className="block text-sm font-semibold mb-1.5" htmlFor="obra">Para que obra vai? (opcional)</label>
              <select id="obra" value={obraId} onChange={e => setObraId(e.target.value)} className={inputCls}>
                <option value="">Sem obra</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold" htmlFor="colab">Quem vai conduzir?</label>
              <input value={pesquisaColab} onChange={e => setPesquisaColab(e.target.value)}
                aria-label="Pesquisar colaborador" placeholder="Pesquisar colaborador" className={inputCls} />
              <select id="colab" value={colaboradorId} onChange={e => setColaboradorId(e.target.value)} className={inputCls}>
                <option value="">Escolher colaborador</option>
                {colaboradoresFiltrados.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </>
        )}

        {!ehEntrega && viatura && (
          <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1" aria-label="Entrega correspondente">
            <div className="font-semibold">Entrega correspondente</div>
            {entrega ? (
              <>
                <div>Data: {formatarData(entrega.data)} · {rotuloUnidade} iniciais: {formatarContador(entrega.km, unidade)}</div>
                <div>Combustível à entrega: {ROTULO_COMBUSTIVEL[entrega.combustivel]}</div>
                <div>Danos já existentes: {entrega.danos.length}</div>
              </>
            ) : (
              <div className="text-muted-foreground">Sem registo digital da entrega{viatura.condutor_desde ? ` (desde ${formatarData(viatura.condutor_desde)})` : ''}.</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1.5" htmlFor="data">{ehEntrega ? 'Data' : 'Data de retorno'}</label>
            <input id="data" type="date" value={data} max={hojeISO()} min={!ehEntrega && viatura?.condutor_desde ? viatura.condutor_desde : undefined}
              onChange={e => setData(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" htmlFor="km">{rotuloUnidade} atuais</label>
            <input id="km" inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} className={inputCls} />
          </div>
        </div>
        {viatura?.km_atual != null && (
          <p className="text-xs text-muted-foreground -mt-1">Último valor registado: {formatarContador(viatura.km_atual, unidade)}</p>
        )}
      </Seccao>

      <Seccao titulo="Estado da viatura">
        <Segmentado rotulo="Combustível" valor={combustivel} opcoes={OPCOES_COMBUSTIVEL} onChange={setCombustivel} />
        <Segmentado rotulo="AdBlue" valor={adblue} opcoes={OPCOES_ADBLUE} onChange={setAdblue} />
        <Segmentado rotulo="Nível do óleo" valor={oleo} opcoes={OPCOES_OLEO} onChange={setOleo} />
        <Segmentado rotulo="Líq. refrigeração" valor={refrigeracao} opcoes={OPCOES_OLEO} onChange={setRefrigeracao} />
        <Segmentado rotulo="Estado dos pneus" valor={pneus} opcoes={OPCOES_PNEUS} onChange={setPneus} />
        <Segmentado rotulo="Limpeza (ext/int)" valor={limpeza} opcoes={OPCOES_LIMPEZA} onChange={setLimpeza} />
      </Seccao>

      <Seccao titulo="Mapa de danos">
        <MapaDanos value={danos} onChange={setDanos} existentes={existentes} />
      </Seccao>

      <Seccao titulo="Inventário de segurança">
        {ITENS_INVENTARIO.map(i => (
          <Interruptor key={i.chave} rotulo={i.rotulo} ativo={!!inventario[i.chave]}
            onChange={v => setInventario(prev => ({ ...prev, [i.chave]: v }))} />
        ))}
      </Seccao>

      <Seccao titulo="Observações">
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} maxLength={1000}
          aria-label="Observações" placeholder="Notas sobre o estado da viatura (opcional)" className={inputCls} />
        {!ehEntrega && (
          <Interruptor rotulo="Enviar para a oficina" ativo={paraOficina} onChange={setParaOficina} />
        )}
      </Seccao>

      {(erro || erroServidor) && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm font-medium">
          {erro ?? erroServidor}
        </div>
      )}

      <button type="button" onClick={confirmar} disabled={aGuardar}
        className="w-full min-h-14 rounded-2xl bg-primary text-primary-foreground text-base font-semibold active:scale-[0.99] transition-all disabled:opacity-60">
        {aGuardar ? 'A guardar…' : ehEntrega ? 'Confirmar e entregar chave' : 'Confirmar devolução'}
      </button>
    </div>
  )
}
