import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDown, ArrowUp, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { fmtEuro } from '@/app/lib/format'
import type { DocsEstadoGlobal, SubsPainelSub } from '../../../db'
import { ROTULO_DOC } from '../../../lib/compliance'
import { SaudeBadge } from '../../ui'

export type ChaveOrdem = 'nome' | 'desvio_pp' | 'taxa_glosa_pct' | 'docs_estado' | 'por_pagar'
type Direcao = 'asc' | 'desc'

const GRAU_DOCS: Record<DocsEstadoGlobal, number> = { ok: 0, a_expirar: 1, critico: 2 }
const DOCS = {
  ok: { rotulo: 'Em dia', cls: 'bg-success/10 text-success', Icone: CheckCircle2 },
  a_expirar: { rotulo: 'A expirar', cls: 'bg-warning/15 text-warning', Icone: AlertTriangle },
  critico: { rotulo: 'Em falta', cls: 'bg-destructive/10 text-destructive', Icone: ShieldAlert },
} as const

function valor(s: SubsPainelSub, c: ChaveOrdem): number | string {
  if (c === 'nome') return s.nome.toLocaleLowerCase('pt-PT')
  if (c === 'docs_estado') return GRAU_DOCS[s.docs_estado]
  if (c === 'desvio_pp') return s.desvio_pp ?? Number.NEGATIVE_INFINITY
  return s[c]
}

export function ordenarSubs(subs: SubsPainelSub[], chave: ChaveOrdem, dir: Direcao): SubsPainelSub[] {
  const f = dir === 'asc' ? 1 : -1
  return [...subs].sort((a, b) => {
    const va = valor(a, chave)
    const vb = valor(b, chave)
    if (va === vb) return a.nome.localeCompare(b.nome, 'pt-PT')
    return (va < vb ? -1 : 1) * f
  })
}

function Cabeca({ rotulo, chave, ativa, dir, onOrdenar, alinhar = 'right' }: { rotulo: string; chave: ChaveOrdem; ativa: ChaveOrdem; dir: Direcao; onOrdenar: (c: ChaveOrdem) => void; alinhar?: 'left' | 'right' }) {
  const sel = ativa === chave
  return (
    <th scope="col" aria-sort={sel ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 font-medium ${alinhar === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => onOrdenar(chave)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground">
        {rotulo}
        {sel && (dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  )
}

export function TabelaSubs({ subs }: { subs: SubsPainelSub[] }) {
  const [chave, setChave] = useState<ChaveOrdem>('por_pagar')
  const [dir, setDir] = useState<Direcao>('desc')
  const linhas = useMemo(() => ordenarSubs(subs, chave, dir), [subs, chave, dir])
  const ordenar = (c: ChaveOrdem) => {
    if (c === chave) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setChave(c); setDir(c === 'nome' ? 'asc' : 'desc') }
  }
  if (!subs.length) return <p className="text-sm text-muted-foreground">Ainda não há subempreitadas com contrato validado.</p>
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Subempreiteiros: desvio físico-financeiro, glosa, documentos e valor por pagar</caption>
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <Cabeca rotulo="Subempreiteiro" chave="nome" ativa={chave} dir={dir} onOrdenar={ordenar} alinhar="left" />
            <Cabeca rotulo="Desvio fís./fin." chave="desvio_pp" ativa={chave} dir={dir} onOrdenar={ordenar} />
            <Cabeca rotulo="Glosa" chave="taxa_glosa_pct" ativa={chave} dir={dir} onOrdenar={ordenar} />
            <Cabeca rotulo="Documentos" chave="docs_estado" ativa={chave} dir={dir} onOrdenar={ordenar} alinhar="left" />
            <Cabeca rotulo="Por pagar" chave="por_pagar" ativa={chave} dir={dir} onOrdenar={ordenar} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map(s => {
            const d = DOCS[s.docs_estado]
            const desvioAlto = s.desvio_pp != null && s.desvio_pp > 10
            return (
              <tr key={s.sub_id} className="align-top">
                <td className="px-3 py-2">
                  <Link to={`/obras/subempreitada/${s.sub_id}`} className="font-medium hover:underline">{s.nome}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{s.obra_nome}</span><SaudeBadge saude={s.saude} />
                    {s.ocorrencias_altas > 0 && <span className="text-destructive">{s.ocorrencias_altas} {s.ocorrencias_altas === 1 ? 'ocorrência grave' : 'ocorrências graves'}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.desvio_pp == null ? <span className="text-muted-foreground">—</span> : (
                    <span className={desvioAlto ? 'font-semibold text-warning' : ''}>
                      {s.desvio_pp > 0 ? '+' : ''}{s.desvio_pp.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} pp
                      {desvioAlto && <span className="block text-xs font-normal">Pago à frente da obra</span>}
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">{s.executado_pct}% fin. · {s.progresso_fisico_pct == null ? 'sem físico' : `${s.progresso_fisico_pct}% fís.`}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={s.taxa_glosa_pct > 10 ? 'font-semibold text-warning' : ''}>{s.taxa_glosa_pct.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%</span>
                  <span className="block text-xs text-muted-foreground">{fmtEuro(s.glosado)}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${d.cls}`}><d.Icone className="h-3 w-3" aria-hidden="true" /> {d.rotulo}</span>
                  {s.docs_em_falta.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{s.docs_em_falta.map(t => ROTULO_DOC[t as keyof typeof ROTULO_DOC] ?? t).join(', ')}</span>}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtEuro(s.por_pagar)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
