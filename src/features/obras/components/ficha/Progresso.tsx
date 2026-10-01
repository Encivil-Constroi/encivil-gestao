import { useState, type FormEvent } from 'react'
import { fmtData } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import type { ClimaObra, FaseRow, FotoObra } from '../../db'
import { useAfericoesObra, useApagarFase, useFasesObra, useGuardarFase, useRegistarAfericao } from '../../hooks/useFichaObra'
import { CLIMAS, rotuloClima } from '../../lib/clima'
import { FotoCapture } from '../FotoCapture'
import { FotosGaleria } from '../FotosGaleria'
import { Barra, Seccao, Vazio, botaoPrimario, botaoSecundario, inputCls } from '../ui'
import type { SecaoProps } from './tipos'

const hojeLisboa = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const texto = (valor: string): string | null => valor.trim() || null

export function Progresso({ obraId }: SecaoProps) {
  const { role } = useRole()
  const podeMedir = role === 'admin' || role === 'gestor' || role === 'medicoes'
  const { fases, loading: fasesLoading, error: fasesErro, reload: recarregarFases } = useFasesObra(obraId)
  const { afericoes, loading: afericoesLoading, error: afericoesErro, reload: recarregarAfericoes } = useAfericoesObra(obraId)
  const { guardar, loading: aGuardarFase, error: erroFase } = useGuardarFase()
  const { apagar, loading: aApagar, error: erroApagar } = useApagarFase()
  const { registar, loading: aRegistar, error: erroAfericao } = useRegistarAfericao()
  const [faseAberta, setFaseAberta] = useState(false)
  const [faseId, setFaseId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [peso, setPeso] = useState('1')
  const [progresso, setProgresso] = useState('0')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [notas, setNotas] = useState('')
  const [afericaoAberta, setAfericaoAberta] = useState(false)
  const [data, setData] = useState(hojeLisboa)
  const [pct, setPct] = useState('')
  const [resumo, setResumo] = useState('')
  const [problemas, setProblemas] = useState('')
  const [atrasos, setAtrasos] = useState('0')
  const [motivo, setMotivo] = useState('')
  const [clima, setClima] = useState<ClimaObra | ''>('')
  const [climaDescricao, setClimaDescricao] = useState('')
  const [fotos, setFotos] = useState<FotoObra[]>([])
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const editar = (f: FaseRow) => {
    setFaseId(f.id); setNome(f.nome); setPeso(String(f.peso)); setProgresso(String(f.progresso))
    setInicio(f.data_inicio ?? ''); setFim(f.data_fim_prevista ?? ''); setNotas(f.notas ?? ''); setFaseAberta(true)
  }
  const novaFase = () => {
    setFaseId(null); setNome(''); setPeso('1'); setProgresso('0'); setInicio(''); setFim(''); setNotas(''); setErroLocal(null); setFaseAberta(true)
  }
  const submeterFase = async (e: FormEvent) => {
    e.preventDefault()
    const p = Number(peso), progressoNum = Number(progresso)
    if (!nome.trim() || !Number.isFinite(p) || p <= 0 || !Number.isFinite(progressoNum) || progressoNum < 0 || progressoNum > 100 || (inicio && fim && fim < inicio)) {
      setErroLocal('Verifique o nome, peso, progresso e datas da fase.'); return
    }
    setErroLocal(null)
    const id = await guardar({ p_id: faseId, p_obra_id: obraId, p_nome: nome.trim(), p_peso: p, p_progresso: progressoNum, p_data_inicio: inicio || null, p_data_fim_prevista: fim || null, p_notas: texto(notas) })
    if (id !== null) { setFaseAberta(false); recarregarFases() }
  }
  const remover = async (id: string) => {
    if (!window.confirm('Apagar esta fase?')) return
    await apagar(id); recarregarFases()
  }
  const submeterAfericao = async (e: FormEvent) => {
    e.preventDefault()
    const valor = pct === '' ? null : Number(pct)
    const dias = Number(atrasos)
    if (!resumo.trim() || !data || data > hojeLisboa() || (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100)) || !Number.isInteger(dias) || dias < 0 || (dias > 0 && !motivo.trim())) {
      setErroLocal('Verifique a data, resumo, percentagem e motivo do atraso.'); return
    }
    setErroLocal(null)
    const id = await registar({ p_obra_id: obraId, p_data: data, p_progresso_pct: valor, p_resumo: resumo.trim(), p_problemas: texto(problemas), p_atrasos_dias: dias, p_atraso_motivo: dias ? texto(motivo) : null, p_clima: clima || null, p_clima_descricao: texto(climaDescricao), p_fotos: fotos })
    if (id !== null) { setAfericaoAberta(false); setResumo(''); setProblemas(''); setPct(''); setAtrasos('0'); setMotivo(''); setFotos([]); recarregarAfericoes() }
  }

  return <div className="space-y-4">
    <Seccao titulo="Fases da obra" acao={podeMedir && <button type="button" className={botaoPrimario} onClick={novaFase}>Nova fase</button>}>
      {fasesLoading && !fases.length && <p role="status">A carregar fases…</p>}
      {fasesErro && <p role="alert">{fasesErro} <button type="button" onClick={recarregarFases}>Tentar de novo</button></p>}
      {!fasesLoading && !fases.length && <Vazio>Sem fases definidas.</Vazio>}
      <ol className="space-y-3">{fases.map(f => <li key={f.id} className="rounded-xl border border-border p-3 space-y-2"><div className="flex gap-2 items-start"><strong className="flex-1 text-sm">{f.nome}</strong><span className="text-xs text-muted-foreground">Peso {f.peso}</span>{podeMedir && <><button type="button" className="text-sm text-primary" onClick={() => editar(f)}>Editar</button><button type="button" className="text-sm text-destructive" disabled={aApagar} onClick={() => void remover(f.id)}>Apagar</button></>}</div><Barra pct={f.progresso} rotulo={`${f.nome}: ${f.progresso}%`} /><p className="text-xs text-muted-foreground">{f.progresso}% · {f.estado === 'concluida' ? 'Concluída' : f.estado === 'em_curso' ? 'Em curso' : 'Pendente'}{f.data_fim_prevista && ` · Prevista ${fmtData(f.data_fim_prevista)}`}</p>{f.notas && <p className="text-sm">{f.notas}</p>}</li>)}</ol>
      {erroApagar && <p role="alert" className="text-destructive">{erroApagar}</p>}
      {faseAberta && podeMedir && <form onSubmit={e => void submeterFase(e)} className="rounded-xl border border-border p-4 grid gap-3 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">{faseId ? 'Editar fase' : 'Nova fase'}</h3><label className="text-sm">Nome da fase<input className={inputCls} required value={nome} onChange={e => setNome(e.target.value)} /></label><label className="text-sm">Peso<input className={inputCls} type="number" min="0.01" step="0.01" required value={peso} onChange={e => setPeso(e.target.value)} /></label><label className="text-sm">Progresso (%)<input className={inputCls} type="number" min="0" max="100" step="0.01" required value={progresso} onChange={e => setProgresso(e.target.value)} /></label><label className="text-sm">Início<input className={inputCls} type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label><label className="text-sm">Fim previsto<input className={inputCls} type="date" value={fim} onChange={e => setFim(e.target.value)} /></label><label className="text-sm sm:col-span-2">Notas<textarea className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} /></label><div className="sm:col-span-2 flex gap-2"><button className={botaoPrimario} disabled={aGuardarFase}>Guardar fase</button><button type="button" className={botaoSecundario} onClick={() => setFaseAberta(false)}>Cancelar</button></div>{(erroLocal || erroFase) && <p role="alert" className="text-destructive sm:col-span-2">{erroLocal || erroFase}</p>}</form>}
    </Seccao>
    <Seccao titulo="Aferições do engenheiro" acao={podeMedir && <button type="button" className={botaoPrimario} onClick={() => { setErroLocal(null); setAfericaoAberta(true) }}>Nova aferição</button>}>
      {afericaoAberta && podeMedir && <form onSubmit={e => void submeterAfericao(e)} className="rounded-xl border border-border p-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Data<input className={inputCls} type="date" required max={hojeLisboa()} value={data} onChange={e => setData(e.target.value)} /></label><label className="text-sm">Progresso aferido (%)<input className={inputCls} type="number" min="0" max="100" step="0.01" value={pct} onChange={e => setPct(e.target.value)} /></label><label className="text-sm sm:col-span-2">Resumo dos trabalhos<textarea className={inputCls} required value={resumo} onChange={e => setResumo(e.target.value)} /></label><label className="text-sm sm:col-span-2">Problemas<textarea className={inputCls} value={problemas} onChange={e => setProblemas(e.target.value)} /></label><label className="text-sm">Dias de atraso<input className={inputCls} type="number" min="0" step="1" value={atrasos} onChange={e => setAtrasos(e.target.value)} /></label>{Number(atrasos) > 0 && <label className="text-sm">Motivo do atraso<input className={inputCls} required value={motivo} onChange={e => setMotivo(e.target.value)} /></label>}<label className="text-sm">Clima<select className={inputCls} value={clima} onChange={e => setClima(e.target.value as ClimaObra | '')}><option value="">Não registado</option>{CLIMAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select></label><label className="text-sm">Descrição do clima<input className={inputCls} value={climaDescricao} onChange={e => setClimaDescricao(e.target.value)} /></label><div className="sm:col-span-2"><FotoCapture obraId={obraId} pasta="afericoes" valor={fotos} onChange={setFotos} /></div><div className="sm:col-span-2 flex gap-2"><button className={botaoPrimario} disabled={aRegistar}>Registar aferição</button><button type="button" className={botaoSecundario} onClick={() => setAfericaoAberta(false)}>Cancelar</button></div>{(erroLocal || erroAfericao) && <p role="alert" className="text-destructive sm:col-span-2">{erroLocal || erroAfericao}</p>}</form>}
      {afericoesLoading && !afericoes.length && <p role="status">A carregar aferições…</p>}
      {afericoesErro && <p role="alert">{afericoesErro} <button type="button" onClick={recarregarAfericoes}>Tentar de novo</button></p>}
      {!afericoesLoading && !afericoes.length && <Vazio>Sem aferições registadas.</Vazio>}
      <ol className="space-y-3">{afericoes.map(a => <li key={a.id} className="rounded-xl border border-border p-4 space-y-2"><div className="flex justify-between gap-2"><strong>{fmtData(a.data)}</strong><span className="font-semibold">{a.progresso_pct == null ? 'Sem percentagem' : `${a.progresso_pct}%`}</span></div><p className="text-sm">{a.resumo}</p>{a.problemas && <p className="text-sm">Problemas: {a.problemas}</p>}{a.atrasos_dias > 0 && <p className="text-sm">Atraso: {a.atrasos_dias} dias{a.atraso_motivo && ` · ${a.atraso_motivo}`}</p>}{a.clima && <p className="text-sm">Clima: {rotuloClima(a.clima)}{a.clima_descricao && ` · ${a.clima_descricao}`}</p>}{a.fotos.length > 0 && <FotosGaleria fotos={a.fotos.map(f => ({ ...f, data: a.data }))} />}</li>)}</ol>
    </Seccao>
  </div>
}
