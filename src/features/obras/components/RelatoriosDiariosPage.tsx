import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePainelObras } from '../hooks/useObras'
import { useRelatoriosDiarios } from '../hooks/useRelatoriosDiarios'
import { ListaRelatorios } from './relatorios/ListaRelatorios'
import { CampoSelect, CLASSE_CAMPO } from '@/app/components/CampoSelect'
import { Seccao } from './ui'

export function RelatoriosDiariosPage() {
  const [params, setParams] = useSearchParams()
  const [autor, setAutor] = useState('')
  const obraId = params.get('obra') || ''
  const estadoParam = params.get('estado')
  const estado: 'rascunho' | 'submetido' | null = estadoParam === 'rascunho' ? 'rascunho' : estadoParam === 'submetido' ? 'submetido' : null
  const filtros = { obraId: obraId || null, desde: params.get('desde'), ate: params.get('ate'), estado, soOcorrencias: params.get('ocorrencias') === '1' }
  const { relatorios, loading, error, reload } = useRelatoriosDiarios(filtros)
  const { obras } = usePainelObras()
  const autores = useMemo(() => Array.from(new Map(relatorios.map(r => [r.autor_id, r.autor_nome || 'Autor desconhecido'])).entries()), [relatorios])
  const visiveis = autor ? relatorios.filter(r => r.autor_id === autor) : relatorios
  const atualizar = (chave: string, valor: string) => {
    const novos = new URLSearchParams(params)
    if (valor) novos.set(chave, valor)
    else novos.delete(chave)
    setParams(novos)
  }
  return <div className="space-y-4">
    <div><h2 className="text-base font-semibold">Relatórios diários</h2><p className="text-sm text-muted-foreground">Acompanhe os dias de obra, a equipa e as ocorrências.</p></div>
    <Seccao titulo="Filtros"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <label className="grid gap-1.5 text-sm font-medium">Obra<CampoSelect aria-label="Obra" value={obraId} onChange={e => atualizar('obra', e.target.value)}><option value="">Todas as obras</option>{obras.map(o => <option key={o.obra_id} value={o.obra_id}>{o.nome}</option>)}</CampoSelect></label>
      <label className="grid gap-1.5 text-sm font-medium">Desde<input aria-label="Desde" type="date" className={CLASSE_CAMPO} value={filtros.desde || ''} onChange={e => atualizar('desde', e.target.value)} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Até<input aria-label="Até" type="date" className={CLASSE_CAMPO} value={filtros.ate || ''} onChange={e => atualizar('ate', e.target.value)} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Estado<CampoSelect aria-label="Estado" value={estado || ''} onChange={e => atualizar('estado', e.target.value)}><option value="">Todos</option><option value="rascunho">Rascunhos</option><option value="submetido">Submetidos</option></CampoSelect></label>
      <label className="grid gap-1.5 text-sm font-medium">Autor<CampoSelect aria-label="Autor" value={autor} onChange={e => setAutor(e.target.value)}><option value="">Todos</option>{autores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</CampoSelect></label>
      <label className="flex items-center gap-2 text-sm col-span-2 md:col-span-1 md:self-end md:min-h-11"><input type="checkbox" checked={filtros.soOcorrencias} onChange={e => atualizar('ocorrencias', e.target.checked ? '1' : '')} />Só com ocorrências</label>
    </div></Seccao>
    {error && <div role="alert" className="text-sm text-destructive">{error} <button type="button" onClick={reload} className="underline">Tentar de novo</button></div>}
    {loading ? <p className="text-sm text-muted-foreground">A carregar relatórios…</p> : <ListaRelatorios relatorios={visiveis} />}
  </div>
}
