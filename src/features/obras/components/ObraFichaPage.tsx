import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Pencil, MoreHorizontal, PieChart, BookOpen, Truck, BarChart2, MapPin, User } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { useVisaoObra } from '../hooks/useObras'
import type { ObraResumoRow } from '../db'
import { Cabecalho, EstadoBadge, SaudeBadge, botaoSecundario } from './ui'
import type { SecaoProps } from './ficha/tipos'
import { Resumo } from './ficha/Resumo'
import { Progresso } from './ficha/Progresso'
import { Equipa } from './ficha/Equipa'
import { Frota } from './ficha/Frota'
import { Ferramentas } from './ficha/Ferramentas'
import { Materiais } from './ficha/Materiais'
import { Subempreitadas } from './ficha/Subempreitadas'
import { Relatorios } from './ficha/Relatorios'
import { Fotos } from './ficha/Fotos'
import { Atividade } from './ficha/Atividade'

type Secao = { chave: string; rotulo: string; Componente: (p: SecaoProps) => React.ReactNode; contagem?: (o: ObraResumoRow) => number }

export const SECOES: Secao[] = [
  { chave: 'resumo', rotulo: 'Resumo', Componente: Resumo },
  { chave: 'progresso', rotulo: 'Progresso', Componente: Progresso, contagem: o => o.afericoes_n },
  { chave: 'equipa', rotulo: 'Equipa', Componente: Equipa, contagem: o => o.equipa_n },
  { chave: 'frota', rotulo: 'Frota', Componente: Frota, contagem: o => o.viaturas_n },
  { chave: 'ferramentas', rotulo: 'Ferramentas', Componente: Ferramentas, contagem: o => o.ferramentas_n },
  { chave: 'materiais', rotulo: 'Materiais', Componente: Materiais },
  { chave: 'subempreitadas', rotulo: 'Subempreitadas', Componente: Subempreitadas, contagem: o => o.subs_n },
  { chave: 'relatorios', rotulo: 'Relatórios', Componente: Relatorios, contagem: o => o.relatorios_n },
  { chave: 'fotos', rotulo: 'Fotos', Componente: Fotos, contagem: o => o.fotos_n },
  { chave: 'atividade', rotulo: 'Atividade', Componente: Atividade },
]

export function ObraFichaPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { podeObras } = useRole()
  const { visao: o, loading, error, reload } = useVisaoObra(id)

  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuAberto) return
    const fora = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [menuAberto])

  if (loading && !o) return <div className="max-w-5xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  if (error || !o || !id) {
    return (
      <div className="max-w-5xl mx-auto py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error ?? 'Obra não encontrada.'}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={reload} className={botaoSecundario}>Tentar de novo</button>
          <Link to="/obras" className={botaoSecundario}>Voltar às obras</Link>
        </div>
      </div>
    )
  }

  const atual = SECOES.find(s => s.chave === params.get('sec')) ?? SECOES[0]
  const Conteudo = atual.Componente
  const escolher = (chave: string) => {
    const novo = new URLSearchParams(params)
    if (chave === 'resumo') novo.delete('sec'); else novo.set('sec', chave)
    setParams(novo, { replace: true })
  }
  const itemMenu = 'flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm hover:bg-accent transition-colors text-left'

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-24">
      <Cabecalho
        titulo={o.nome}
        subtitulo={
          <span className="flex items-center gap-2 flex-wrap">
            <EstadoBadge estado={o.estado} />
            {o.estado === 'ativa' && <SaudeBadge saude={o.saude} />}
            {o.cliente && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />{o.cliente}</span>}
            {(o.localizacao || o.morada) && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{o.localizacao ?? o.morada}</span>}
          </span>
        }
        acoes={
          <>
            <div ref={menuRef} className="relative">
              <button type="button" onClick={() => setMenuAberto(v => !v)} aria-label="Mais ações" aria-expanded={menuAberto}
                className="p-2.5 rounded-xl border border-border hover:bg-accent transition-colors text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {menuAberto && (
                <div className="absolute right-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-20 py-1 min-w-44 enc-scale-in">
                  <button type="button" className={itemMenu} onClick={() => navigate(`/obras/${o.obra_id}/custos`)}>
                    <PieChart className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Custos
                  </button>
                  <button type="button" className={itemMenu} onClick={() => navigate(`/obras/${o.obra_id}/livro`)}>
                    <BookOpen className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Livro de obra
                  </button>
                  <button type="button" className={itemMenu} onClick={() => navigate(`/obras/${o.obra_id}/guias`)}>
                    <Truck className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Guias de transporte
                  </button>
                  <button type="button" className={itemMenu} onClick={() => { window.open(`/obras/${o.obra_id}/relatorio`, '_blank'); setMenuAberto(false) }}>
                    <BarChart2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Relatório financeiro
                  </button>
                </div>
              )}
            </div>
            {podeObras && (
              <Link to={`/obras/${o.obra_id}/editar`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors text-sm font-semibold">
                <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
              </Link>
            )}
          </>
        }
      />

      <nav className="flex border-b border-border overflow-x-auto -mx-1 px-1" aria-label="Secções da obra">
        {SECOES.map(s => {
          const ativa = s === atual
          const n = s.contagem?.(o)
          return (
            <button key={s.chave} type="button" onClick={() => escolher(s.chave)} aria-current={ativa ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                ativa ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {s.rotulo}
              {n != null && n > 0 && <span className="text-[11px] font-semibold px-1.5 rounded-full bg-muted text-muted-foreground">{n}</span>}
            </button>
          )
        })}
      </nav>

      <Conteudo obraId={id} />
    </div>
  )
}
