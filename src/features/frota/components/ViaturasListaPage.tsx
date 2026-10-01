import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search, User, MapPin, Gauge, KeyRound, Undo2, Truck, Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { formatarData } from '@/app/lib/prazoFrota'
import { useResumoFrota } from '../hooks/useFrota'
import {
  filtrarViaturas, contarPorEstado, estadoDeParametro, nivelRevisao, textoLeitura, marcaModelo, rotuloViatura,
  type ClasseViatura,
} from '../lib/viaturas'
import type { EstadoOperacional, ResumoViaturaRow } from '../db'
import { BadgeEstadoViatura, IconeTipoViatura, PastilhaDocumento, PastilhaPrazo } from './estado'
import { inputCls, botaoPrimario, botaoSecundario } from './ui'

const PASTILHAS: { valor: EstadoOperacional | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Todos' },
  { valor: 'LIVRE', rotulo: 'Livres' },
  { valor: 'EM_USO', rotulo: 'Em uso' },
  { valor: 'OFICINA', rotulo: 'Oficina' },
]

const CLASSES: { valor: ClasseViatura | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Todas' },
  { valor: 'VIATURA', rotulo: 'Viaturas' },
  { valor: 'MAQUINA', rotulo: 'Máquinas' },
]

const pastilha = (ativa: boolean) =>
  `px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${
    ativa ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'}`

function CartaoViatura({ v, podeEntregar }: { v: ResumoViaturaRow; podeEntregar: boolean }) {
  return (
    <li className="bg-card rounded-2xl border border-border overflow-hidden">
      <Link to={`/frota/viatura/${v.id}`} className="block p-4 hover:bg-accent/40 transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <IconeTipoViatura tipo={v.tipo} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold tracking-wide leading-tight truncate">{rotuloViatura(v)}</p>
            <p className="text-sm text-muted-foreground truncate">{marcaModelo(v)}</p>
          </div>
          <BadgeEstadoViatura estado={v.estado_operacional} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <User className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {v.condutor_nome
              ? <>{v.condutor_nome}{v.condutor_desde && <span className="text-xs text-muted-foreground">desde {formatarData(v.condutor_desde)}</span>}</>
              : <span className="text-muted-foreground">Sem colaborador</span>}
          </span>
          {v.obra_nome && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> {v.obra_nome}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="w-4 h-4" aria-hidden="true" /> {textoLeitura(v.km_atual, v.unidade_contador)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <PastilhaPrazo rotulo="Revisão" nivel={nivelRevisao(v)} />
          <PastilhaDocumento rotulo="Seguro" data={v.data_fim_seguro} />
          <PastilhaDocumento rotulo="IPO" data={v.data_proxima_ipo} />
        </div>
      </Link>

      {podeEntregar && v.estado_operacional !== 'OFICINA' && (
        <div className="px-4 pb-4 -mt-1">
          {v.estado_operacional === 'LIVRE' ? (
            <Link to={`/frota/entregar?viatura=${v.id}`} className={`${botaoPrimario} w-full sm:w-auto`}>
              <KeyRound className="w-4 h-4" aria-hidden="true" /> Entregar
            </Link>
          ) : (
            <Link to={`/frota/devolver?viatura=${v.id}`} className={`${botaoSecundario} w-full sm:w-auto`}>
              <Undo2 className="w-4 h-4" aria-hidden="true" /> Devolver
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

export function ViaturasListaPage() {
  const { viaturas, loading, error, reload } = useResumoFrota()
  const { podeFrota, podeCombustivel } = useRole()
  const [params, setParams] = useSearchParams()
  const [pesquisa, setPesquisa] = useState('')

  const estado = estadoDeParametro(params.get('estado'))
  const obraId = params.get('obra')
  const classe: ClasseViatura | null = params.get('tipo') === 'MAQUINA' ? 'MAQUINA' : params.get('tipo') === 'VIATURA' ? 'VIATURA' : null

  const mudar = (chave: string, valor: string | null) => {
    const novo = new URLSearchParams(params)
    if (valor) novo.set(chave, valor); else novo.delete(chave)
    setParams(novo, { replace: true })
  }

  const obras = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of viaturas) if (v.obra_id && v.obra_nome) m.set(v.obra_id, v.obra_nome)
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'pt'))
  }, [viaturas])

  // As contagens ignoram o filtro de estado para cada pastilha mostrar quantas teria
  const contagens = useMemo(
    () => contarPorEstado(filtrarViaturas(viaturas, { classe, obraId, pesquisa })),
    [viaturas, classe, obraId, pesquisa])
  const lista = useMemo(
    () => filtrarViaturas(viaturas, { estado, classe, obraId, pesquisa }),
    [viaturas, estado, classe, obraId, pesquisa])

  const podeCriar = podeFrota || podeCombustivel

  if (loading && viaturas.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p>
  if (error) return (
    <div className="py-8 text-center space-y-3">
      <p className="text-sm text-destructive">{error}</p>
      <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
          placeholder="Procurar matrícula, modelo ou condutor…" aria-label="Pesquisar viaturas"
          className={`${inputCls} pl-11`} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Estado">
        {PASTILHAS.map(p => (
          <button key={p.rotulo} type="button" onClick={() => mudar('estado', p.valor)}
            aria-pressed={estado === p.valor} className={pastilha(estado === p.valor)}>
            {p.rotulo} <span className="opacity-70">{contagens[p.valor ?? 'TODOS']}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5" role="group" aria-label="Tipo">
          {CLASSES.map(c => (
            <button key={c.rotulo} type="button" onClick={() => mudar('tipo', c.valor)}
              aria-pressed={classe === c.valor}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                classe === c.valor ? 'bg-secondary/30 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {c.rotulo}
            </button>
          ))}
        </div>
        {obras.length > 0 && (
          <select value={obraId ?? ''} onChange={e => mudar('obra', e.target.value || null)} aria-label="Filtrar por obra"
            className="ml-auto px-3 py-2 bg-input-background border border-input rounded-xl text-sm max-w-[60%]">
            <option value="">Todas as obras</option>
            {obras.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        )}
      </div>

      {viaturas.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-3">
          <Truck className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Ainda não há viaturas nem máquinas ativas.</p>
          {podeCriar && (
            <Link to="/frota/viatura/nova" className={botaoPrimario}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Criar a primeira viatura
            </Link>
          )}
        </div>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma viatura corresponde aos filtros.</p>
      ) : (
        <ul className="space-y-3">
          {lista.map(v => <CartaoViatura key={v.id} v={v} podeEntregar={podeFrota} />)}
        </ul>
      )}
    </div>
  )
}
