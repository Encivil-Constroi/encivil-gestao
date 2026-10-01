import { Link } from 'react-router'
import type { SecaoProps } from './tipos'
import { botaoPrimario, botaoSecundario, Seccao } from '../ui'
import { ListaRelatorios } from '../relatorios/ListaRelatorios'
import { usePodeRelatarObra, useRelatoriosDiarios } from '../../hooks/useRelatoriosDiarios'

export function Relatorios({ obraId }: SecaoProps) {
  const { relatorios, loading, error, reload } = useRelatoriosDiarios({ obraId })
  const podeCriar = usePodeRelatarObra(obraId)
  return <Seccao titulo="Relatórios diários">
    <div className="flex gap-2 flex-wrap">
      {podeCriar && <Link to={`/obras/${obraId}/relatorio-diario/novo`} className={botaoPrimario}>Novo relatório diário</Link>}
      <Link to={`/obras/relatorios?obra=${obraId}`} className={botaoSecundario}>Ver todos</Link>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {loading ? <p className="text-sm text-muted-foreground">A carregar…</p> : <ListaRelatorios relatorios={relatorios} />}
  </Seccao>
}
