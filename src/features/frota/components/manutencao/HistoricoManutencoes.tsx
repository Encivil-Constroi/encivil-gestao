import { useMemo, useState } from 'react'
import { Download, Search, Pencil, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { exportarXlsx } from '@/app/lib/exportXlsx'
import { formatarData } from '@/app/lib/prazoFrota'
import { useHistoricoManutencoes } from '../../hooks/useManutencao'
import { LIMITE_HISTORICO } from '../../services/manutencaoService'
import {
  TIPO_OUTRO, filtrarHistorico, agruparPorDia, totalCusto, nomeDoDia, formatarLeitura, formatarDataHora,
  tituloManutencao, linhasExportacao, periodoMes, periodoAno,
} from '../../lib/manutencao'
import { agruparPorCategoria, ordenar, rotuloCategoria } from '../../lib/frota'
import type { ItemCatalogoRow } from '../../db'
import { ViaturaCombobox, type OpcaoViatura } from '../ViaturaCombobox'
import { DetalheDia } from './DetalheDia'
import { inputCls, botaoSecundario, formatarEuros } from '../ui'

export function HistoricoManutencoes({ viaturas, catalogo, podeEditar }: {
  viaturas: OpcaoViatura[]
  catalogo: ItemCatalogoRow[]
  podeEditar: boolean
}) {
  const [veiculoId, setVeiculoId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState({ desde: '', ate: '' })
  const [tipo, setTipo] = useState('')
  const [texto, setTexto] = useState('')
  const [detalhe, setDetalhe] = useState<{ veiculoId: string; data: string } | null>(null)

  const { linhas, loading, error } = useHistoricoManutencoes({ veiculoId, ...periodo })
  const visiveis = useMemo(() => filtrarHistorico(linhas, { tipo, texto }), [linhas, tipo, texto])
  const dias = useMemo(() => agruparPorDia(visiveis), [visiveis])
  const grupos = useMemo(() => agruparPorCategoria(ordenar(catalogo.filter(i => i.natureza === 'MANUTENCAO'))), [catalogo])
  const nomeViatura = (id: string) => {
    const v = viaturas.find(x => x.id === id)
    return v ? [v.identificacao, v.nome].filter(Boolean).join(' — ') : 'Viatura'
  }
  const filtrosAtivos = !!(veiculoId || periodo.desde || periodo.ate || tipo || texto)

  const exportar = async () => {
    try {
      await exportarXlsx(linhasExportacao(visiveis), 'manutencoes_frota', 'Manutenções')
    } catch {
      toast.error('Não foi possível exportar para Excel.')
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3" aria-label="Filtros do histórico">
        <ViaturaCombobox viaturas={viaturas} valor={veiculoId} onChange={setVeiculoId} opcional
          rotuloCampo="Viatura ou máquina" placeholder="Todas — pesquisar por matrícula…" />

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium space-y-1.5">De
            <input type="date" value={periodo.desde} max={periodo.ate || undefined}
              onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value }))} className={inputCls} />
          </label>
          <label className="text-sm font-medium space-y-1.5">Até
            <input type="date" value={periodo.ate} min={periodo.desde || undefined}
              onChange={e => setPeriodo(p => ({ ...p, ate: e.target.value }))} className={inputCls} />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setPeriodo(periodoMes())} className={`${botaoSecundario} !py-1.5 !px-3`}>Este mês</button>
          <button type="button" onClick={() => setPeriodo(periodoAno())} className={`${botaoSecundario} !py-1.5 !px-3`}>Este ano</button>
          <button type="button" onClick={() => setPeriodo({ desde: '', ate: '' })} className={`${botaoSecundario} !py-1.5 !px-3`}>Todo o período</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm font-medium space-y-1.5">Tipo de manutenção
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
              <option value="">Todos os tipos</option>
              {grupos.map(g => (
                <optgroup key={g.categoria} label={rotuloCategoria(g.categoria)}>
                  {g.itens.map(i => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
                </optgroup>
              ))}
              <option value={TIPO_OUTRO}>Outro (descrição livre)</option>
            </select>
          </label>
          <label className="text-sm font-medium space-y-1.5">Pesquisa livre
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input value={texto} onChange={e => setTexto(e.target.value)} className={`${inputCls} pl-10`}
                placeholder="Oficina, observações…" />
            </div>
          </label>
        </div>

        {filtrosAtivos && (
          <button type="button" className="text-sm text-primary font-medium"
            onClick={() => { setVeiculoId(null); setPeriodo({ desde: '', ate: '' }); setTipo(''); setTexto('') }}>
            Limpar filtros
          </button>
        )}
      </section>

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm flex-1" aria-live="polite">
          <strong>{visiveis.length}</strong> {visiveis.length === 1 ? 'intervenção' : 'intervenções'} · custo total{' '}
          <strong>{formatarEuros(totalCusto(visiveis))}</strong>
        </p>
        <button type="button" onClick={exportar} disabled={visiveis.length === 0} className={botaoSecundario}>
          <Download className="w-4 h-4" aria-hidden="true" /> Exportar Excel
        </button>
      </div>

      {linhas.length >= LIMITE_HISTORICO && (
        <p className="text-xs text-warning">Só as {LIMITE_HISTORICO.toLocaleString('pt-PT')} intervenções mais recentes são mostradas — restrinja o período.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && linhas.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>}
      {!loading && !error && visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Sem manutenções para estes filtros.</p>
      )}

      {dias.map(d => (
        <section key={d.data} aria-label={formatarData(d.data)} className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-sm font-semibold capitalize flex-1">{nomeDoDia(d.data)}</h3>
            <span className="text-xs text-muted-foreground">{d.linhas.length} · {formatarEuros(d.custo)}</span>
          </div>
          <ul className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {d.linhas.map(l => (
              <li key={l.id}>
                <button type="button" onClick={() => setDetalhe({ veiculoId: l.veiculo_id, data: l.data })}
                  aria-label={`Ver detalhe: ${l.identificacao ?? l.veiculo_nome}, ${tituloManutencao(l)}`}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/40 active:bg-accent/60 transition-colors">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold shrink-0">{l.identificacao ?? l.veiculo_nome}</span>
                      <span className="text-sm truncate">{tituloManutencao(l)}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[l.item_rotulo && l.descricao ? l.descricao : null, formatarLeitura(l.km_na_altura, l.unidade_contador) !== '—' ? formatarLeitura(l.km_na_altura, l.unidade_contador) : null, l.oficina]
                        .filter(Boolean).join(' · ') || 'Sem mais dados'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Registado por {l.registado_por} · {formatarDataHora(l.registado_em)}
                    </span>
                    {l.editado_em && l.editado_por && (
                      <span className="flex items-center gap-1 text-xs text-warning">
                        <Pencil className="w-3 h-3" aria-hidden="true" /> editado por {l.editado_por} em {formatarDataHora(l.editado_em)}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-medium shrink-0">{l.custo != null ? formatarEuros(Number(l.custo)) : '—'}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {detalhe && (
        <DetalheDia veiculoId={detalhe.veiculoId} nomeViatura={nomeViatura(detalhe.veiculoId)} data={detalhe.data}
          catalogo={catalogo} podeEditar={podeEditar} aoFechar={() => setDetalhe(null)} />
      )}
    </div>
  )
}
