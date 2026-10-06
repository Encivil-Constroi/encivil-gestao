import { useId, useRef, useState } from 'react'
import { Camera, Loader2, Trash2, WifiOff } from 'lucide-react'
import type { AutoEvidenciaRow, EvidenciaResultado } from '../../../db'
import { useApagarEvidencia, useEvidenciasAutoLista, useRegistarEvidencia } from '../../../hooks/useSubsControlo'
import { MOTIVO_EVIDENCIA, validarTiradaEm } from '../../../lib/geo'
import { urlFotoObra } from '../../../lib/fotosObras'
import { enviarEvidencia, obterGps, prepararEvidencia, type PosicaoGps } from '../../../lib/autoDados'

type Props = {
  autoId: string
  obraId: string
  podeAdicionar: boolean
  podeApagar: boolean
  idadeMaxMin: number
  minFotos: number
}

type Geo = { dentro: boolean | null; distancia: number | null; precisao: number | null; precisaoOk: boolean | null; valida: boolean; motivo: string | null }
type Pendente = { foto: File; tiradaEm: Date; gps: PosicaoGps | null }
type Resultado = EvidenciaResultado & { precisaoM: number | null; tiradaEm: Date }

const MOTIVOS: Record<string, string> = MOTIVO_EVIDENCIA
const hora = (d: Date) => d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const metros = (m: number) => `${Math.round(m).toLocaleString('pt-PT')} m`

export function textoLocal(g: Pick<Geo, 'dentro' | 'distancia'>): string {
  if (g.dentro === true) return `Dentro da obra ✓${g.distancia != null ? ` (${metros(g.distancia)})` : ''}`
  if (g.dentro === false) return `Fora ✗ (${g.distancia != null ? metros(g.distancia) : '?'})`
  return 'Localização da obra não comparada'
}

function ResumoGeo({ g }: { g: Geo }) {
  return (
    <ul className="text-xs space-y-0.5">
      <li className={g.dentro === false ? 'text-destructive font-medium' : g.dentro ? 'text-success font-medium' : 'text-muted-foreground'}>{textoLocal(g)}</li>
      <li className={g.precisaoOk === false ? 'text-destructive' : 'text-muted-foreground'}>
        Precisão do GPS: {g.precisao != null ? `±${metros(g.precisao)}` : 'sem GPS'}{g.precisaoOk === false ? ' (insuficiente)' : ''}
      </li>
      <li className={g.valida ? 'text-success' : 'text-destructive'}>
        {g.valida ? 'Conta como prova válida.' : `Não conta como prova: ${g.motivo ? MOTIVOS[g.motivo] ?? g.motivo : 'motivo desconhecido.'}`}
      </li>
    </ul>
  )
}

const deLinha = (e: AutoEvidenciaRow): Geo => ({
  dentro: e.dentro_obra, distancia: e.distancia_obra_m, precisao: e.precisao_m,
  precisaoOk: e.precisao_ok, valida: e.valida, motivo: e.motivo_invalida,
})

export function EvidenciaCapture({ autoId, obraId, podeAdicionar, podeApagar, idadeMaxMin, minFotos }: Props) {
  const id = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const { evidencias, loading, error: erroLista } = useEvidenciasAutoLista(autoId)
  const { registar, error: erroRegisto } = useRegistarEvidencia()
  const { apagar, loading: aApagar, error: erroApagar } = useApagarEvidencia()
  const [legenda, setLegenda] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const validas = evidencias.filter(e => e.valida).length

  const guardar = async (p: Pendente) => {
    setErro(null)
    setResultado(null)
    const erroHora = validarTiradaEm(p.tiradaEm, new Date(), idadeMaxMin)
    if (erroHora) { setErro(`${erroHora} Tire uma nova fotografia na obra.`); setPendente(null); return }
    if (!navigator.onLine) { setPendente(p); return }
    setAProcessar(true)
    try {
      const { ficheiro, hash } = await prepararEvidencia(p.foto)
      const path = await enviarEvidencia(obraId, ficheiro)
      const r = await registar({
        p_auto_id: autoId, p_path: path, p_legenda: legenda.trim() || null,
        p_lat: p.gps?.lat ?? null, p_lon: p.gps?.lon ?? null, p_precisao_m: p.gps?.precisaoM ?? null,
        p_tirada_em: p.tiradaEm.toISOString(), p_hash: hash, p_linha_id: null,
      })
      setPendente(null)
      if (r) { setResultado({ ...r, precisaoM: p.gps?.precisaoM ?? null, tiradaEm: p.tiradaEm }); setLegenda('') }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível guardar a fotografia.')
    } finally {
      setAProcessar(false)
    }
  }

  const aoFotografar = async (lista: FileList | null) => {
    const foto = lista?.[0]
    if (!foto) return
    if (foto.type && !foto.type.startsWith('image/')) { setErro('O ficheiro não é uma fotografia.'); return }
    const tiradaEm = new Date(foto.lastModified || Date.now())
    setAProcessar(true)
    const gps = await obterGps()
    setAProcessar(false)
    await guardar({ foto, tiradaEm, gps })
  }

  const erroServidor = erroRegisto ?? erroApagar

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-t`} className="font-semibold text-sm">Fotografias de prova</h2>
          <p className="text-xs text-muted-foreground">Tiradas na hora, na obra, com a câmara. Válidas: {validas} de {minFotos} necessárias.</p>
        </div>
      </div>

      {loading && <p role="status" className="text-sm text-muted-foreground">A carregar fotografias…</p>}
      {erroLista && <p role="alert" className="text-sm text-destructive">{erroLista}</p>}

      {evidencias.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {evidencias.map((e, i) => (
            <li key={e.id} className="flex gap-3 rounded-xl border border-border p-2">
              <img src={urlFotoObra(e.path) ?? ''} alt={e.legenda || `Fotografia ${i + 1}`} className="h-20 w-20 shrink-0 rounded-lg object-cover bg-muted" />
              <div className="min-w-0 flex-1 space-y-1">
                {e.legenda && <p className="text-sm font-medium truncate">{e.legenda}</p>}
                <ResumoGeo g={deLinha(e)} />
                <p className="text-xs text-muted-foreground">Tirada {hora(new Date(e.tirada_em))} · recebida {hora(new Date(e.enviada_em))}</p>
              </div>
              {podeApagar && (
                <button type="button" onClick={() => void apagar(e.id)} disabled={aApagar} aria-label={`Apagar fotografia ${i + 1}`}
                  className="self-start p-1.5 text-muted-foreground hover:text-destructive rounded-lg">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeAdicionar && (
        <div className="space-y-2">
          <label className="block text-sm">
            Legenda (opcional)
            <input value={legenda} onChange={e => setLegenda(e.target.value)} maxLength={300}
              className="mt-1 w-full px-3 py-2.5 bg-input-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <button type="button" onClick={() => camRef.current?.click()} disabled={aProcessar}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60">
            {aProcessar ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
            {aProcessar ? 'A guardar a fotografia…' : 'Tirar fotografia'}
          </button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" data-testid="evidencia-camera"
            onChange={e => { void aoFotografar(e.target.files); e.target.value = '' }} />
          <p className="text-xs text-muted-foreground">Só a câmara: fotografias da galeria não são aceites. A localização é pedida no momento.</p>
        </div>
      )}

      {pendente && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-2 text-sm">
          <p className="flex items-start gap-2"><WifiOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            Sem rede: a fotografia ficou pendente neste ecrã. É preciso rede para a guardar — a hora do servidor é a prova.</p>
          <button type="button" onClick={() => void guardar(pendente)} disabled={aProcessar}
            className="px-3 py-2 rounded-xl border border-border font-medium hover:bg-accent disabled:opacity-60">
            Tentar guardar agora
          </button>
        </div>
      )}

      {resultado && (
        <div role="status" className={`rounded-xl border p-3 space-y-1 ${resultado.valida ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'}`}>
          <p className="text-sm font-semibold">Fotografia guardada às {hora(resultado.tiradaEm)}</p>
          <ResumoGeo g={{ dentro: resultado.dentro_obra, distancia: resultado.distancia_m, precisao: resultado.precisaoM, precisaoOk: resultado.precisao_ok, valida: resultado.valida, motivo: resultado.motivo }} />
        </div>
      )}

      {(erro ?? erroServidor) && <p role="alert" className="text-sm text-destructive">{erro ?? erroServidor}</p>}
    </section>
  )
}
