import { useProtegerFormulario } from '@/app/lib/protegerSaida'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, AlertTriangle, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { FotoInput } from '@/app/components/FotoInput'
import {
  useFerramenta, useCriarFerramenta, useAtualizarFerramenta, useNumeroSerieRepetido,
} from '@/features/ferramentas/hooks/useFerramentas'
import {
  CATEGORIAS_FERRAMENTA, estadoGarantia, textoGarantia, somarAnos, hojeIso,
} from '@/features/ferramentas/lib/estadoFerramenta'
import { Campo, Carregando, inputCls, useExigePermissaoFerramentas } from '@/features/ferramentas/components/ui'
import type { ToolCategory } from '@/app/types'

export function FerramentaFormPage() {
  const { id } = useParams()
  const editar = !!id
  const navigate = useNavigate()
  const refForm = useProtegerFormulario()
  const permitido = useExigePermissaoFerramentas()

  const { tool, loading: aCarregar } = useFerramenta(id)
  const { criar, loading: aCriar } = useCriarFerramenta()
  const { atualizar, loading: aAtualizar } = useAtualizarFerramenta()
  const aGuardar = aCriar || aAtualizar

  // Id gerado no browser: a foto sobe para ferramentas/<id>/ antes de a linha existir
  const [novoId] = useState(() => crypto.randomUUID())
  const ferramentaId = id ?? novoId

  const [f, setF] = useState({
    nome: '', categoria: 'outro' as ToolCategory, marca: '', modelo: '', serie: '',
    valor: '', observacoes: '', nova: false, dataCompra: '', garantiaAte: '',
  })
  const [foto, setFoto] = useState<string | null>(null)
  const [erroForm, setErroForm] = useState<string | null>(null)

  useEffect(() => {
    if (!tool) return
    setF({
      nome: tool.name, categoria: tool.category, marca: tool.marca ?? '', modelo: tool.modelo ?? '',
      serie: tool.serialNumber ?? '', valor: tool.estimatedValue != null ? String(tool.estimatedValue) : '',
      observacoes: tool.notes ?? '', nova: tool.nova, dataCompra: tool.dataCompra ?? '', garantiaAte: tool.garantiaAte ?? '',
    })
    setFoto(tool.fotoPath ?? null)
  }, [tool])

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))

  const { repetida } = useNumeroSerieRepetido(f.serie, id)
  const garantia = useMemo(() => estadoGarantia(f.nova ? f.garantiaAte || null : null), [f.nova, f.garantiaAte])
  const garantiaInvalida = f.nova && !!f.dataCompra && !!f.garantiaAte && f.garantiaAte < f.dataCompra

  if (!permitido || (editar && aCarregar)) return <Carregando />
  if (editar && !tool) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Ferramenta não encontrada</h2>
        <button onClick={() => navigate('/armazem/ferramentas')} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl">Voltar</button>
      </div>
    )
  }

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroForm(null)
    if (!f.nome.trim()) { setErroForm('Indique o nome da ferramenta.'); return }
    if (garantiaInvalida) { setErroForm('A garantia não pode terminar antes da data de compra.'); return }
    if (repetida) { setErroForm(`O n.º de série já existe na ferramenta ${repetida.code} · ${repetida.name}.`); return }

    const entrada = {
      name: f.nome.trim(),
      category: f.categoria,
      serialNumber: f.serie.trim(),
      estimatedValue: f.valor ? parseFloat(f.valor) : undefined,
      notes: f.observacoes.trim(),
      fotoPath: foto,
      marca: f.marca,
      modelo: f.modelo,
      nova: f.nova,
      dataCompra: f.nova && f.dataCompra ? f.dataCompra : null,
      garantiaAte: f.nova && f.garantiaAte ? f.garantiaAte : null,
    }
    const r = editar ? await atualizar(id!, entrada) : await criar({ ...entrada, id: novoId })
    if (r) {
      toast.success(editar ? 'Ferramenta atualizada.' : 'Ferramenta criada.')
      navigate(`/armazem/ferramenta/${r.id}`, { replace: true })
    } else {
      toast.error(editar ? 'Não foi possível atualizar a ferramenta.' : 'Não foi possível criar a ferramenta.')
    }
  }

  const atalho = 'px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-accent disabled:opacity-40'

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h2 className="text-xl font-semibold">{editar ? 'Editar ferramenta' : 'Nova ferramenta'}</h2>
          <p className="text-sm text-muted-foreground">{editar ? tool?.code : 'O código é gerado automaticamente'}</p>
        </div>
      </div>

      <form ref={refForm} onSubmit={submeter} className="space-y-4" noValidate>
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <FotoInput dono={{ tipo: 'ferramentas', id: ferramentaId }} valor={foto} onChange={setFoto} rotulo="Foto da ferramenta" />

          <Campo rotulo="Nome" htmlFor="ferr-nome">
            <input id="ferr-nome" className={inputCls} value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Berbequim percutor" required />
          </Campo>
          <Campo rotulo="Categoria" htmlFor="ferr-cat">
            <select id="ferr-cat" className={inputCls} value={f.categoria} onChange={e => set('categoria', e.target.value as ToolCategory)}>
              {CATEGORIAS_FERRAMENTA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Marca" opcional htmlFor="ferr-marca">
              <input id="ferr-marca" className={inputCls} value={f.marca} onChange={e => set('marca', e.target.value)} placeholder="Bosch" />
            </Campo>
            <Campo rotulo="Modelo" opcional htmlFor="ferr-modelo">
              <input id="ferr-modelo" className={inputCls} value={f.modelo} onChange={e => set('modelo', e.target.value)} placeholder="GSB 13 RE" />
            </Campo>
          </div>
          <Campo rotulo="N.º de série" opcional htmlFor="ferr-serie"
            ajuda={repetida && (
              <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                Este n.º de série já existe em {repetida.code} · {repetida.name}.
              </p>
            )}>
            <input id="ferr-serie" className={`${inputCls} ${repetida ? 'border-destructive' : ''}`} value={f.serie} onChange={e => set('serie', e.target.value)} placeholder="SN-48213" />
          </Campo>
          <Campo rotulo="Valor estimado (€)" opcional htmlFor="ferr-valor">
            <input id="ferr-valor" type="number" min="0" step="0.01" className={inputCls} value={f.valor} onChange={e => set('valor', e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Observações" opcional htmlFor="ferr-obs">
            <textarea id="ferr-obs" rows={3} className={`${inputCls} resize-none`} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Acessórios incluídos, localização habitual…" />
          </Campo>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={f.nova} onChange={e => set('nova', e.target.checked)} className="w-5 h-5 accent-primary" />
            <span className="text-sm font-medium">É nova? <span className="text-muted-foreground font-normal">(compra recente, com garantia do fabricante)</span></span>
          </label>

          {f.nova && (
            <>
              <Campo rotulo="Data de compra" htmlFor="ferr-compra">
                <input id="ferr-compra" type="date" max={hojeIso()} className={inputCls} value={f.dataCompra} onChange={e => set('dataCompra', e.target.value)} />
              </Campo>
              <Campo rotulo="Garantia do fabricante até" htmlFor="ferr-garantia"
                ajuda={garantiaInvalida && (
                  <p role="alert" className="mt-1.5 text-xs text-destructive font-medium">A garantia não pode terminar antes da data de compra.</p>
                )}>
                <input id="ferr-garantia" type="date" min={f.dataCompra || undefined} className={inputCls} value={f.garantiaAte} onChange={e => set('garantiaAte', e.target.value)} />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[1, 2, 3].map(a => (
                    <button key={a} type="button" disabled={!f.dataCompra} className={atalho}
                      onClick={() => set('garantiaAte', somarAnos(f.dataCompra, a))}>
                      +{a} {a === 1 ? 'ano' : 'anos'}
                    </button>
                  ))}
                  {!f.dataCompra && <span className="text-xs text-muted-foreground self-center">Indique a data de compra para usar os atalhos.</span>}
                </div>
              </Campo>
              {(garantia.tipo === 'a_terminar' || garantia.tipo === 'expirada') && (
                <div role="alert" data-testid="alerta-garantia"
                  className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    garantia.tipo === 'expirada' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'}`}>
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  {textoGarantia(garantia)}
                </div>
              )}
            </>
          )}
        </div>

        {erroForm && <p role="alert" className="text-sm text-destructive font-medium">{erroForm}</p>}

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm">
          <div className="flex gap-3">
            <button type="submit" disabled={aGuardar}
              className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 shadow-md">
              {aGuardar ? 'A guardar…' : editar ? 'Guardar alterações' : 'Criar ferramenta'}
            </button>
            <button type="button" onClick={() => navigate(-1)} disabled={aGuardar}
              className="px-5 py-3.5 bg-secondary text-secondary-foreground rounded-xl font-medium">Cancelar</button>
          </div>
        </div>
      </form>
    </div>
  )
}
