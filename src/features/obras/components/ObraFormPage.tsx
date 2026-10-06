import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useObra, useVisaoObra, useGuardarObra, useAtualizarObra, useColaboradoresAtivos } from '../hooks/useObras'
import type { EstadoObra } from '../db'
import { ESTADOS_OBRA } from '../lib/saude'
import { MapaPicker } from './MapaPicker'
import { Cabecalho, inputCls, botaoPrimario } from './ui'

// Carregamento lazy do mapa de geofence para não pesar no bundle principal
const GeofenceConfig = lazy(() =>
  import('./GeofenceConfig').then(m => ({ default: m.GeofenceConfig }))
)

// Centro de Lisboa como fallback quando não há localização definida
const DEFAULT_LAT = 38.7223
const DEFAULT_LON = -9.1399
const DEFAULT_RAIO = 200

const FORM_VAZIO = {
  nome: '', cliente: '', tipoObra: '', estado: 'ativa' as EstadoObra,
  dataInicio: '', dataPrevistaFim: '', orcamento: '',
  morada: '', localizacao: '', responsavelId: '', engenheiroId: '',
  descricao: '', observacoes: '',
}

function Campo({ id, rotulo, opcional, children }: { id: string; rotulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {rotulo} {opcional ? <span className="text-muted-foreground font-normal text-xs">(opcional)</span> : <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  )
}

export function ObraFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const { visao, loading: visaoLoading } = useVisaoObra(id)
  const { obra: obraGeofence } = useObra(id)
  const { colaboradores } = useColaboradoresAtivos()
  const { guardar, loading: aGuardar } = useGuardarObra()
  const { atualizar, loading: aAtualizar } = useAtualizarObra()
  const aProcessar = aGuardar || aAtualizar

  const [form, setForm] = useState(FORM_VAZIO)
  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)

  const [geofenceAtiva, setGeofenceAtiva] = useState(false)
  const [geofenceLat, setGeofenceLat] = useState(DEFAULT_LAT)
  const [geofenceLon, setGeofenceLon] = useState(DEFAULT_LON)
  const [geofenceRaio, setGeofenceRaio] = useState(DEFAULT_RAIO)

  useEffect(() => {
    if (!isEdit || !visao) return
    setForm({
      nome: visao.nome, cliente: visao.cliente ?? '', tipoObra: visao.tipo_obra ?? '', estado: visao.estado,
      dataInicio: visao.data_inicio ?? '', dataPrevistaFim: visao.data_prevista_fim ?? '',
      orcamento: visao.orcamento != null ? String(visao.orcamento) : '',
      morada: visao.morada ?? '', localizacao: visao.localizacao ?? '',
      responsavelId: visao.responsavel_id ?? '', engenheiroId: visao.engenheiro_id ?? '',
      descricao: visao.descricao ?? '', observacoes: visao.observacoes ?? '',
    })
    setLat(visao.latitude)
    setLon(visao.longitude)
  }, [isEdit, visao])

  useEffect(() => {
    if (!obraGeofence?.geofenceTipo) return
    setGeofenceAtiva(true)
    setGeofenceLat(obraGeofence.geofenceCentroLat ?? DEFAULT_LAT)
    setGeofenceLon(obraGeofence.geofenceCentroLon ?? DEFAULT_LON)
    setGeofenceRaio(obraGeofence.geofenceRaioM ?? DEFAULT_RAIO)
  }, [obraGeofence])

  const set = (patch: Partial<typeof FORM_VAZIO>) => setForm(prev => ({ ...prev, ...patch }))

  const ativarGeofence = (on: boolean) => {
    setGeofenceAtiva(on)
    if (!on) return
    if (lat != null && lon != null) { setGeofenceLat(lat); setGeofenceLon(lon) }
    else if (!isEdit && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { setGeofenceLat(pos.coords.latitude); setGeofenceLon(pos.coords.longitude) },
        () => { /* fica o centro de Lisboa */ },
      )
    }
  }

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Indique o nome da obra.'); return }
    if (form.dataInicio && form.dataPrevistaFim && form.dataPrevistaFim < form.dataInicio) {
      toast.error('A data prevista de fim não pode ser anterior ao início.')
      return
    }
    const orcamento = form.orcamento.trim() === '' ? null : Number(form.orcamento)
    if (orcamento != null && (!Number.isFinite(orcamento) || orcamento < 0)) { toast.error('Orçamento inválido.'); return }

    const obraId = await guardar({
      id: id ?? null, nome: form.nome, cliente: form.cliente, morada: form.morada, localizacao: form.localizacao,
      latitude: lat, longitude: lon, estado: form.estado, dataInicio: form.dataInicio, dataPrevistaFim: form.dataPrevistaFim,
      orcamento, responsavelId: form.responsavelId, engenheiroId: form.engenheiroId, tipoObra: form.tipoObra,
      descricao: form.descricao, observacoes: form.observacoes,
    })
    if (!obraId) { toast.error('Não foi possível guardar a obra.'); return }

    // A geofence tem o seu próprio caminho (não faz parte de obra_guardar)
    if (geofenceAtiva || obraGeofence?.geofenceTipo) {
      const ok = await atualizar(obraId, geofenceAtiva
        ? { geofenceTipo: 'RAIO', geofenceCentroLat: geofenceLat, geofenceCentroLon: geofenceLon, geofenceRaioM: geofenceRaio }
        : { geofenceTipo: null })
      if (!ok) toast.error('Obra guardada, mas não foi possível guardar a geofence.')
    }
    toast.success(isEdit ? 'Obra atualizada.' : 'Obra criada.')
    navigate(`/obras/${obraId}`)
  }

  const arquivar = async () => {
    if (!id) return
    const ok = await atualizar(id, { active: false })
    if (ok) { toast.success('Obra arquivada.'); navigate('/obras') }
    else toast.error('Não foi possível arquivar.')
  }

  if (isEdit && visaoLoading && !visao) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <Cabecalho titulo={isEdit ? 'Editar obra' : 'Nova obra'} subtitulo="Dados, prazos, localização e responsáveis" />

      <form onSubmit={submeter} className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <Campo id="obra-nome" rotulo="Nome da obra">
            <input id="obra-nome" type="text" value={form.nome} onChange={e => set({ nome: e.target.value })} className={inputCls} placeholder="Ex.: Moradia em Cascais" required />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="obra-cliente" rotulo="Cliente" opcional>
              <input id="obra-cliente" type="text" value={form.cliente} onChange={e => set({ cliente: e.target.value })} className={inputCls} placeholder="Dono da obra" />
            </Campo>
            <Campo id="obra-tipo" rotulo="Tipo de obra" opcional>
              <input id="obra-tipo" type="text" value={form.tipoObra} onChange={e => set({ tipoObra: e.target.value })} className={inputCls} placeholder="Ex.: Reabilitação" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="obra-estado" rotulo="Estado">
              <select id="obra-estado" value={form.estado} onChange={e => set({ estado: e.target.value as EstadoObra })} className={inputCls}>
                {ESTADOS_OBRA.map(e => <option key={e.valor} value={e.valor}>{e.rotulo}</option>)}
              </select>
            </Campo>
            <Campo id="obra-orcamento" rotulo="Orçamento (€)" opcional>
              <input id="obra-orcamento" type="number" inputMode="decimal" min="0" step="0.01" value={form.orcamento} onChange={e => set({ orcamento: e.target.value })} className={inputCls} placeholder="0,00" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="obra-inicio" rotulo="Início" opcional>
              <input id="obra-inicio" type="date" value={form.dataInicio} onChange={e => set({ dataInicio: e.target.value })} className={inputCls} />
            </Campo>
            <Campo id="obra-fim" rotulo="Fim previsto" opcional>
              <input id="obra-fim" type="date" min={form.dataInicio || undefined} value={form.dataPrevistaFim} onChange={e => set({ dataPrevistaFim: e.target.value })} className={inputCls} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="obra-responsavel" rotulo="Responsável" opcional>
              <select id="obra-responsavel" value={form.responsavelId} onChange={e => set({ responsavelId: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo id="obra-engenheiro" rotulo="Engenheiro" opcional>
              <select id="obra-engenheiro" value={form.engenheiroId} onChange={e => set({ engenheiroId: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <Campo id="obra-descricao" rotulo="Descrição" opcional>
            <textarea id="obra-descricao" value={form.descricao} onChange={e => set({ descricao: e.target.value })} className={`${inputCls} resize-none`} rows={3} placeholder="Âmbito dos trabalhos" />
          </Campo>
          <Campo id="obra-observacoes" rotulo="Observações" opcional>
            <textarea id="obra-observacoes" value={form.observacoes} onChange={e => set({ observacoes: e.target.value })} className={`${inputCls} resize-none`} rows={2} />
          </Campo>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 className="font-medium text-sm">Localização</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="obra-morada" rotulo="Morada" opcional>
              <input id="obra-morada" type="text" value={form.morada} onChange={e => set({ morada: e.target.value })} className={inputCls} placeholder="Rua, nº, código postal" />
            </Campo>
            <Campo id="obra-localizacao" rotulo="Zona" opcional>
              <input id="obra-localizacao" type="text" value={form.localizacao} onChange={e => set({ localizacao: e.target.value })} className={inputCls} placeholder="Concelho / zona" />
            </Campo>
          </div>
          <MapaPicker latitude={lat} longitude={lon} morada={form.morada || form.localizacao}
            onChange={(la, lo) => { setLat(la); setLon(lo) }} />
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="font-medium text-sm">Geofence (validação por localização)</span>
              {!geofenceAtiva && (
                <p className="text-xs text-muted-foreground mt-1">
                  Quando ativo, colaboradores dentro do raio configurado com GPS preciso são automaticamente autorizados ao picar.
                </p>
              )}
            </div>
            <button type="button" role="switch" aria-checked={geofenceAtiva} aria-label="Ativar geofence" onClick={() => ativarGeofence(!geofenceAtiva)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${geofenceAtiva ? 'bg-primary' : 'bg-muted'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full transition-transform ${geofenceAtiva ? 'translate-x-6 bg-primary-foreground' : 'translate-x-1 bg-foreground'}`} />
            </button>
          </div>
          {geofenceAtiva && (
            <Suspense fallback={<div className="h-[280px] rounded-xl bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">A carregar mapa…</div>}>
              <GeofenceConfig lat={geofenceLat} lon={geofenceLon} raioM={geofenceRaio}
                onCentroChange={(la, lo) => { setGeofenceLat(la); setGeofenceLon(lo) }} onRaioChange={setGeofenceRaio} />
            </Suspense>
          )}
        </div>

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent flex gap-3">
          <button type="submit" disabled={aProcessar} className={`${botaoPrimario} flex-1 py-4 text-base`}>
            {aProcessar ? 'A guardar…' : isEdit ? 'Guardar alterações' : 'Criar obra'}
          </button>
          {isEdit && (
            <button type="button" onClick={arquivar} disabled={aProcessar}
              className="px-4 py-4 bg-secondary/20 text-foreground rounded-xl font-medium hover:bg-secondary/30 transition-all flex items-center gap-2">
              <Archive className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Arquivar</span>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
