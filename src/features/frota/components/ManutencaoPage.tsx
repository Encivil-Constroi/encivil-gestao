import { Link, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { useResumoFrota, useCatalogo } from '../hooks/useFrota'
import { OficinaEVencer } from './manutencao/OficinaEVencer'
import { HistoricoManutencoes } from './manutencao/HistoricoManutencoes'
import { FichaRevisaoVista } from './manutencao/FichaRevisaoVista'
import { botaoPrimario } from './ui'

const VISTAS = [
  { chave: 'oficina', rotulo: 'Em oficina e a vencer' },
  { chave: 'historico', rotulo: 'Histórico' },
  { chave: 'ficha', rotulo: 'Ficha de revisão' },
] as const
type Vista = typeof VISTAS[number]['chave']

export function ManutencaoPage() {
  const { podeFrota } = useRole()
  const [params, setParams] = useSearchParams()
  const pedida = params.get('vista')
  const vista: Vista = VISTAS.some(v => v.chave === pedida) ? (pedida as Vista) : 'oficina'
  const { viaturas, loading, error } = useResumoFrota()
  const { catalogo } = useCatalogo()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div role="tablist" aria-label="Vistas da manutenção" className="flex gap-1 bg-muted/60 rounded-xl p-1 overflow-x-auto flex-1">
          {VISTAS.map(v => (
            <button key={v.chave} role="tab" aria-selected={vista === v.chave}
              onClick={() => setParams(v.chave === 'oficina' ? {} : { vista: v.chave }, { replace: true })}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                vista === v.chave ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {v.rotulo}
            </button>
          ))}
        </div>
        {podeFrota && (
          <Link to="/frota/manutencao/nova" className={botaoPrimario}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Registar manutenção
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && viaturas.length === 0 && !error && <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>}

      {vista === 'oficina' && <OficinaEVencer viaturas={viaturas} podeEditar={podeFrota} />}
      {vista === 'historico' && <HistoricoManutencoes viaturas={viaturas} catalogo={catalogo} podeEditar={podeFrota} />}
      {vista === 'ficha' && <FichaRevisaoVista viaturas={viaturas} podeEditar={podeFrota} />}
    </div>
  )
}
