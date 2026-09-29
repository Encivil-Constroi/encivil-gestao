import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Printer } from 'lucide-react'
import { formatarData } from '@/app/lib/prazoFrota'
import { useFichaViatura, useCatalogo } from '../hooks/useFrota'
import { prazosDaViatura, hojeIso, type Severidade } from '../lib/frota'
import { formatarEuros, formatarKm } from './ui'

const SEV_TXT: Record<string, string> = { URGENTE: 'URGENTE', ATENCAO: 'A vencer', OK: 'Em dia' }
const EST_TXT: Record<string, string> = { OK: 'OK', ATENCAO: 'Atenção', MAU: 'Mau' }

// Folha A4 da viatura: dados, condutor, prazos, manutenções e checklists recentes.
// Rota fora do MainLayout (sem menu) e impressão automática quando os dados chegam.
export function FichaViaturaPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { ficha } = useFichaViatura(id)
  const { catalogo } = useCatalogo()

  const porItem = useMemo(() => new Map(catalogo.map(i => [i.id, i])), [catalogo])
  const prazos = useMemo(() => {
    if (!ficha) return []
    const sev = new Map<string, Severidade>(ficha.alertas.map(a => [a.entidade_id, a.severidade]))
    return prazosDaViatura(catalogo, ficha.itens, sev, ficha.kmAtual)
  }, [ficha, catalogo])

  const pronto = !!ficha && catalogo.length > 0
  useEffect(() => {
    if (!pronto) return
    const t = setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => window.print())), 400)
    return () => clearTimeout(t)
  }, [pronto])

  if (!pronto) return <div className="p-8 text-center text-sm text-gray-500">A preparar a ficha…</div>

  const nome = (colabId: string | null) => (colabId ? ficha.colaboradores.get(colabId) ?? '—' : '—')
  const atual = ficha.atribuicoes.find(a => a.ate === null)
  const th = 'text-left font-semibold text-gray-600 py-1.5 pr-3 border-b border-gray-300'
  const td = 'py-1.5 pr-3 border-b border-gray-100 align-top'

  return (
    <div className="bg-white text-gray-900 min-h-screen p-6 print:p-0">
      <div className="print:hidden fixed top-4 right-4 flex gap-2">
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium">
          <Printer className="w-4 h-4" aria-hidden="true" /> Imprimir / PDF
        </button>
        <button onClick={() => navigate(-1)} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium">Fechar</button>
      </div>

      <div className="max-w-3xl mx-auto space-y-5 text-sm">
        <header className="flex items-start justify-between border-b-2 border-gray-900 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">ENCIVIL · Frota</p>
            <h1 className="text-2xl font-black">Ficha da viatura</h1>
            <p className="text-xl font-bold text-blue-700">{ficha.viatura.nome}</p>
          </div>
          <div className="text-right text-xs text-gray-600 space-y-0.5">
            <p>{ficha.viatura.identificacao ?? '—'} · {ficha.viatura.codigo}</p>
            <p>Km atual: <strong>{formatarKm(ficha.kmAtual)}</strong></p>
            <p>Emitida em {formatarData(hojeIso())}</p>
          </div>
        </header>

        <p>Condutor responsável: <strong>{atual ? nome(atual.colaborador_id) : 'sem condutor atribuído'}</strong>
          {atual && <span className="text-gray-600"> (desde {formatarData(atual.desde)})</span>}</p>

        <section>
          <h2 className="font-bold uppercase text-xs tracking-wide mb-1">Prazos</h2>
          {prazos.length === 0 ? <p className="text-gray-500">Nenhum prazo acompanhado.</p> : (
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Item</th><th className={th}>Próximo prazo</th><th className={th}>Última vez</th><th className={th}>Estado</th></tr></thead>
              <tbody>
                {prazos.map(p => (
                  <tr key={p.config.id}>
                    <td className={td}>{p.item.rotulo}</td>
                    <td className={td}>{[p.textoKm, p.textoData].filter(Boolean).join(' · ') || '—'}</td>
                    <td className={td}>{p.config.ultima_data ? formatarData(p.config.ultima_data) : '—'}{p.config.ultima_km != null ? ` · ${formatarKm(p.config.ultima_km)}` : ''}</td>
                    <td className={`${td} font-semibold`}>{SEV_TXT[p.severidade ?? 'OK']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-bold uppercase text-xs tracking-wide mb-1">Últimas manutenções</h2>
          {ficha.manutencoes.length === 0 ? <p className="text-gray-500">Sem registos.</p> : (
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Data</th><th className={th}>Trabalho</th><th className={th}>Km</th><th className={th}>Oficina</th><th className={th}>Custo</th></tr></thead>
              <tbody>
                {ficha.manutencoes.slice(0, 15).map(m => (
                  <tr key={m.id}>
                    <td className={td}>{formatarData(m.data)}</td>
                    <td className={td}>{m.item_id ? porItem.get(m.item_id)?.rotulo ?? 'Item' : m.descricao}{m.item_id && m.descricao ? ` — ${m.descricao}` : ''}</td>
                    <td className={td}>{formatarKm(m.km_na_altura)}</td>
                    <td className={td}>{m.oficina ?? '—'}</td>
                    <td className={td}>{m.custo != null ? formatarEuros(Number(m.custo)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-bold uppercase text-xs tracking-wide mb-1">Últimos checklists</h2>
          {ficha.checklists.length === 0 ? <p className="text-gray-500">Sem registos.</p> : (
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Data</th><th className={th}>Condutor</th><th className={th}>Estado</th><th className={th}>Problemas encontrados</th></tr></thead>
              <tbody>
                {ficha.checklists.slice(0, 5).map(c => (
                  <tr key={c.id}>
                    <td className={td}>{formatarData(c.data)}</td>
                    <td className={td}>{nome(c.condutor_id)}</td>
                    <td className={`${td} font-semibold`}>{EST_TXT[c.estado_geral]}</td>
                    <td className={td}>
                      {c.itens.filter(i => i.estado !== 'OK').map(i => `${i.rotulo} (${EST_TXT[i.estado]}${i.observacao ? `: ${i.observacao}` : ''})`).join('; ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="grid grid-cols-2 gap-10 pt-10">
          <div className="border-t border-gray-900 pt-1 text-xs text-center">Mecânico</div>
          <div className="border-t border-gray-900 pt-1 text-xs text-center">Condutor responsável</div>
        </footer>
      </div>
    </div>
  )
}
