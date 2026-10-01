import { FotosGaleria } from '../FotosGaleria'
import { urlFotoObra } from '../../lib/fotosObras'
import { useEvidenciasAuto } from './useSubData'

export function AutoEvidenciasView({ autoId, imprimivel = false }: { autoId: string; imprimivel?: boolean }) {
  const { evidencias, loading, error } = useEvidenciasAuto(autoId)
  if (loading) return <p role="status">A carregar evidências…</p>
  if (error) return <p role="alert">{error}</p>
  if (!evidencias) return null
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h2 className="font-semibold">Evidências da medição</h2><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Progresso físico</dt><dd>{evidencias.progresso_fisico_pct == null ? '—' : `${evidencias.progresso_fisico_pct}%`}</dd></div><div><dt className="text-muted-foreground">Atraso</dt><dd>{evidencias.atraso_dias} dias</dd></div><div><dt className="text-muted-foreground">Clima</dt><dd>{evidencias.clima || '—'}{evidencias.clima_descricao && ` · ${evidencias.clima_descricao}`}</dd></div></dl>{evidencias.anotacoes && <p className="text-sm"><strong>Anotações:</strong> {evidencias.anotacoes}</p>}{evidencias.problemas && <p className="text-sm"><strong>Problemas:</strong> {evidencias.problemas}</p>}{evidencias.fotos.length > 0 && (imprimivel ? <div className="grid grid-cols-2 gap-3">{evidencias.fotos.map(f => <figure key={f.path}><img src={urlFotoObra(f.path) ?? ''} alt={f.legenda || 'Prova fotográfica'} className="w-full max-h-72 object-contain" /><figcaption className="text-xs">{f.legenda}</figcaption></figure>)}</div> : <FotosGaleria fotos={evidencias.fotos.map(f => ({ ...f, data: '' }))} />)}</section>
}
