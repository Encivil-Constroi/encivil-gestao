import { useSearchParams } from 'react-router'
import { Users, UserPlus, Clock, CalendarX, UserCog } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { ColaboradoresPage } from '@/features/colaboradores/components/ColaboradoresPage'
import { ColaboradorForm } from '@/features/colaboradores/components/ColaboradorForm'
import { HorariosPage, FaltasPage } from '@/features/horarios'
import { GestaoUtilizadoresPage } from './GestaoUtilizadoresPage'

type Aba = 'equipa' | 'perfil' | 'horarios' | 'faltas' | 'utilizadores'

const ABAS: { id: Aba; label: string; Icon: typeof Users; soAdmin?: boolean }[] = [
  { id: 'equipa',       label: 'Equipa',        Icon: Users },
  { id: 'perfil',       label: 'Criar perfil',  Icon: UserPlus },
  { id: 'horarios',     label: 'Horários',      Icon: Clock },
  { id: 'faltas',       label: 'Faltas',        Icon: CalendarX },
  { id: 'utilizadores', label: 'Utilizadores',  Icon: UserCog, soAdmin: true },
]

// Tudo o que diz respeito a pessoas num só sítio. A aba vive no endereço (?aba=)
// para as ligações e os redirecionamentos antigos continuarem a funcionar.
export function RecursosHumanosPage() {
  const { isAdmin } = useRole()
  const [params, setParams] = useSearchParams()
  const abas = ABAS.filter(a => !a.soAdmin || isAdmin)
  const pedida = params.get('aba')
  const aba: Aba = abas.find(a => a.id === pedida)?.id ?? 'equipa'
  const ir = (id: Aba) => setParams(id === 'equipa' ? {} : { aba: id }, { replace: true })

  return (
    <div className="space-y-4">
      <h1 className="text-xl md:text-2xl font-semibold">Recursos Humanos</h1>

      {/* Barra de abas: desliza na horizontal no telemóvel */}
      <div role="tablist" aria-label="Recursos Humanos" className="flex gap-1 border-b border-border overflow-x-auto [scrollbar-width:none] -mx-4 px-4 md:mx-0 md:px-0">
        {abas.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => ir(id)}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors ${
              aba === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {aba === 'equipa'       && <ColaboradoresPage onNovo={() => ir('perfil')} />}
      {aba === 'perfil'       && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden flex flex-col">
          <ColaboradorForm ampla onSaved={() => ir('equipa')} onCancel={() => ir('equipa')} />
        </div>
      )}
      {aba === 'horarios'     && <HorariosPage />}
      {aba === 'faltas'       && <FaltasPage />}
      {aba === 'utilizadores' && isAdmin && <GestaoUtilizadoresPage />}
    </div>
  )
}
