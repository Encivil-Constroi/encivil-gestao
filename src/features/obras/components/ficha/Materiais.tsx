import type { SecaoProps } from './tipos'
import { useState } from 'react'
import { Link } from 'react-router'
import { Download, Package } from 'lucide-react'
import { exportarCsv } from '@/app/lib/exportCsv'
import { fmtQuantidade } from '@/app/lib/format'
import { Button } from '@/app/components/ui/button'
import { CLASSE_CAMPO } from '@/app/components/CampoSelect'
import { useMateriaisObra } from '../../hooks/useFichaRecursos'
import { dataLisboa } from '../../lib/datasRecursos'
import { Seccao, Vazio, botaoSecundario } from '../ui'

const PASSO = 50
const euro = (n: number): string => n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

export function Materiais({ obraId }: SecaoProps) {
  const [pesquisa, setPesquisa] = useState('')
  const [limite, setLimite] = useState(PASSO)
  const { materiais, loading, error, reload } = useMateriaisObra(obraId)
  const totalValor = materiais.reduce((s, m) => s + m.valor, 0)
  const filtrados = materiais.filter(m => m.nome.toLocaleLowerCase('pt-PT').includes(pesquisa.toLocaleLowerCase('pt-PT')))
  const visiveis = filtrados.slice(0, limite)
  const restantes = filtrados.length - visiveis.length

  function exportar() {
    exportarCsv(materiais.map(m => ({ Produto: m.nome, Unidade: m.unidade, Enviado: m.enviado, Devolvido: m.devolvido, 'Líquido': m.liquido, 'Valor (€)': m.valor, 'Último movimento': m.ultimo_movimento ?? '' })), `materiais_obra_${obraId}`)
  }

  return <Seccao titulo={`Materiais · ${materiais.length}`} icone={<Package className="w-4 h-4 text-primary" aria-hidden="true" />}
    acao={materiais.length > 0 && <button type="button" onClick={exportar} className={botaoSecundario}><Download className="w-4 h-4" aria-hidden="true" /> Exportar CSV</button>}>
    {loading && <p className="text-sm text-muted-foreground">A carregar materiais…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
    {!loading && !error && materiais.length === 0 && <Vazio>Sem materiais enviados para esta obra.</Vazio>}
    {materiais.length > 0 && <>
      <label className="block text-sm">Pesquisar materiais
        <input type="search" value={pesquisa} placeholder="Pesquisar por artigo…" onChange={e => { setPesquisa(e.target.value); setLimite(PASSO) }} className={`mt-1 ${CLASSE_CAMPO}`} />
      </label>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Produtos movimentados</p><p className="font-semibold">{materiais.length}</p></div>
        <div className="rounded-xl bg-primary/10 p-3"><p className="text-xs text-muted-foreground">Valor líquido</p><p className="font-semibold">{euro(totalValor)}</p></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 pr-3">Produto</th><th className="py-2 pr-3 text-right">Enviado</th><th className="py-2 pr-3 text-right">Devolvido</th><th className="py-2 pr-3 text-right">Líquido</th><th className="py-2 pr-3 text-right">Valor</th><th className="py-2">Último movimento</th></tr></thead>
        <tbody>{visiveis.map(m => <tr key={m.produto_id} className="border-b border-border last:border-0"><td className="py-2 pr-3 font-medium"><Link to={`/armazem/produto/${m.produto_id}`} className="hover:underline">{m.nome}</Link></td><td className="py-2 pr-3 whitespace-nowrap text-right tabular-nums">{fmtQuantidade(m.enviado, m.unidade)}</td><td className="py-2 pr-3 whitespace-nowrap text-right tabular-nums">{fmtQuantidade(m.devolvido, m.unidade)}</td><td className="py-2 pr-3 whitespace-nowrap text-right tabular-nums">{fmtQuantidade(m.liquido, m.unidade)}</td><td className="py-2 pr-3 whitespace-nowrap text-right tabular-nums">{euro(m.valor)}</td><td className="py-2 whitespace-nowrap">{dataLisboa(m.ultimo_movimento)}</td></tr>)}</tbody>
      </table></div>
      {restantes > 0 && <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setLimite(l => l + PASSO)}>Mostrar mais ({restantes} restantes)</Button>}
    </>}
  </Seccao>
}
