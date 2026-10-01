import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClipboardCheck, SlidersHorizontal } from 'lucide-react'
import { formatarData } from '@/app/lib/prazoFrota'
import { useChecklistsRecentes } from '../../hooks/useManutencao'
import { ViaturaCombobox, type OpcaoViatura } from '../ViaturaCombobox'
import { Seccao, Vazio, BadgeEstado, botaoPrimario, botaoSecundario } from '../ui'

// Casa da ficha de revisão: fazer o checklist, ver os últimos e editar a ficha-modelo
export function FichaRevisaoVista({ viaturas, podeEditar }: { viaturas: OpcaoViatura[]; podeEditar: boolean }) {
  const navigate = useNavigate()
  const { checklists, loading, error } = useChecklistsRecentes()
  const [viaturaId, setViaturaId] = useState<string | null>(null)
  const nome = (id: string) => {
    const v = viaturas.find(x => x.id === id)
    return v ? (v.identificacao ?? v.nome) : 'Viatura'
  }

  return (
    <div className="space-y-4">
      {podeEditar && (
        <Seccao titulo="Fazer a ficha de revisão" icone={<ClipboardCheck className="w-4 h-4 text-primary" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">Escolha a viatura ou máquina para abrir a inspeção (checklist).</p>
          <ViaturaCombobox viaturas={viaturas} valor={viaturaId} onChange={setViaturaId} rotuloCampo="Viatura ou máquina" />
          <button type="button" disabled={!viaturaId} className={`${botaoPrimario} w-full`}
            onClick={() => viaturaId && navigate(`/frota/viatura/${viaturaId}/checklist`)}>
            Abrir checklist de inspeção
          </button>
        </Seccao>
      )}

      <Seccao titulo="Últimas fichas de revisão">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && checklists.length === 0 && <Vazio>A carregar…</Vazio>}
        {!loading && !error && checklists.length === 0 && <Vazio>Ainda não há fichas de revisão registadas.</Vazio>}
        <ul className="divide-y divide-border">
          {checklists.map(c => {
            const problemas = c.itens.filter(i => i.estado !== 'OK')
            return (
              <li key={c.id}>
                <Link to={`/frota/viatura/${c.veiculo_id}`} className="block py-3 space-y-1 hover:bg-accent/30 -mx-2 px-2 rounded-lg">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold flex-1">{nome(c.veiculo_id)}</span>
                    <BadgeEstado estado={c.estado_geral} />
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatarData(c.data)}{c.km_na_altura != null ? ` · ${Number(c.km_na_altura).toLocaleString('pt-PT')}` : ''}
                    {' · '}{c.itens.length} itens verificados
                  </span>
                  {problemas.length > 0 && (
                    <span className="block text-xs">
                      {problemas.map(p => `${p.rotulo}${p.observacao ? ` (${p.observacao})` : ''}`).join(' · ')}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </Seccao>

      {podeEditar && (
        <Link to="/frota/catalogo" className={`${botaoSecundario} w-full`}>
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> Editar a ficha-modelo (itens e intervalos)
        </Link>
      )}
    </div>
  )
}
