import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Camera, X } from 'lucide-react'
import { useFichaViatura, useCatalogo, useRegistarChecklist } from '../hooks/useFrota'
import {
  itensChecklistDaViatura, agruparPorCategoria, rotuloCategoria, estadoGeral, numeroOuNulo, hojeIso, ESTADOS_ITEM,
} from '../lib/frota'
import type { EstadoItem } from '../db'
import { Cabecalho, Seccao, BadgeEstado, inputCls, botaoPrimario, botaoSecundario } from './ui'

const MAX_FOTOS = 6

const COR_BOTAO: Record<EstadoItem, string> = {
  OK:      'bg-success text-white border-success',
  ATENCAO: 'bg-warning text-white border-warning',
  MAU:     'bg-destructive text-white border-destructive',
}

type Resposta = { estado: EstadoItem | null; observacao: string }

export function ChecklistPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ficha } = useFichaViatura(id)
  const { catalogo, loading: aCarregar } = useCatalogo()
  const { registar, loading } = useRegistarChecklist()

  const itens = useMemo(() => itensChecklistDaViatura(catalogo, ficha?.itens ?? []), [catalogo, ficha])
  const grupos = agruparPorCategoria(itens)

  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [data, setData] = useState(hojeIso())
  const [km, setKm] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  // Uma URL por foto enquanto está no ecrã; libertada ao sair ou ao remover
  const previews = useMemo(() => fotos.map(f => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  const resposta = (itemId: string): Resposta => respostas[itemId] ?? { estado: null, observacao: '' }
  const responder = (itemId: string, p: Partial<Resposta>) =>
    setRespostas(prev => ({ ...prev, [itemId]: { ...resposta(itemId), ...p } }))

  const respondidos = itens.filter(i => resposta(i.id).estado !== null)
  const faltam = itens.length - respondidos.length
  const geral = estadoGeral(respondidos.map(i => resposta(i.id).estado!))

  const todosOk = () => setRespostas(prev => {
    const novo = { ...prev }
    for (const i of itens) if (!novo[i.id]?.estado) novo[i.id] = { estado: 'OK', observacao: novo[i.id]?.observacao ?? '' }
    return novo
  })

  const juntarFotos = (lista: FileList | null) => {
    if (!lista) return
    const novas = [...fotos, ...Array.from(lista).filter(f => f.type.startsWith('image/'))]
    if (novas.length > MAX_FOTOS) toast.error(`No máximo ${MAX_FOTOS} fotos por checklist.`)
    setFotos(novas.slice(0, MAX_FOTOS))
  }

  const guardar = async () => {
    if (!id) return
    if (itens.length === 0) { toast.error('Esta viatura não tem itens de checklist.'); return }
    if (faltam > 0) { toast.error(`Falta avaliar ${faltam} ite${faltam > 1 ? 'ns' : 'm'}.`); return }
    const semNota = itens.filter(i => resposta(i.id).estado !== 'OK' && !resposta(i.id).observacao.trim())
    if (semNota.length) { toast.error(`Descreva o problema em: ${semNota.map(i => i.rotulo).join(', ')}.`); return }
    const kmN = numeroOuNulo(km)
    if (kmN !== null && (!Number.isFinite(kmN) || kmN < 0)) { toast.error('Km inválidos.'); return }

    const ok = await registar({
      veiculoId: id, data, km: kmN, observacoes: observacoes.trim() || null, fotos,
      itens: itens.map(i => ({ itemId: i.id, estado: resposta(i.id).estado!, observacao: resposta(i.id).observacao })),
    })
    if (ok) { toast.success('Checklist registado.'); navigate(`/frota/viatura/${id}`) }
  }

  if (aCarregar && catalogo.length === 0) return <div className="max-w-2xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-32">
      <Cabecalho titulo="Ficha de revisão" subtitulo={ficha ? `${ficha.viatura.nome} — checklist de inspeção` : undefined}
        acoes={faltam > 0 && itens.length > 0 ? <button onClick={todosOk} className={botaoSecundario}>Restantes OK</button> : undefined} />

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium space-y-2">Data
          <input type="date" value={data} max={hojeIso()} onChange={e => setData(e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm font-medium space-y-2">Km <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
          <input inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} className={inputCls}
            placeholder={ficha?.kmAtual != null ? String(ficha.kmAtual) : 'Ex: 125430'} />
        </label>
      </div>

      {grupos.map(g => (
        <Seccao key={g.categoria} titulo={rotuloCategoria(g.categoria)}>
          <ul className="divide-y divide-border">
            {g.itens.map(i => {
              const r = resposta(i.id)
              return (
                <li key={i.id} className="py-3 space-y-2">
                  <p className="text-sm">{i.rotulo}</p>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={i.rotulo}>
                    {ESTADOS_ITEM.map(e => (
                      <button key={e.valor} type="button" role="radio" aria-checked={r.estado === e.valor}
                        onClick={() => responder(i.id, { estado: e.valor })}
                        className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                          r.estado === e.valor ? COR_BOTAO[e.valor] : 'bg-background border-border text-muted-foreground'}`}>
                        {e.rotulo}
                      </button>
                    ))}
                  </div>
                  {r.estado && r.estado !== 'OK' && (
                    <input value={r.observacao} onChange={e => responder(i.id, { observacao: e.target.value })} className={inputCls}
                      placeholder="O que foi encontrado? (obrigatório)" aria-label={`Observação: ${i.rotulo}`} />
                  )}
                </li>
              )
            })}
          </ul>
        </Seccao>
      ))}

      {itens.length === 0 && ficha && (
        <p className="text-sm text-muted-foreground text-center py-6">Esta viatura não tem itens de checklist ativos.</p>
      )}

      <Seccao titulo="Fotos e observações">
        <div className="flex gap-2 flex-wrap">
          {fotos.map((f, idx) => (
            <div key={`${f.name}-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border bg-muted">
              <img src={previews[idx]} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
              <button type="button" aria-label="Remover foto" onClick={() => setFotos(fotos.filter((_, j) => j !== idx))}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground cursor-pointer hover:bg-accent/40">
              <Camera className="w-5 h-5" aria-hidden="true" /> Foto
              <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                onChange={e => { juntarFotos(e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className={`${inputCls} resize-none`} rows={2}
          placeholder="Observações gerais (opcional)" aria-label="Observações gerais" />
      </Seccao>

      <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/90 backdrop-blur-sm flex items-center gap-3">
        <div className="text-sm shrink-0">
          {faltam > 0 ? <span className="text-muted-foreground">Faltam {faltam}</span> : <BadgeEstado estado={geral} />}
        </div>
        <button onClick={guardar} disabled={loading || itens.length === 0} className={`${botaoPrimario} flex-1 py-4 text-base`}>
          {loading ? 'A enviar…' : 'Registar checklist'}
        </button>
      </div>
    </div>
  )
}
