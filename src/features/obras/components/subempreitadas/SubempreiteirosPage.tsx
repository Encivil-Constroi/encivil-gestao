import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CampoSelect } from '@/app/components/CampoSelect'
import { useObras } from '../../hooks/useObras'
import { SubResumoLista } from './SubResumoLista'
import { PainelCEO } from './painel/PainelCEO'
import { useResumoSubs } from './useSubData'

export function SubempreiteirosPage() {
  const [params] = useSearchParams()
  const [obraId, setObraId] = useState(params.get('obra') ?? '')
  const { obras } = useObras(true)
  const { subs, loading, error, reload } = useResumoSubs(obraId || null)
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{subs.length} contratações · saúde, execução e ocorrências</p>
    <label className="grid gap-1.5 rounded-2xl border border-border bg-card p-4 text-sm font-medium">Filtrar por obra
      <div className="sm:max-w-sm"><CampoSelect value={obraId} onChange={e => setObraId(e.target.value)}><option value="">Todas as obras</option>{obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</CampoSelect></div>
    </label>
    <PainelCEO obraId={obraId || null} />
    <h2 className="text-base font-semibold">Contratações</h2>
    {loading && <p role="status">A carregar subempreitadas…</p>}
    {error && <p role="alert">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {!loading && !error && <SubResumoLista subs={subs} />}
  </div>
}
