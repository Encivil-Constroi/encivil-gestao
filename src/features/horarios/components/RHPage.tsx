import { useState } from 'react'
import { Users2, Clock, CalendarDays, FileX, CalendarClock } from 'lucide-react'
import { HorariosPage }          from './HorariosPage'
import { AtribuicaoHorarioPage } from './AtribuicaoHorarioPage'
import { AssiduidadePage }        from './AssiduidadePage'
import { FaltasPage }             from './FaltasPage'

type Tab = 'horarios' | 'atribuicao' | 'assiduidade' | 'faltas'

const TABS: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: 'horarios',    label: 'Horários',    icon: Clock },
  { id: 'atribuicao',  label: 'Atribuição',  icon: CalendarClock },
  { id: 'assiduidade', label: 'Assiduidade', icon: CalendarDays },
  { id: 'faltas',      label: 'Faltas',      icon: FileX },
]

export function RHPage() {
  const [tab, setTab] = useState<Tab>('horarios')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <Users2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Recursos Humanos</h1>
          <p className="text-sm text-muted-foreground">Horários, assiduidade e gestão de faltas</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center ${
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Conteúdo da tab activa */}
      {tab === 'horarios'    && <HorariosPage />}
      {tab === 'atribuicao'  && <AtribuicaoHorarioPage />}
      {tab === 'assiduidade' && <AssiduidadePage />}
      {tab === 'faltas'      && <FaltasPage />}
    </div>
  )
}
