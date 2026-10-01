import type { SecaoProps } from './tipos'
import { Wrench } from 'lucide-react'
import { useFerramentasObra } from '../../hooks/useFichaRecursos'
import { dataHoraLisboa } from '../../lib/datasRecursos'
import { Seccao, Vazio } from '../ui'
import type { ObraFerramentaRow } from '../../db'
import { Link } from 'react-router'
import { urlFotoArmazem } from '@/app/lib/fotosArmazem'

function Ferramenta({ item }: { item: ObraFerramentaRow }) {
  return <div className="py-3 flex gap-3 border-b border-border last:border-0">
    <span className="rounded-lg bg-primary/10 text-primary p-2 self-start">{item.foto_path && urlFotoArmazem(item.foto_path) ? <img src={urlFotoArmazem(item.foto_path)!} alt="" className="w-8 h-8 rounded object-cover" /> : <Wrench className="w-4 h-4" aria-hidden="true" />}</span>
    <div className="flex-1"><p className="font-medium text-sm"><Link to={`/armazem/ferramenta/${item.ferramenta_id}`} className="hover:underline">{item.nome}</Link>{item.numero_serie && <span className="font-normal text-muted-foreground"> · Nº {item.numero_serie}</span>}</p>
      <p className="text-xs text-muted-foreground">Com {item.colaborador_nome || 'colaborador não indicado'} · Saída {dataHoraLisboa(item.data_saida)}</p>
      {!item.ativo && <p className="text-xs text-muted-foreground">Devolvida {dataHoraLisboa(item.data_devolucao)}</p>}
    </div>{item.ativo && <span className={`text-xs font-medium whitespace-nowrap ${item.dias_fora >= 14 ? 'text-destructive' : 'text-primary'}`}>{item.dias_fora} {item.dias_fora === 1 ? 'dia' : 'dias'} fora</span>}
  </div>
}

export function Ferramentas({ obraId }: SecaoProps) {
  const { ferramentas, loading, error, reload } = useFerramentasObra(obraId)
  const ativas = ferramentas.filter(f => f.ativo)
  const historico = ferramentas.filter(f => !f.ativo)
  return <div className="space-y-4">
    {loading && <p className="text-sm text-muted-foreground">A carregar ferramentas…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {!loading && !error && <>
      <Seccao titulo={`Emprestadas agora · ${ativas.length}`}>{ativas.length ? ativas.map(f => <Ferramenta key={f.emprestimo_id} item={f} />) : <Vazio>Sem ferramentas emprestadas nesta obra.</Vazio>}</Seccao>
      {historico.length > 0 && <Seccao titulo="Histórico de empréstimos">{historico.map(f => <Ferramenta key={f.emprestimo_id} item={f} />)}</Seccao>}
    </>}
  </div>
}
