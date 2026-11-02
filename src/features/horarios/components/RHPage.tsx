import { useState } from 'react'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { FiltroChips } from '@/app/components/FiltroChips'
import { HorariosPage }          from './HorariosPage'
import { AtribuicaoHorarioPage } from './AtribuicaoHorarioPage'
import { AssiduidadePage }        from './AssiduidadePage'
import { FaltasPage }             from './FaltasPage'

type Tab = 'horarios' | 'atribuicao' | 'assiduidade' | 'faltas'

const TABS: { valor: Tab; rotulo: string }[] = [
  { valor: 'horarios',    rotulo: 'Horários' },
  { valor: 'atribuicao',  rotulo: 'Atribuição' },
  { valor: 'assiduidade', rotulo: 'Assiduidade' },
  { valor: 'faltas',      rotulo: 'Faltas' },
]

export function RHPage() {
  const [tab, setTab] = useState<Tab>('horarios')

  return (
    <div className={`${LARGURA_PAGINA} space-y-4`}>
      <PageHeader titulo="Recursos humanos" descricao="Horários, assiduidade e gestão de faltas" />
      <FiltroChips ariaLabel="Secções de recursos humanos" opcoes={TABS} valor={tab} onChange={setTab} />

      {/* Conteúdo da tab activa */}
      {tab === 'horarios'    && <HorariosPage />}
      {tab === 'atribuicao'  && <AtribuicaoHorarioPage />}
      {tab === 'assiduidade' && <AssiduidadePage />}
      {tab === 'faltas'      && <FaltasPage />}
    </div>
  )
}
