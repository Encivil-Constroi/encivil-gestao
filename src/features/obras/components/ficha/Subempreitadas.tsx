import { Link } from 'react-router'
import { useRole } from '@/features/auth/useRole'
import { SubResumoLista } from '../subempreitadas/SubResumoLista'
import { PainelCEO } from '../subempreitadas/painel/PainelCEO'
import { useResumoSubs } from '../subempreitadas/useSubData'
import type { SecaoProps } from './tipos'

export function Subempreitadas({ obraId }: SecaoProps) {
  const { subs, loading, error, reload } = useResumoSubs(obraId)
  const { podeSubempreitadas } = useRole()
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Subempreitadas da obra</h2><div className="flex gap-2"><Link className="rounded-xl border border-border px-3 py-2 text-sm" to={`/obras/subempreitadas?obra=${obraId}`}>Ver lista geral</Link>{podeSubempreitadas && <Link className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground" to={`/obras/subempreitada/novo?obra=${obraId}`}>Nova contratação</Link>}</div></div><PainelCEO obraId={obraId} />{loading &&<p role="status">A carregar…</p>}{error && <p role="alert">{error} <button onClick={reload}>Tentar de novo</button></p>}{!loading && !error && <SubResumoLista subs={subs} />}</section>
}
