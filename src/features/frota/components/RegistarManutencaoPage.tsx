import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useFichaViatura, useCatalogo, useRegistarManutencao } from '../hooks/useFrota'
import { ordenar, agruparPorCategoria, rotuloCategoria, textoIntervalo, numeroOuNulo, hojeIso } from '../lib/frota'
import { Cabecalho, inputCls, botaoPrimario } from './ui'

const OUTRO = 'outro'

export function RegistarManutencaoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ficha } = useFichaViatura(id)
  const { catalogo } = useCatalogo()
  const { registar, loading } = useRegistarManutencao()

  const grupos = useMemo(() =>
    agruparPorCategoria(ordenar(catalogo.filter(i => i.ativo && i.natureza === 'MANUTENCAO'))), [catalogo])

  const [f, setF] = useState({
    itemId: '', descricao: '', data: hojeIso(), km: '', custo: '', oficina: '', observacoes: '',
    atualiza: true, proximaData: '',
  })
  const set = (p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p }))

  const item = catalogo.find(i => i.id === f.itemId)
  const config = ficha?.itens.find(c => c.item_id === f.itemId)
  const intervaloKm = config?.intervalo_km ?? item?.intervalo_km_padrao ?? null
  const intervaloMeses = config?.intervalo_meses ?? item?.intervalo_meses_padrao ?? null
  const kmObrigatorio = !!item && f.atualiza && intervaloKm !== null

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    if (!f.itemId) { toast.error('Escolha o que foi feito.'); return }
    if (f.itemId === OUTRO && !f.descricao.trim()) { toast.error('Descreva o trabalho feito.'); return }
    const km = numeroOuNulo(f.km)
    const custo = numeroOuNulo(f.custo)
    if (km !== null && (!Number.isFinite(km) || km < 0)) { toast.error('Km inválidos.'); return }
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) { toast.error('Custo inválido.'); return }
    if (kmObrigatorio && km === null) { toast.error('Indique os km: este item tem prazo em km.'); return }

    const ok = await registar({
      veiculoId: id,
      itemId: f.itemId === OUTRO ? null : f.itemId,
      descricao: f.descricao.trim() || null,
      data: f.data, km, custo,
      oficina: f.oficina.trim() || null,
      observacoes: f.observacoes.trim() || null,
      atualizaProxima: f.itemId !== OUTRO && f.atualiza,
      proximaData: f.itemId !== OUTRO && f.atualiza && f.proximaData ? f.proximaData : null,
    })
    if (ok) { toast.success('Manutenção registada.'); navigate(`/frota/viatura/${id}`) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <Cabecalho titulo="Registar manutenção" subtitulo={ficha?.viatura.nome} />

      <form onSubmit={guardar} className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <label className="block text-sm font-medium space-y-2">O que foi feito <span className="text-destructive">*</span>
          <select value={f.itemId} onChange={e => set({ itemId: e.target.value })} className={inputCls} required>
            <option value="">— Escolher —</option>
            {grupos.map(g => (
              <optgroup key={g.categoria} label={rotuloCategoria(g.categoria)}>
                {g.itens.map(i => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
              </optgroup>
            ))}
            <option value={OUTRO}>Outro trabalho (reparação avulsa)</option>
          </select>
        </label>

        {(f.itemId === OUTRO || item) && (
          <label className="block text-sm font-medium space-y-2">
            {f.itemId === OUTRO ? <>Descrição <span className="text-destructive">*</span></> : 'Descrição (opcional)'}
            <input value={f.descricao} onChange={e => set({ descricao: e.target.value })} className={inputCls}
              placeholder={f.itemId === OUTRO ? 'Ex: substituição da lâmpada do farol esquerdo' : 'Ex: óleo 5W30, filtro Mann'} />
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm font-medium space-y-2">Data <span className="text-destructive">*</span>
            <input type="date" value={f.data} max={hojeIso()} onChange={e => set({ data: e.target.value })} className={inputCls} required />
          </label>
          <label className="block text-sm font-medium space-y-2">
            Km da viatura {kmObrigatorio ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal text-xs">(opcional)</span>}
            <input inputMode="numeric" value={f.km} onChange={e => set({ km: e.target.value })} className={inputCls}
              placeholder={ficha?.kmAtual != null ? `Último conhecido: ${ficha.kmAtual}` : 'Ex: 125430'} />
          </label>
          <label className="block text-sm font-medium space-y-2">Custo (€) <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            <input inputMode="decimal" value={f.custo} onChange={e => set({ custo: e.target.value })} className={inputCls} placeholder="Ex: 85,50" />
          </label>
          <label className="block text-sm font-medium space-y-2">Oficina <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            <input value={f.oficina} onChange={e => set({ oficina: e.target.value })} className={inputCls} placeholder="Ex: Polo 2 / oficina externa" />
          </label>
        </div>

        {item && (
          <div className="rounded-xl bg-muted/40 p-3 space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={f.atualiza} onChange={e => set({ atualiza: e.target.checked })} className="mt-1 w-4 h-4" />
              <span>
                Recomeçar o prazo a partir desta manutenção
                <span className="block text-xs text-muted-foreground">
                  {intervaloKm || intervaloMeses
                    ? `Próximo prazo calculado sozinho: ${textoIntervalo(intervaloKm, intervaloMeses)}.`
                    : 'Este item não tem intervalo — indique a próxima data abaixo.'}
                  {' '}Desligue para reparações que não reiniciam o prazo.
                </span>
              </span>
            </label>
            {f.atualiza && (
              <label className="block text-xs font-medium space-y-1">
                Válido até / próxima data <span className="text-muted-foreground font-normal">(opcional — substitui o cálculo; ex.: seguro renovado até…)</span>
                <input type="date" value={f.proximaData} min={f.data} onChange={e => set({ proximaData: e.target.value })} className={inputCls} />
              </label>
            )}
          </div>
        )}

        <label className="block text-sm font-medium space-y-2">Observações <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
          <textarea value={f.observacoes} onChange={e => set({ observacoes: e.target.value })} className={`${inputCls} resize-none`} rows={2} />
        </label>

        <button type="submit" disabled={loading} className={`${botaoPrimario} w-full py-4 text-base`}>
          {loading ? 'A guardar…' : 'Registar manutenção'}
        </button>
      </form>
    </div>
  )
}
