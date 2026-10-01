import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { useCatalogo, useGuardarItemCatalogo } from '../hooks/useFrota'
import { ordenar, agruparPorCategoria, rotuloCategoria, textoIntervalo, CATEGORIAS } from '../lib/frota'
import type { DadosItemCatalogo } from '../services/frotaService'
import { semAcentos } from '../lib/manutencao'
import { validarItem, type FormItem as Form } from '../lib/validarItem'
import type { ItemCatalogoRow, Categoria, Natureza } from '../db'
import { Cabecalho, Seccao, inputCls, botaoPrimario, botaoSecundario } from './ui'

const VAZIO: Form = {
  rotulo: '', categoria: 'REVISAO_PERIODICA', natureza: 'MANUTENCAO', intervaloKm: '', intervaloMeses: '',
  limiarAtencaoKm: '2000', limiarUrgenteKm: '500', limiarAtencaoDias: '30', limiarUrgenteDias: '7', ativo: true,
}

function deItem(i: ItemCatalogoRow): Form {
  return {
    rotulo: i.rotulo, categoria: i.categoria, natureza: i.natureza,
    intervaloKm: i.intervalo_km_padrao?.toString() ?? '', intervaloMeses: i.intervalo_meses_padrao?.toString() ?? '',
    limiarAtencaoKm: String(i.limiar_atencao_km), limiarUrgenteKm: String(i.limiar_urgente_km),
    limiarAtencaoDias: String(i.limiar_atencao_dias), limiarUrgenteDias: String(i.limiar_urgente_dias),
    ativo: i.ativo,
  }
}

function Editor({ inicial, aGuardar, onGuardar, onCancelar }: {
  inicial: Form; aGuardar: boolean; onGuardar: (d: DadosItemCatalogo) => void; onCancelar: () => void
}) {
  const [f, setF] = useState(inicial)
  const set = (p: Partial<Form>) => setF(prev => ({ ...prev, ...p }))
  const guardar = (e: React.FormEvent) => {
    e.preventDefault()
    const r = validarItem(f)
    if (typeof r === 'string') { toast.error(r); return }
    onGuardar(r)
  }
  return (
    <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/40 rounded-xl p-3">
      <label className="sm:col-span-2 text-xs font-medium space-y-1">Nome do item
        <input value={f.rotulo} onChange={e => set({ rotulo: e.target.value })} className={inputCls} placeholder="Ex: Óleo da grua" required />
      </label>
      <label className="text-xs font-medium space-y-1">Categoria
        <select value={f.categoria} onChange={e => set({ categoria: e.target.value as Categoria })} className={inputCls}>
          {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium space-y-1">Tipo
        <select value={f.natureza} onChange={e => set({ natureza: e.target.value as Natureza })} className={inputCls}>
          <option value="MANUTENCAO">Manutenção / prazo (gera alertas)</option>
          <option value="CHECKLIST">Verificação no checklist (sem prazo)</option>
        </select>
      </label>
      {f.natureza === 'MANUTENCAO' && (
        <>
          <label className="text-xs font-medium space-y-1">Intervalo por omissão (km)
            <input inputMode="numeric" value={f.intervaloKm} onChange={e => set({ intervaloKm: e.target.value })} className={inputCls} placeholder="Vazio = sem prazo em km" />
          </label>
          <label className="text-xs font-medium space-y-1">Intervalo por omissão (meses)
            <input inputMode="numeric" value={f.intervaloMeses} onChange={e => set({ intervaloMeses: e.target.value })} className={inputCls} placeholder="Vazio = sem prazo em meses" />
          </label>
          <label className="text-xs font-medium space-y-1">Avisar a partir de (km antes)
            <input inputMode="numeric" value={f.limiarAtencaoKm} onChange={e => set({ limiarAtencaoKm: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium space-y-1">Urgente a partir de (km antes)
            <input inputMode="numeric" value={f.limiarUrgenteKm} onChange={e => set({ limiarUrgenteKm: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium space-y-1">Avisar a partir de (dias antes)
            <input inputMode="numeric" value={f.limiarAtencaoDias} onChange={e => set({ limiarAtencaoDias: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium space-y-1">Urgente a partir de (dias antes)
            <input inputMode="numeric" value={f.limiarUrgenteDias} onChange={e => set({ limiarUrgenteDias: e.target.value })} className={inputCls} />
          </label>
        </>
      )}
      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.ativo} onChange={e => set({ ativo: e.target.checked })} className="w-4 h-4" />
        Ativo <span className="text-xs text-muted-foreground">(desativar esconde o item sem apagar o histórico)</span>
      </label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={aGuardar} className={botaoPrimario}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
        <button type="button" onClick={onCancelar} disabled={aGuardar} className={botaoSecundario}>Cancelar</button>
      </div>
    </form>
  )
}

export function CatalogoPage() {
  const { catalogo, loading } = useCatalogo()
  const { criar, atualizar, loading: aGuardar } = useGuardarItemCatalogo()
  const { podeFrota } = useRole()
  const [aEditar, setAEditar] = useState<string | 'novo' | null>(null)
  const [procura, setProcura] = useState('')
  const [verInativos, setVerInativos] = useState(true)

  const grupos = useMemo(() => {
    const t = semAcentos(procura.trim())
    return agruparPorCategoria(ordenar(catalogo.filter(i =>
      (verInativos || i.ativo || i.id === aEditar) && (!t || semAcentos(i.rotulo).includes(t)))))
  }, [catalogo, procura, verInativos, aEditar])

  const guardarNovo = async (d: DadosItemCatalogo) => {
    if (await criar(d)) { toast.success('Item criado.'); setAEditar(null) }
  }
  const guardarEdicao = async (id: string, d: DadosItemCatalogo) => {
    if (await atualizar(id, d)) { toast.success('Item guardado.'); setAEditar(null) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <Cabecalho titulo="Ficha de revisão — itens e intervalos" subtitulo="Itens do checklist e prazos de manutenção — valem para todas as viaturas"
        acoes={podeFrota && aEditar !== 'novo' ? (
          <button onClick={() => setAEditar('novo')} className={botaoPrimario}><Plus className="w-4 h-4" aria-hidden="true" /> Novo item</button>
        ) : undefined} />

      {aEditar === 'novo' && (
        <Seccao titulo="Novo item">
          <Editor inicial={VAZIO} aGuardar={aGuardar} onGuardar={guardarNovo} onCancelar={() => setAEditar(null)} />
        </Seccao>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input value={procura} onChange={e => setProcura(e.target.value)} className={`${inputCls} pl-10`}
            placeholder="Procurar item…" aria-label="Procurar item" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={verInativos} onChange={e => setVerInativos(e.target.checked)} className="w-4 h-4" />
          Mostrar desativados
        </label>
      </div>

      {loading && catalogo.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>}

      {grupos.map(g => (
        <Seccao key={g.categoria} titulo={rotuloCategoria(g.categoria)}>
          <ul className="divide-y divide-border">
            {g.itens.map(i => (
              <li key={i.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm ${i.ativo ? 'font-medium' : 'text-muted-foreground line-through'}`}>{i.rotulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.natureza === 'CHECKLIST' ? 'Verificação no checklist'
                        : `${textoIntervalo(i.intervalo_km_padrao, i.intervalo_meses_padrao)} · aviso ${i.limiar_atencao_dias} dias / ${i.limiar_atencao_km.toLocaleString('pt-PT')} km antes`}
                      {!i.ativo && ' · desativado'}
                    </p>
                  </div>
                  {podeFrota && aEditar !== i.id && (
                    <button onClick={() => setAEditar(i.id)} className="text-sm text-primary font-medium shrink-0">Editar</button>
                  )}
                </div>
                {aEditar === i.id && (
                  <Editor inicial={deItem(i)} aGuardar={aGuardar} onGuardar={d => guardarEdicao(i.id, d)} onCancelar={() => setAEditar(null)} />
                )}
              </li>
            ))}
          </ul>
        </Seccao>
      ))}
    </div>
  )
}
