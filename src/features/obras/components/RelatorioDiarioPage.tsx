import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/features/auth/AuthContext'
import { useRole } from '@/features/auth/useRole'
import type { ClimaObra } from '../db'
import { CLIMAS, rotuloClima } from '../lib/clima'
import { hojeLisboa, validarRelatorioParaSubmissao, type DadosRelatorio } from '../lib/relatorioDiario'
import { urlFotoObra } from '../lib/fotosObras'
import { useEquipaRelatorio, useGuardarRelatorioDiario, usePodeRelatarObra, useReabrirRelatorioDiario, useRelatorioDiario, useSubempreitadasRelatorio, useSubmeterRelatorioDiario } from '../hooks/useRelatoriosDiarios'
import { FotoCapture } from './FotoCapture'
import { Cabecalho, Seccao, botaoPrimario, botaoSecundario, inputCls } from './ui'

function dadosIniciais(): DadosRelatorio {
  return { data: hojeLisboa(), clima: null, temperatura_c: null, clima_descricao: '', equipa_ids: [], equipa_outros: '', subempreiteiros_ids: [], trabalhos: '', houve_ocorrencias: false, ocorrencias: '', observacoes: '', fotos: [] }
}

function RelatorioImprimivel({ relatorio }: { relatorio: NonNullable<ReturnType<typeof useRelatorioDiario>['relatorio']> }) {
  return <article className="bg-card rounded-2xl border border-border p-5 print:border-0 print:p-0 space-y-5">
    <header><h2 className="text-xl font-semibold">Relatório diário · {relatorio.obra_nome}</h2><p className="text-sm text-muted-foreground">{new Date(`${relatorio.data}T12:00:00`).toLocaleDateString('pt-PT')} · {relatorio.autor_nome || 'Autor desconhecido'} · {relatorio.estado === 'submetido' ? 'Submetido' : 'Rascunho'}</p></header>
    <div className="grid sm:grid-cols-2 gap-4 text-sm"><div><strong>Clima</strong><p>{rotuloClima(relatorio.clima)}{relatorio.temperatura_c != null ? ` · ${relatorio.temperatura_c} °C` : ''}</p><p>{relatorio.clima_descricao}</p></div><div><strong>Equipa presente</strong><p>{[...relatorio.equipa.map(e => e.nome), relatorio.equipa_outros].filter(Boolean).join(', ') || '—'}</p></div></div>
    <div className="text-sm"><strong>Subempreiteiros presentes</strong><p>{relatorio.subempreiteiros.map(s => s.nome).join(', ') || '—'}</p></div>
    <div className="text-sm"><strong>Trabalhos realizados</strong><p className="whitespace-pre-wrap">{relatorio.trabalhos || '—'}</p></div>
    {relatorio.houve_ocorrencias && <div className="text-sm rounded-xl bg-destructive/10 p-3"><strong>Ocorrências</strong><p className="whitespace-pre-wrap">{relatorio.ocorrencias}</p></div>}
    {relatorio.observacoes && <div className="text-sm"><strong>Observações</strong><p className="whitespace-pre-wrap">{relatorio.observacoes}</p></div>}
    {relatorio.fotos.length > 0 && <div><strong className="text-sm">Fotografias</strong><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">{relatorio.fotos.map(f => <figure key={f.path}><img src={urlFotoObra(f.path) ?? ''} alt={f.legenda || 'Foto do relatório'} className="w-full aspect-square object-cover rounded-lg" /><figcaption className="text-xs mt-1">{f.legenda}</figcaption></figure>)}</div></div>}
    {relatorio.reaberto_motivo && <p className="text-xs text-muted-foreground">Reaberto por {relatorio.reaberto_por_nome || 'admin'}: {relatorio.reaberto_motivo}</p>}
  </article>
}

export function RelatorioDiarioPage() {
  const { id: novaObraId, rid } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin, isGestor } = useRole()
  const { relatorio, loading, error, reload } = useRelatorioDiario(rid)
  const obraIdRef = useRef(novaObraId)
  const obraId = novaObraId || relatorio?.obra_id || obraIdRef.current
  const podeRelatar = usePodeRelatarObra(obraId)
  const { equipa } = useEquipaRelatorio(obraId)
  const { subempreitadas } = useSubempreitadasRelatorio(obraId)
  const guardarMut = useGuardarRelatorioDiario()
  const submeterMut = useSubmeterRelatorioDiario()
  const reabrirMut = useReabrirRelatorioDiario()
  const [dados, setDados] = useState<DadosRelatorio>(dadosIniciais)
  const [revisao, setRevisao] = useState(0)
  const [guardado, setGuardado] = useState(false)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [mostrarReabrir, setMostrarReabrir] = useState(false)
  const idRef = useRef<string | null>(rid || null)
  const filaRef = useRef<Promise<string | null>>(Promise.resolve(null))
  const temporizadorRef = useRef<number | null>(null)
  const revisaoRef = useRef(0)
  const iniciouRef = useRef(false)

  useEffect(() => {
    if (relatorio && !iniciouRef.current) {
      iniciouRef.current = true
      idRef.current = relatorio.id
      setDados({ data: relatorio.data, clima: relatorio.clima, temperatura_c: relatorio.temperatura_c, clima_descricao: relatorio.clima_descricao || '', equipa_ids: relatorio.equipa_ids, equipa_outros: relatorio.equipa_outros || '', subempreiteiros_ids: relatorio.subempreiteiros_ids, trabalhos: relatorio.trabalhos || '', houve_ocorrencias: relatorio.houve_ocorrencias, ocorrencias: relatorio.ocorrencias || '', observacoes: relatorio.observacoes || '', fotos: relatorio.fotos })
    }
  }, [relatorio])

  const editar = (patch: Partial<DadosRelatorio>) => { setDados(d => ({ ...d, ...patch })); revisaoRef.current++; setRevisao(revisaoRef.current); setGuardado(false); setErroLocal(null) }
  const guardarNaFila = (snapshot: DadosRelatorio): Promise<string | null> => {
    if (!obraId) return Promise.resolve(null)
    const revisaoGuardada = revisaoRef.current
    const tarefa = filaRef.current.catch(() => null).then(async () => {
      const resultado = await guardarMut.guardar(idRef.current, obraId, snapshot)
      if (resultado) {
        const eraNovo = !idRef.current
        idRef.current = resultado
        if (revisaoRef.current === revisaoGuardada) setGuardado(true)
        if (eraNovo) { iniciouRef.current = true; navigate(`/obras/relatorio-diario/${resultado}`, { replace: true }) }
      }
      return resultado
    })
    filaRef.current = tarefa
    return tarefa
  }

  useEffect(() => {
    if (revisao === 0 || !obraId || (rid && !iniciouRef.current)) return
    temporizadorRef.current = window.setTimeout(() => { temporizadorRef.current = null; void guardarNaFila(dados) }, 1000)
    return () => { if (temporizadorRef.current != null) window.clearTimeout(temporizadorRef.current) }
  // Autosave depende da revisão; outras alterações antes do prazo reiniciam o temporizador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisao, obraId])

  const submeter = async () => {
    const problema = validarRelatorioParaSubmissao(dados)
    if (problema) { setErroLocal(problema); return }
    if (temporizadorRef.current != null) { window.clearTimeout(temporizadorRef.current); temporizadorRef.current = null }
    const id = await guardarNaFila(dados)
    if (!id) return
    if (await submeterMut.submeter(id)) { reload(); navigate(`/obras/relatorio-diario/${id}`, { replace: true }) }
  }
  const reabrir = async () => {
    if (!rid || !motivo.trim()) { setErroLocal('Indique o motivo da reabertura.'); return }
    if (await reabrirMut.reabrir(rid, motivo.trim())) { iniciouRef.current = false; setMostrarReabrir(false); setMotivo(''); reload() }
  }

  if (rid && error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (rid && !relatorio) return <p className="text-sm text-muted-foreground">{loading ? 'A carregar relatório…' : 'A preparar relatório…'}</p>
  if (!obraId) return <p role="alert">Obra não encontrada.</p>
  const submetido = relatorio?.estado === 'submetido'
  const podeEditar = !submetido && (isAdmin || isGestor || (podeRelatar && (!rid || relatorio?.autor_id === user?.id)))
  const erro = erroLocal || guardarMut.error || submeterMut.error || reabrirMut.error
  return <div className="max-w-3xl mx-auto space-y-4 pb-24 print:max-w-none print:pb-0">
    <div className="print:hidden"><Cabecalho titulo={submetido ? 'Relatório diário' : rid ? 'Editar relatório diário' : 'Novo relatório diário'} subtitulo={relatorio?.obra_nome} acoes={<Link to={`/obras/${obraId}?sec=relatorios`} className={botaoSecundario}>Ver obra</Link>} /></div>
    {submetido ? <>
      <RelatorioImprimivel relatorio={relatorio} />
      <div className="flex gap-2 print:hidden"><button type="button" onClick={() => window.print()} className={botaoSecundario}>Imprimir</button>{isAdmin && <button type="button" onClick={() => setMostrarReabrir(true)} className={botaoSecundario}>Reabrir relatório</button>}</div>
      {mostrarReabrir && <Seccao titulo="Reabrir relatório"><label className="text-sm">Motivo<textarea className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)} /></label><button type="button" onClick={() => void reabrir()} disabled={reabrirMut.loading} className={botaoPrimario}>Confirmar reabertura</button></Seccao>}
    </> : <>
      <p className="text-xs text-muted-foreground" role="status">{guardarMut.loading ? 'A guardar rascunho…' : guardado ? 'Rascunho guardado' : 'O rascunho é guardado automaticamente'}</p>
      <Seccao titulo="Dia e clima"><div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Data<input type="date" max={hojeLisboa()} value={dados.data} onChange={e => editar({ data: e.target.value })} disabled={!podeEditar} className={inputCls} /></label><label className="text-sm">Temperatura (°C)<input type="number" min={-50} max={60} value={dados.temperatura_c ?? ''} onChange={e => editar({ temperatura_c: e.target.value ? Number(e.target.value) : null })} disabled={!podeEditar} className={inputCls} /></label></div>
        <label className="text-sm">Clima<select value={dados.clima || ''} onChange={e => editar({ clima: e.target.value as ClimaObra || null })} disabled={!podeEditar} className={inputCls}><option value="">Selecione</option>{CLIMAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select></label>
        <label className="text-sm">Descrição do clima<input value={dados.clima_descricao} onChange={e => editar({ clima_descricao: e.target.value })} disabled={!podeEditar} className={inputCls} /></label></Seccao>
      <Seccao titulo="Equipa presente"><div className="flex gap-2 flex-wrap"><button type="button" className={botaoSecundario} disabled={!podeEditar} onClick={() => editar({ equipa_ids: equipa.filter(e => e.presente_hoje).map(e => e.colaborador_id) })}>Marcar presentes hoje</button><button type="button" className={botaoSecundario} disabled={!podeEditar} onClick={() => editar({ equipa_ids: equipa.map(e => e.colaborador_id) })}>Marcar todos</button></div><div className="grid sm:grid-cols-2 gap-2">{equipa.map(e => <label key={e.colaborador_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dados.equipa_ids.includes(e.colaborador_id)} disabled={!podeEditar} onChange={ev => editar({ equipa_ids: ev.target.checked ? [...dados.equipa_ids, e.colaborador_id] : dados.equipa_ids.filter(x => x !== e.colaborador_id) })} />{e.nome}</label>)}</div><label className="text-sm">Outros presentes<textarea value={dados.equipa_outros} onChange={e => editar({ equipa_outros: e.target.value })} disabled={!podeEditar} placeholder="Nomes de pessoas fora da equipa alocada" className={inputCls} /></label></Seccao>
      <Seccao titulo="Subempreiteiros presentes"><div className="grid sm:grid-cols-2 gap-2">{subempreitadas.map(s => <label key={s.sub_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dados.subempreiteiros_ids.includes(s.sub_id)} disabled={!podeEditar} onChange={e => editar({ subempreiteiros_ids: e.target.checked ? [...dados.subempreiteiros_ids, s.sub_id] : dados.subempreiteiros_ids.filter(x => x !== s.sub_id) })} />{s.nome}</label>)}</div>{subempreitadas.length === 0 && <p className="text-sm text-muted-foreground">Sem subempreitadas nesta obra.</p>}</Seccao>
      <Seccao titulo="Trabalhos e ocorrências"><label className="text-sm">Trabalhos realizados<textarea value={dados.trabalhos} onChange={e => editar({ trabalhos: e.target.value })} disabled={!podeEditar} rows={4} className={inputCls} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dados.houve_ocorrencias} disabled={!podeEditar} onChange={e => editar({ houve_ocorrencias: e.target.checked, ocorrencias: e.target.checked ? dados.ocorrencias : '' })} />Houve ocorrências</label>{dados.houve_ocorrencias && <label className="text-sm">Descreva as ocorrências<textarea value={dados.ocorrencias} onChange={e => editar({ ocorrencias: e.target.value })} disabled={!podeEditar} rows={3} className={inputCls} /></label>}<label className="text-sm">Observações<textarea value={dados.observacoes} onChange={e => editar({ observacoes: e.target.value })} disabled={!podeEditar} rows={3} className={inputCls} /></label></Seccao>
      <Seccao titulo="Fotografias"><FotoCapture obraId={obraId} pasta="relatorios" valor={dados.fotos} onChange={fotos => editar({ fotos })} desativado={!podeEditar} /></Seccao>
      {podeEditar && <div className="flex gap-2 flex-wrap"><button type="button" onClick={() => void guardarNaFila(dados)} disabled={guardarMut.loading} className={botaoSecundario}>Guardar rascunho</button><button type="button" onClick={() => void submeter()} disabled={guardarMut.loading || submeterMut.loading} className={botaoPrimario}>Submeter relatório</button></div>}
    </>}
    {erro && <p role="alert" className="text-sm text-destructive print:hidden">{erro}</p>}
  </div>
}
