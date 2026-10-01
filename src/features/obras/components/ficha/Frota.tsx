import type { SecaoProps } from './tipos'
import { Truck } from 'lucide-react'
import { useFrotaObra } from '../../hooks/useFichaRecursos'
import { dataLisboa, dataHoraLisboa } from '../../lib/datasRecursos'
import { Seccao, Vazio } from '../ui'
import type { ObraFrotaRow } from '../../db'
import { Link } from 'react-router'

function Veiculo({ item }: { item: ObraFrotaRow }) {
  return <div className="py-3 flex items-start gap-3 border-b border-border last:border-0">
    <span className="rounded-lg bg-primary/10 text-primary p-2"><Truck className="w-4 h-4" aria-hidden="true" /></span>
    <div className="flex-1 min-w-0"><p className="font-medium text-sm"><Link to={`/frota/viatura/${item.veiculo_id}`} className="hover:underline">{item.nome}</Link> {item.ehmaquina && <span className="text-xs text-primary">· Máquina</span>}</p>
      <p className="text-xs text-muted-foreground">{[item.identificacao, item.marca, item.modelo].filter(Boolean).join(' · ')}</p>
      <p className="text-xs text-muted-foreground mt-1">{item.condutor_nome ? `Condutor: ${item.condutor_nome} · ` : ''}Desde {dataLisboa(item.desde)}{item.km_atual != null ? ` · ${item.km_atual.toLocaleString('pt-PT')} km` : ''}</p>
      {!item.atual && <p className="text-xs text-muted-foreground">Entrega: {dataHoraLisboa(item.entregue_em)} · Devolução: {dataHoraLisboa(item.devolvido_em)}</p>}
    </div><span className="text-xs rounded-full bg-muted px-2 py-1">{item.estado_operacional}</span>
  </div>
}

export function Frota({ obraId }: SecaoProps) {
  const { frota, loading, error, reload } = useFrotaObra(obraId)
  const atuais = frota.filter(v => v.atual)
  const maquinas = atuais.filter(v => v.ehmaquina)
  const outros = atuais.filter(v => !v.ehmaquina)
  const historico = frota.filter(v => !v.atual)
  return <div className="space-y-4">
    {loading && <p className="text-sm text-muted-foreground">A carregar frota…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {!loading && !error && <>
      <Seccao titulo={`Máquinas na obra · ${maquinas.length}`}>{maquinas.length ? maquinas.map(v => <Veiculo key={v.veiculo_id} item={v} />) : <Vazio>Sem máquinas na obra.</Vazio>}</Seccao>
      <Seccao titulo={`Viaturas na obra · ${outros.length}`}>{outros.length ? outros.map(v => <Veiculo key={v.veiculo_id} item={v} />) : <Vazio>Sem viaturas na obra.</Vazio>}</Seccao>
      {historico.length > 0 && <Seccao titulo="Histórico de entregas">{historico.map((v, i) => <Veiculo key={`${v.veiculo_id}-${v.entregue_em}-${i}`} item={v} />)}</Seccao>}
    </>}
  </div>
}
