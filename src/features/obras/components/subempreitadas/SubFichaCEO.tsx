import { useState, type FormEvent } from 'react'
import { fmtEuro } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import { FotoCapture } from '../FotoCapture'
import { FotosGaleria } from '../FotosGaleria'
import { apagarFicheiroContrato, enviarContrato, urlAssinadaContrato } from '../../lib/fotosObras'
import type { FotoObra, Gravidade, TipoOcorrencia } from '../../db'
import { validarOcorrencia } from './subData'
import { useAnexarContrato, useFichaSub, useGuardarFichaSub, useOcorrenciasSub, usePainelSub, useRegistarOcorrencia, useRemoverContrato, useResolverOcorrencia } from './useSubData'
import type { FichaSub } from './subData'

const hojeLisboa = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const input = 'w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm'

export function SubFichaCEO({ subId, obraId }: { subId: string; obraId: string }) {
  const { role, podeSubempreitadas } = useRole()
  const podeMedir = role === 'admin' || role === 'gestor' || role === 'medicoes'
  const { painel, loading: painelLoading, error: painelErro, reload: reloadPainel } = usePainelSub(subId)
  const { ficha, loading: fichaLoading, error: fichaErro, reload: reloadFicha } = useFichaSub(subId)
  const { ocorrencias, loading: ocorrenciasLoading, error: ocorrenciasErro, reload: reloadOcorrencias } = useOcorrenciasSub(subId)
  const { anexar, loading: aAnexar, error: anexarErro } = useAnexarContrato()
  const { remover, loading: aRemover, error: removerErro } = useRemoverContrato()
  const { registar, loading: aRegistar, error: registarErro } = useRegistarOcorrencia()
  const { resolver, loading: aResolver, error: resolverErro } = useResolverOcorrencia()
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoOcorrencia>('PROBLEMA')
  const [gravidade, setGravidade] = useState<Gravidade>('media')
  const [data, setData] = useState(hojeLisboa)
  const [descricao, setDescricao] = useState('')
  const [atraso, setAtraso] = useState('0')
  const [fotos, setFotos] = useState<FotoObra[]>([])
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({})

  const abrirContrato = async () => {
    if (!ficha?.contrato_path) return
    const janela = window.open('', '_blank')
    try {
      const url = await urlAssinadaContrato(ficha.contrato_path)
      if (janela) { janela.opener = null; janela.location.href = url }
      else window.location.assign(url)
    } catch (e) { janela?.close(); setErroLocal(e instanceof Error ? e.message : 'Erro ao abrir contrato.') }
  }
  const carregarContrato = async (file: File | undefined) => {
    if (!file) return
    setErroLocal(null)
    try {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) throw new Error('Escolha um PDF ou imagem.')
      const novo = await enviarContrato(subId, file)
      const ok = await anexar(subId, novo.path, novo.nome)
      if (ok !== null) { if (ficha?.contrato_path) await apagarFicheiroContrato(ficha.contrato_path); reloadFicha(); reloadPainel() }
      else await apagarFicheiroContrato(novo.path)
    } catch (e) { setErroLocal(e instanceof Error ? e.message : 'Erro ao enviar contrato.') }
  }
  const removerAtual = async () => {
    if (!window.confirm('Remover o contrato desta ficha?')) return
    const ok = await remover(subId)
    if (ok !== null) { if (ficha?.contrato_path) { try { await apagarFicheiroContrato(ficha.contrato_path) } catch (e) { setErroLocal(e instanceof Error ? e.message : 'Erro ao apagar contrato.') } } reloadFicha(); reloadPainel() }
  }
  const registarNova = async (e: FormEvent) => {
    e.preventDefault()
    const dias = Number(atraso)
    const erro = validarOcorrencia(descricao, data, hojeLisboa(), dias)
    if (erro) { setErroLocal(erro); return }
    setErroLocal(null)
    const ok = await registar({ subId, tipo, gravidade, data, descricao: descricao.trim(), atraso: dias, fotos })
    if (ok !== null) { setDescricao(''); setAtraso('0'); setFotos([]); reloadOcorrencias(); reloadPainel() }
  }
  const resolverUma = async (id: string) => {
    const resolucao = (resolucoes[id] ?? '').trim()
    if (!resolucao) { setErroLocal('Indique como a ocorrência foi resolvida.'); return }
    const ok = await resolver(id, resolucao)
    if (ok !== null) { reloadOcorrencias(); reloadPainel() }
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-semibold">Painel da contratação</h2>{painelLoading && <p role="status">A carregar painel…</p>}{painelErro && <p role="alert">{painelErro}</p>}{painel && <><span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${painel.saude === 'critico' ? 'bg-destructive/10 text-destructive' : painel.saude === 'atencao' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{painel.saude === 'critico' ? 'Crítico' : painel.saude === 'atencao' ? 'Atenção' : 'Em dia'}</span><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{[['Contrato',fmtEuro(painel.valor_contrato)],['Executado',`${fmtEuro(painel.executado)} (${painel.executado_pct}%)`],['Pago',fmtEuro(painel.pago)],['Por pagar',fmtEuro(painel.por_pagar)],['Retenção',fmtEuro(painel.retencao_acumulada)],['Autos',String(painel.autos_n)],['Atraso',`${painel.atraso_dias_total} dias`],['Ocorrências abertas',String(painel.ocorrencias_abertas.baixa + painel.ocorrencias_abertas.media + painel.ocorrencias_abertas.alta)],['Presenças em relatórios',String(painel.presencas_relatorios)]].map(([k,v]) => <div key={k} className="rounded-xl bg-muted/40 p-2"><span className="block text-xs text-muted-foreground">{k}</span><strong>{v}</strong></div>)}</div>{painel.motivos.length > 0 && <p className="text-xs text-warning">{painel.motivos.join(' · ')}</p>}</>}</section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-semibold">Ficha e contrato</h2>{fichaLoading && <p role="status">A carregar ficha…</p>}{fichaErro && <p role="alert">{fichaErro}</p>}{ficha && <><dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted-foreground">Especialidade</dt><dd>{ficha.especialidade || '—'}</dd></div><div><dt className="text-muted-foreground">NIF</dt><dd>{ficha.nif || '—'}</dd></div><div><dt className="text-muted-foreground">Telefone</dt><dd>{ficha.telefone || '—'}</dd></div><div><dt className="text-muted-foreground">Email</dt><dd>{ficha.email || '—'}</dd></div><div><dt className="text-muted-foreground">Início</dt><dd>{ficha.data_inicio || '—'}</dd></div><div><dt className="text-muted-foreground">Fim previsto</dt><dd>{ficha.data_fim_prevista || '—'}</dd></div></dl>{podeSubempreitadas && <EditarFicha key={`${ficha.nif}-${ficha.email}-${ficha.data_fim_prevista}`} subId={subId} ficha={ficha} onDone={reloadFicha} />}{ficha.contrato_path && <button className="text-sm text-primary underline" onClick={() => void abrirContrato()}>Ver {ficha.contrato_nome || 'contrato'}</button>}{podeSubempreitadas && <div className="flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-xl border border-border px-3 py-2 text-sm">{ficha.contrato_path ? 'Substituir contrato' : 'Anexar contrato'}<input className="sr-only" type="file" accept="application/pdf,image/*" disabled={aAnexar} onChange={e => { void carregarContrato(e.target.files?.[0]); e.target.value = '' }} /></label>{ficha.contrato_path && <button className="rounded-xl border border-border px-3 py-2 text-sm text-destructive" disabled={aRemover} onClick={() => void removerAtual()}>Remover contrato</button>}</div>}</>}</section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-semibold">Ocorrências</h2>{podeMedir && <form onSubmit={e => void registarNova(e)} className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tipo<select className={input} value={tipo} onChange={e => setTipo(e.target.value as TipoOcorrencia)}>{['ATRASO','PROBLEMA','CLIMA','QUALIDADE','SEGURANCA','NOTA'].map(t => <option key={t}>{t}</option>)}</select></label><label className="text-sm">Gravidade<select className={input} value={gravidade} onChange={e => setGravidade(e.target.value as Gravidade)}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></label><label className="text-sm">Data<input type="date" max={hojeLisboa()} className={input} value={data} onChange={e => setData(e.target.value)} required /></label><label className="text-sm">Dias de atraso<input type="number" min="0" step="1" className={input} value={atraso} onChange={e => setAtraso(e.target.value)} /></label><label className="text-sm sm:col-span-2">Descrição<textarea className={input} required value={descricao} onChange={e => setDescricao(e.target.value)} /></label><div className="sm:col-span-2"><FotoCapture obraId={obraId} pasta="subempreitadas" valor={fotos} onChange={setFotos} /></div><button disabled={aRegistar} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground sm:col-span-2">Registar ocorrência</button></form>}{ocorrenciasLoading && <p role="status">A carregar ocorrências…</p>}{ocorrenciasErro && <p role="alert">{ocorrenciasErro}</p>}<ol className="space-y-3">{ocorrencias.map(o => <li key={o.id} className="rounded-xl border border-border p-3 space-y-2"><div className="flex justify-between text-sm"><strong>{o.tipo} · {o.gravidade}</strong><span>{o.data}</span></div><p className="text-sm">{o.descricao}</p>{o.dias_atraso > 0 && <p className="text-xs">{o.dias_atraso} dias de atraso</p>}{o.fotos?.length > 0 && <FotosGaleria fotos={o.fotos.map(f => ({ ...f, data: o.data }))} />}{o.resolvido ? <p className="text-xs text-success">Resolvida: {o.resolucao}</p> : podeMedir && <div className="flex gap-2"><input className={input} aria-label="Resolução" placeholder="Como foi resolvida" value={resolucoes[o.id] ?? ''} onChange={e => setResolucoes(p => ({ ...p, [o.id]: e.target.value }))} /><button className="rounded-xl border border-border px-3 text-sm" disabled={aResolver} onClick={() => void resolverUma(o.id)}>Resolver</button></div>}</li>)}</ol>{!ocorrenciasLoading && !ocorrencias.length && <p className="text-sm text-muted-foreground">Sem ocorrências registadas.</p>}</section>
    {(erroLocal || anexarErro || removerErro || registarErro || resolverErro) && <p role="alert" className="text-sm text-destructive">{erroLocal || anexarErro || removerErro || registarErro || resolverErro}</p>}
  </div>
}

function EditarFicha({ subId, ficha, onDone }: { subId: string; ficha: FichaSub; onDone: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [campos, setCampos] = useState({ nif: ficha.nif ?? '', telefone: ficha.telefone ?? '', email: ficha.email ?? '', especialidade: ficha.especialidade ?? '', data_inicio: ficha.data_inicio ?? '', data_fim_prevista: ficha.data_fim_prevista ?? '' })
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const { guardar, loading, error } = useGuardarFichaSub()
  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (campos.data_inicio && campos.data_fim_prevista && campos.data_fim_prevista < campos.data_inicio) { setErroLocal('O fim previsto deve ser posterior ao início.'); return }
    setErroLocal(null)
    const ok = await guardar(subId, { nif: campos.nif.trim() || null, telefone: campos.telefone.trim() || null, email: campos.email.trim() || null, especialidade: campos.especialidade.trim() || null, data_inicio: campos.data_inicio || null, data_fim_prevista: campos.data_fim_prevista || null })
    if (ok !== null) { setAberto(false); onDone() }
  }
  return aberto ? <form className="grid gap-2 sm:grid-cols-2" onSubmit={e => void submeter(e)}>{([['nif','NIF','text'],['telefone','Telefone','tel'],['email','Email','email'],['especialidade','Especialidade','text'],['data_inicio','Início','date'],['data_fim_prevista','Fim previsto','date']] as const).map(([campo,rotulo,tipo]) => <label key={campo} className="text-sm">{rotulo}<input className={input} type={tipo} value={campos[campo]} onChange={e => setCampos(p => ({ ...p, [campo]: e.target.value }))} /></label>)}<div className="flex gap-2 sm:col-span-2"><button disabled={loading} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">Guardar ficha</button><button type="button" className="rounded-xl border border-border px-3 py-2 text-sm" onClick={() => setAberto(false)}>Cancelar</button></div>{(erroLocal || error) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{erroLocal || error}</p>}</form> : <button className="text-sm text-primary underline" onClick={() => setAberto(true)}>Editar ficha</button>
}
