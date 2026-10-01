import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search, Building2, CalendarClock } from 'lucide-react'
import { fmtData } from '@/app/lib/format'
import { usePainelObras } from '../hooks/useObras'
import type { EstadoObra } from '../db'
import { ESTADOS_OBRA } from '../lib/saude'
import { textoPrazo } from '../lib/progresso'
import { Barra, EstadoBadge, SaudeBadge, botaoSecundario, inputCls } from './ui'

const FILTROS: { valor: '' | EstadoObra; rotulo: string }[] = [{ valor: '', rotulo: 'Todas' }, ...ESTADOS_OBRA]

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ObrasListaPage() {
  const [params, setParams] = useSearchParams()
  const estado = (params.get('estado') ?? '') as '' | EstadoObra
  const q = params.get('q') ?? ''
  const { obras, loading, error, reload } = usePainelObras()

  const mudar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params)
    if (valor) novo.set(chave, valor); else novo.delete(chave)
    setParams(novo, { replace: true })
  }

  const filtradas = useMemo(() => {
    const alvo = normalizar(q.trim())
    return obras.filter(o =>
      (!estado || o.estado === estado) &&
      (!alvo || normalizar([o.nome, o.cliente, o.localizacao, o.morada].filter(Boolean).join(' ')).includes(alvo)))
  }, [obras, estado, q])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={e => mudar('q', e.target.value)} placeholder="Pesquisar por nome, cliente ou local"
            aria-label="Pesquisar obras" className={`${inputCls} pl-10`} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1" role="group" aria-label="Filtrar por estado">
        {FILTROS.map(f => (
          <button key={f.valor || 'todas'} type="button" onClick={() => mudar('estado', f.valor)} aria-pressed={estado === f.valor}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
              estado === f.valor ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
            {f.rotulo}
          </button>
        ))}
      </div>

      {error ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
        </div>
      ) : loading && obras.length === 0 ? (
        <div className="space-y-2" aria-busy="true">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : filtradas.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground space-y-2">
          <Building2 className="w-9 h-9 mx-auto opacity-50" aria-hidden="true" />
          <p className="text-sm">{obras.length === 0 ? 'Ainda não há obras.' : 'Nenhuma obra corresponde ao filtro.'}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {filtradas.map(o => (
            <li key={o.obra_id}>
              <Link to={`/obras/${o.obra_id}`} className="block bg-card rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{o.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{[o.cliente, o.localizacao ?? o.morada].filter(Boolean).join(' · ') || 'Sem cliente nem localização'}</p>
                  </div>
                  <EstadoBadge estado={o.estado} />
                  {o.estado === 'ativa' && <SaudeBadge saude={o.saude} />}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Barra pct={o.progresso_pct} marca={o.progresso_esperado_pct}
                      cor={o.saude === 'critico' ? 'bg-destructive' : o.saude === 'atencao' ? 'bg-warning' : 'bg-success'}
                      rotulo={o.progresso_pct == null ? 'Sem progresso registado' : `Progresso ${Math.round(o.progresso_pct)} por cento`} />
                  </div>
                  <span className="text-sm font-semibold w-10 text-right">{o.progresso_pct == null ? '—' : `${Math.round(o.progresso_pct)}%`}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                  {o.estado === 'concluida' ? `Concluída em ${fmtData(o.data_fim_real)}` : textoPrazo(o.data_prevista_fim)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
