import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useObras } from '../../hooks/useObras'
import { useRole } from '@/features/auth/useRole'
import { SubResumoLista } from './SubResumoLista'
import { PainelCEO } from './painel/PainelCEO'
import { useResumoSubs } from './useSubData'

export function SubempreiteirosPage() {
  const [params] = useSearchParams()
  const [obraId, setObraId] = useState(params.get('obra') ?? '')
  const { obras } = useObras(true)
  const { podeSubempreitadas } = useRole()
  const { subs, loading, error, reload } = useResumoSubs(obraId || null)
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Subempreitadas</h1><p className="text-sm text-muted-foreground">{subs.length} contratações · saúde, execução e ocorrências</p></div>{podeSubempreitadas && <Link to="/obras/subempreitada/novo" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Nova contratação</Link>}</div>
    <label className="block rounded-2xl border border-border bg-card p-4 text-sm">Filtrar por obra<select className="mt-2 block w-full rounded-xl border border-input bg-input-background p-3 sm:max-w-sm" value={obraId} onChange={e => setObraId(e.target.value)}><option value="">Todas as obras</option>{obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <PainelCEO obraId={obraId || null} />
    <h2 className="text-lg font-semibold">Contratações</h2>
    {loading && <p role="status">A carregar subempreitadas…</p>}
    {error && <p role="alert">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {!loading && !error && <SubResumoLista subs={subs} />}
  </div>
}
