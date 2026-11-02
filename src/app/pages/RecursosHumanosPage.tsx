import { useSearchParams } from 'react-router'
import { useRole } from '@/features/auth/useRole'
import { PageHeader, LARGURA_PAGINA } from '@/app/components/PageHeader'
import { FiltroChips } from '@/app/components/FiltroChips'
import { ColaboradoresPage } from '@/features/colaboradores/components/ColaboradoresPage'
import { ColaboradorForm } from '@/features/colaboradores/components/ColaboradorForm'
import { HorariosPage, FaltasPage } from '@/features/horarios'
import { GestaoUtilizadoresPage } from './GestaoUtilizadoresPage'

type Aba = 'equipa' | 'perfil' | 'horarios' | 'faltas' | 'utilizadores'

const ABAS: { valor: Aba; rotulo: string; soAdmin?: boolean }[] = [
  { valor: 'equipa',       rotulo: 'Equipa' },
  { valor: 'perfil',       rotulo: 'Criar perfil' },
  { valor: 'horarios',     rotulo: 'Horários' },
  { valor: 'faltas',       rotulo: 'Faltas' },
  { valor: 'utilizadores', rotulo: 'Utilizadores', soAdmin: true },
]

// Tudo o que diz respeito a pessoas num só sítio. A aba vive no endereço (?aba=)
// para as ligações e os redirecionamentos antigos continuarem a funcionar.
export function RecursosHumanosPage() {
  const { isAdmin } = useRole()
  const [params, setParams] = useSearchParams()
  const abas = ABAS.filter(a => !a.soAdmin || isAdmin)
  const pedida = params.get('aba')
  const aba: Aba = abas.find(a => a.valor === pedida)?.valor ?? 'equipa'
  const ir = (id: Aba) => setParams(id === 'equipa' ? {} : { aba: id }, { replace: true })

  return (
    <div className={`${LARGURA_PAGINA} space-y-4`}>
      <PageHeader titulo="Recursos humanos" />
      <FiltroChips ariaLabel="Secções de recursos humanos" opcoes={abas} valor={aba} onChange={ir} />

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
