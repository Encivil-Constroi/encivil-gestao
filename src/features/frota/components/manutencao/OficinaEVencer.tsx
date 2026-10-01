import { useState } from 'react'
import { Link } from 'react-router'
import { Wrench, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatarData } from '@/app/lib/prazoFrota'
import { useDefinirEstadoViatura } from '../../hooks/useManutencao'
import type { ResumoViaturaRow } from '../../db'
import { Seccao, Vazio, botaoPrimario, botaoSecundario } from '../ui'

function Linha({ v, podeEditar, aMudar, aoMudar }: {
  v: ResumoViaturaRow; podeEditar: boolean; aMudar: boolean; aoMudar: (estado: 'LIVRE' | 'OFICINA') => void
}) {
  const nome = v.identificacao ?? v.nome
  return (
    <li className="py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/frota/viatura/${v.id}`} className="text-sm font-semibold hover:underline">{nome}</Link>
          <p className="text-xs text-muted-foreground truncate">
            {[v.identificacao ? v.nome : null, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
            {v.data_ultima_revisao ? ` · última revisão ${formatarData(v.data_ultima_revisao)}` : ' · sem revisão registada'}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {v.alertas_urgentes > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
              <ShieldAlert className="w-3 h-3" aria-hidden="true" /> {v.alertas_urgentes} urgente{v.alertas_urgentes > 1 ? 's' : ''}
            </span>
          )}
          {v.alertas_atencao > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {v.alertas_atencao} atenção
            </span>
          )}
        </div>
      </div>
      {podeEditar && (
        <div className="flex gap-2 flex-wrap">
          <Link to={`/frota/manutencao/nova?viatura=${v.id}`} className={`${botaoPrimario} !py-2`}>
            <Wrench className="w-4 h-4" aria-hidden="true" /> Registar manutenção
          </Link>
          {v.estado_operacional === 'OFICINA' && (
            <button type="button" disabled={aMudar} onClick={() => aoMudar('LIVRE')} className={`${botaoSecundario} !py-2`}>
              Tirar da oficina
            </button>
          )}
          {v.estado_operacional === 'LIVRE' && (
            <button type="button" disabled={aMudar} onClick={() => aoMudar('OFICINA')} className={`${botaoSecundario} !py-2`}>
              Pôr em oficina
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// Vista de trabalho do mecânico: o que está na oficina e o que está a chegar ao prazo
export function OficinaEVencer({ viaturas, podeEditar }: { viaturas: ResumoViaturaRow[]; podeEditar: boolean }) {
  const { definir, loading } = useDefinirEstadoViatura()
  const [emCurso, setEmCurso] = useState<string | null>(null)

  const mudar = async (v: ResumoViaturaRow, estado: 'LIVRE' | 'OFICINA') => {
    setEmCurso(v.id)
    const ok = await definir(v.id, estado)
    setEmCurso(null)
    if (ok) toast.success(estado === 'OFICINA' ? `${v.identificacao ?? v.nome} está agora na oficina.` : `${v.identificacao ?? v.nome} saiu da oficina.`)
  }

  const naOficina = viaturas.filter(v => v.estado_operacional === 'OFICINA')
  const aVencer = viaturas
    .filter(v => v.alertas_urgentes > 0 || v.alertas_atencao > 0)
    .sort((a, b) => b.alertas_urgentes - a.alertas_urgentes || b.alertas_atencao - a.alertas_atencao)

  const renderLinhas = (lista: ResumoViaturaRow[]) => (
    <ul className="divide-y divide-border">
      {lista.map(v => (
        <Linha key={v.id} v={v} podeEditar={podeEditar} aMudar={loading && emCurso === v.id} aoMudar={e => mudar(v, e)} />
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <Seccao titulo={`Na oficina (${naOficina.length})`} icone={<Wrench className="w-4 h-4 text-destructive" aria-hidden="true" />}>
        {naOficina.length === 0 ? <Vazio>Nenhuma viatura ou máquina na oficina.</Vazio> : renderLinhas(naOficina)}
      </Seccao>

      <Seccao titulo={`Prazos a vencer (${aVencer.length})`} icone={<AlertTriangle className="w-4 h-4 text-warning" aria-hidden="true" />}>
        {aVencer.length === 0
          ? <p className="text-sm text-muted-foreground py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" /> Tudo em dia — nenhum prazo a vencer.
            </p>
          : renderLinhas(aVencer)}
      </Seccao>
    </div>
  )
}
