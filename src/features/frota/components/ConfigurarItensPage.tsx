import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useRole } from '@/features/auth/useRole'
import { useFichaViatura, useCatalogo, useConfigurarItem } from '../hooks/useFrota'
import { ordenar, agruparPorCategoria, rotuloCategoria, textoIntervalo, numeroOuNulo } from '../lib/frota'
import type { ItemCatalogoRow, VeiculoItemRow } from '../db'
import { Cabecalho, Seccao, inputCls, botaoPrimario, botaoSecundario } from './ui'

type Configurar = ReturnType<typeof useConfigurarItem>['configurar']

function Interruptor({ ligado, onChange, disabled, rotulo }: { ligado: boolean; onChange: () => void; disabled?: boolean; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={onChange} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${ligado ? 'bg-primary' : 'bg-muted'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function ItemChecklist({ item, config, veiculoId, configurar, pode }: {
  item: ItemCatalogoRow; config?: VeiculoItemRow; veiculoId: string; configurar: Configurar; pode: boolean
}) {
  const [aGuardar, setAGuardar] = useState(false)
  const aplica = config?.ativo ?? true   // itens de checklist aplicam-se por omissão
  const alternar = async () => {
    setAGuardar(true)
    const ok = await configurar({ veiculoId, itemId: item.id, ativo: !aplica, intervaloKm: null, intervaloMeses: null, proximaKm: null, proximaData: null })
    setAGuardar(false)
    if (ok) toast.success(!aplica ? `"${item.rotulo}" volta ao checklist.` : `"${item.rotulo}" fora do checklist desta viatura.`)
  }
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className={`text-sm ${aplica ? '' : 'text-muted-foreground line-through'}`}>{item.rotulo}</span>
      <Interruptor ligado={aplica} onChange={alternar} disabled={!pode || aGuardar} rotulo={`${item.rotulo} no checklist`} />
    </li>
  )
}

function ItemManutencao({ item, config, veiculoId, configurar, pode }: {
  item: ItemCatalogoRow; config?: VeiculoItemRow; veiculoId: string; configurar: Configurar; pode: boolean
}) {
  const acompanhado = !!config?.ativo
  const [aberto, setAberto] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [f, setF] = useState({
    intervaloKm:    config?.intervalo_km?.toString() ?? '',
    intervaloMeses: config?.intervalo_meses?.toString() ?? '',
    proximaKm:      config?.proxima_km?.toString() ?? '',
    proximaData:    config?.proxima_data ?? '',
  })

  const guardar = async (ativo: boolean) => {
    const intervaloKm = numeroOuNulo(f.intervaloKm)
    const intervaloMeses = numeroOuNulo(f.intervaloMeses)
    const proximaKm = numeroOuNulo(f.proximaKm)
    for (const [n, rot] of [[intervaloKm, 'intervalo em km'], [intervaloMeses, 'intervalo em meses'], [proximaKm, 'próxima km']] as const) {
      if (n !== null && (!Number.isFinite(n) || n < 0 || (rot !== 'próxima km' && n === 0))) {
        toast.error(`Valor inválido: ${rot}.`); return
      }
    }
    if (intervaloMeses !== null && !Number.isInteger(intervaloMeses)) { toast.error('O intervalo em meses tem de ser um número inteiro.'); return }
    if (ativo && proximaKm === null && !f.proximaData) {
      toast.error('Indique a próxima data e/ou os km do próximo prazo.'); return
    }
    setAGuardar(true)
    const ok = await configurar({
      veiculoId, itemId: item.id, ativo, intervaloKm, intervaloMeses, proximaKm, proximaData: f.proximaData || null,
    })
    setAGuardar(false)
    if (ok) {
      toast.success(ativo ? `"${item.rotulo}" guardado.` : `"${item.rotulo}" deixou de ser acompanhado.`)
      setAberto(false)
    }
  }

  return (
    <li className="py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm ${acompanhado ? 'font-medium' : 'text-muted-foreground'}`}>{item.rotulo}</p>
          <p className="text-xs text-muted-foreground">
            {acompanhado ? textoIntervalo(config!.intervalo_km ?? item.intervalo_km_padrao, config!.intervalo_meses ?? item.intervalo_meses_padrao)
              : `Não acompanhado · por omissão ${textoIntervalo(item.intervalo_km_padrao, item.intervalo_meses_padrao)}`}
          </p>
        </div>
        {pode && !aberto && (
          <button onClick={() => setAberto(true)} className="text-sm text-primary font-medium shrink-0">
            {acompanhado ? 'Editar' : 'Acompanhar'}
          </button>
        )}
      </div>

      {aberto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/40 rounded-xl p-3">
          <label className="text-xs font-medium space-y-1">Próxima data
            <input type="date" value={f.proximaData} onChange={e => setF({ ...f, proximaData: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium space-y-1">Próximos km
            <input inputMode="numeric" value={f.proximaKm} onChange={e => setF({ ...f, proximaKm: e.target.value })} className={inputCls} placeholder="Ex: 125000" />
          </label>
          <label className="text-xs font-medium space-y-1">Intervalo (km) — só nesta viatura
            <input inputMode="numeric" value={f.intervaloKm} onChange={e => setF({ ...f, intervaloKm: e.target.value })} className={inputCls}
              placeholder={item.intervalo_km_padrao ? `Catálogo: ${item.intervalo_km_padrao}` : 'Sem intervalo em km'} />
          </label>
          <label className="text-xs font-medium space-y-1">Intervalo (meses) — só nesta viatura
            <input inputMode="numeric" value={f.intervaloMeses} onChange={e => setF({ ...f, intervaloMeses: e.target.value })} className={inputCls}
              placeholder={item.intervalo_meses_padrao ? `Catálogo: ${item.intervalo_meses_padrao}` : 'Sem intervalo em meses'} />
          </label>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Deixe os intervalos vazios para usar os do catálogo. Ao registar uma manutenção deste item, o próximo prazo é calculado sozinho.
          </p>
          <div className="sm:col-span-2 flex gap-2 flex-wrap">
            <button onClick={() => guardar(true)} disabled={aGuardar} className={botaoPrimario}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
            {acompanhado && <button onClick={() => guardar(false)} disabled={aGuardar} className={botaoSecundario}>Deixar de acompanhar</button>}
            <button onClick={() => setAberto(false)} disabled={aGuardar} className={botaoSecundario}>Cancelar</button>
          </div>
        </div>
      )}
    </li>
  )
}

export function ConfigurarItensPage() {
  const { id } = useParams()
  const { ficha, loading } = useFichaViatura(id)
  const { catalogo, loading: aCarregarCatalogo } = useCatalogo()
  const { configurar } = useConfigurarItem()
  const { podeFrota } = useRole()

  const configPorItem = useMemo(() => new Map((ficha?.itens ?? []).map(c => [c.item_id, c])), [ficha])
  const ativos = useMemo(() => ordenar(catalogo.filter(i => i.ativo)), [catalogo])
  const manutencao = agruparPorCategoria(ativos.filter(i => i.natureza === 'MANUTENCAO'))
  const checklist  = agruparPorCategoria(ativos.filter(i => i.natureza === 'CHECKLIST'))

  if ((loading && !ficha) || (aCarregarCatalogo && catalogo.length === 0)) {
    return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-muted-foreground">A carregar…</div>
  }
  if (!ficha || !id) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-destructive">Viatura não encontrada.</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      <Cabecalho titulo="Ficha de revisão — itens e prazos" subtitulo={`${ficha.viatura.nome} — o que acompanhar nesta viatura`} />

      <Seccao titulo="Prazos a acompanhar (geram alertas)">
        {manutencao.map(g => (
          <div key={g.categoria}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2">{rotuloCategoria(g.categoria)}</p>
            <ul className="divide-y divide-border">
              {g.itens.map(i => (
                <ItemManutencao key={`${i.id}-${configPorItem.get(i.id)?.atualizado_em ?? ''}`} item={i} config={configPorItem.get(i.id)}
                  veiculoId={id} configurar={configurar} pode={podeFrota} />
              ))}
            </ul>
          </div>
        ))}
      </Seccao>

      <Seccao titulo="Itens do checklist desta viatura">
        <p className="text-xs text-muted-foreground">Desligue o que não se aplica a esta viatura (ex.: AdBlue numa carrinha sem SCR).</p>
        {checklist.map(g => (
          <div key={g.categoria}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2">{rotuloCategoria(g.categoria)}</p>
            <ul className="divide-y divide-border">
              {g.itens.map(i => (
                <ItemChecklist key={i.id} item={i} config={configPorItem.get(i.id)} veiculoId={id} configurar={configurar} pode={podeFrota} />
              ))}
            </ul>
          </div>
        ))}
      </Seccao>
    </div>
  )
}
