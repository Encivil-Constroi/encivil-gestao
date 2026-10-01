import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { KeyRound, Undo2, Search } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { useResumoFrota } from '../hooks/useFrota'
import { useEntregas } from '../hooks/useEntregas'
import {
  ROTULO_COMBUSTIVEL, agruparPorDia, diasDesde, formatarContador, formatarData,
} from '../lib/entregas'
import { Seccao, Vazio, inputCls } from './ui'
import { DetalheEntrega } from './DetalheEntrega'

const botaoGrande =
  'flex-1 min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl text-base font-semibold active:scale-[0.99] transition-all'

export function EntregasPage() {
  const { podeFrota } = useRole()
  const [params, setParams] = useSearchParams()
  const { entregas, loading, error } = useEntregas()
  const { viaturas } = useResumoFrota()

  const [tipo, setTipo] = useState('')
  const [colaborador, setColaborador] = useState('')
  const [desde, setDesde] = useState('')
  const [ate, setAte] = useState('')
  const [pesquisa, setPesquisa] = useState('')

  const viaturaFiltro = params.get('viatura') ?? ''
  const idAberto = params.get('id')

  const mudarParam = (chave: string, valor: string) =>
    setParams(prev => { const p = new URLSearchParams(prev); if (valor) p.set(chave, valor); else p.delete(chave); return p }, { replace: true })

  const unidadePorViatura = useMemo(() => new Map(viaturas.map(v => [v.id, v.unidade_contador])), [viaturas])
  const emUso = viaturas.filter(v => v.estado_operacional === 'EM_USO')

  const colaboradores = useMemo(
    () => [...new Map(entregas.map(e => [e.colaborador_id, e.colaborador_nome])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [entregas],
  )

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return entregas.filter(e =>
      (!tipo || e.tipo === tipo) &&
      (!viaturaFiltro || e.veiculo_id === viaturaFiltro) &&
      (!colaborador || e.colaborador_id === colaborador) &&
      (!desde || e.data >= desde) &&
      (!ate || e.data <= ate) &&
      (!q || [e.veiculo_nome, e.identificacao, e.colaborador_nome, e.obra_nome, e.registado_por].some(t => t?.toLowerCase().includes(q))))
  }, [entregas, tipo, viaturaFiltro, colaborador, desde, ate, pesquisa])

  const grupos = useMemo(() => agruparPorDia(filtradas), [filtradas])
  const aberta = idAberto ? entregas.find(e => e.id === idAberto) ?? null : null
  const referencia = aberta?.entrega_ref ? entregas.find(e => e.id === aberta.entrega_ref) ?? null : null

  return (
    <div className="space-y-4">
      {podeFrota && (
        <div className="flex gap-3 flex-wrap">
          <Link to={`/frota/entregar${viaturaFiltro ? `?viatura=${viaturaFiltro}` : ''}`}
            className={`${botaoGrande} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <KeyRound className="w-5 h-5" aria-hidden="true" /> Entregar viatura
          </Link>
          <Link to={`/frota/devolver${viaturaFiltro ? `?viatura=${viaturaFiltro}` : ''}`}
            className={`${botaoGrande} bg-secondary/20 text-foreground hover:bg-secondary/30 border border-border`}>
            <Undo2 className="w-5 h-5" aria-hidden="true" /> Devolver viatura
          </Link>
        </div>
      )}

      <Seccao titulo={`Atualmente entregues (${emUso.length})`}>
        {emUso.length === 0 ? <Vazio>Nenhuma viatura está entregue neste momento.</Vazio> : (
          <ul className="divide-y divide-border">
            {emUso.map(v => {
              const dias = v.condutor_desde ? diasDesde(v.condutor_desde) : null
              return (
                <li key={v.id} className="py-2 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{v.identificacao ?? v.codigo} · {v.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {v.condutor_nome ?? '—'}{v.obra_nome ? ` · ${v.obra_nome}` : ''}
                    </div>
                  </div>
                  <div className="text-sm text-right">
                    {v.condutor_desde && <div>desde {formatarData(v.condutor_desde)}</div>}
                    {dias != null && <div className="text-muted-foreground">há {dias} {dias === 1 ? 'dia' : 'dias'}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Histórico">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div className="relative col-span-2 md:col-span-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={pesquisa} onChange={e => setPesquisa(e.target.value)} aria-label="Pesquisar entregas"
              placeholder="Pesquisar por viatura, colaborador ou obra" className={`${inputCls} pl-10`} />
          </div>
          <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Filtrar por tipo" className={inputCls}>
            <option value="">Entregas e devoluções</option>
            <option value="ENTREGA">Só entregas</option>
            <option value="DEVOLUCAO">Só devoluções</option>
          </select>
          <select value={viaturaFiltro} onChange={e => mudarParam('viatura', e.target.value)} aria-label="Filtrar por viatura" className={inputCls}>
            <option value="">Todas as viaturas</option>
            {viaturas.map(v => <option key={v.id} value={v.id}>{v.identificacao ?? v.codigo} · {v.nome}</option>)}
          </select>
          <select value={colaborador} onChange={e => setColaborador(e.target.value)} aria-label="Filtrar por colaborador" className={inputCls}>
            <option value="">Todos os colaboradores</option>
            {colaboradores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <label className="text-xs text-muted-foreground">De
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} aria-label="Data desde" className={inputCls} />
          </label>
          <label className="text-xs text-muted-foreground">Até
            <input type="date" value={ate} onChange={e => setAte(e.target.value)} aria-label="Data até" className={inputCls} />
          </label>
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
          : loading && entregas.length === 0 ? <Vazio>A carregar…</Vazio>
          : grupos.length === 0 ? <Vazio>Sem registos para estes filtros.</Vazio>
          : grupos.map(g => (
            <section key={g.dia} aria-label={`Dia ${formatarData(g.dia)}`} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{formatarData(g.dia)}</h3>
              <ul className="space-y-2">
                {g.linhas.map(e => {
                  const unidade = unidadePorViatura.get(e.veiculo_id) ?? 'km'
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => mudarParam('id', e.id)}
                        className="w-full text-left rounded-xl border border-border bg-card hover:border-primary p-3 space-y-1 min-h-14">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${e.tipo === 'ENTREGA' ? 'bg-primary/10 text-primary' : 'bg-secondary/30 text-foreground'}`}>
                            {e.tipo === 'ENTREGA' ? 'Entrega' : 'Devolução'}
                          </span>
                          <span className="font-semibold">{e.identificacao ?? e.veiculo_nome}</span>
                          <span className="text-sm text-muted-foreground">{e.veiculo_nome}</span>
                        </div>
                        <div className="text-sm">{e.colaborador_nome}{e.obra_nome ? ` · ${e.obra_nome}` : ''}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatarContador(e.km, unidade)} · Combustível {ROTULO_COMBUSTIVEL[e.combustivel]} ·{' '}
                          {e.danos.length} {e.danos.length === 1 ? 'dano' : 'danos'} · registado por {e.registado_por}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
      </Seccao>

      {aberta && (
        <DetalheEntrega entrega={aberta} referencia={referencia} unidade={unidadePorViatura.get(aberta.veiculo_id) ?? 'km'}
          onFechar={() => mudarParam('id', '')} />
      )}
    </div>
  )
}
