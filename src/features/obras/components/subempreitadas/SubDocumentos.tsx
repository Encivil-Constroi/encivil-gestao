import { useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, FileText, ShieldAlert, FileX } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { fmtData } from '@/app/lib/format'
import { useRole } from '@/features/auth/useRole'
import type { EstadoDocSub, SubDocEstadoRow, TipoDocSub } from '../../db'
import { useDocsSub, useEstadoDocsSub, useRegistarDocSub, useRemoverDocSub } from '../../hooks/useSubsControlo'
import { ROTULO_DOC } from '../../lib/compliance'
import { urlAssinadaContrato } from '../../lib/fotosObras'
import { Seccao, Vazio, botaoPrimario, botaoSecundario, inputCls } from '../ui'

const BUCKET = 'obras-contratos'
const TAMANHO_MAX = 20 * 1024 * 1024
const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
}
const TIPOS = Object.keys(ROTULO_DOC) as TipoDocSub[]

const SELO: Record<EstadoDocSub, { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  ok: { rotulo: 'Em dia', cls: 'bg-success/10 text-success', Icone: CheckCircle2 },
  a_expirar: { rotulo: 'A expirar', cls: 'bg-warning/10 text-warning', Icone: AlertTriangle },
  expirado: { rotulo: 'Expirado', cls: 'bg-destructive/10 text-destructive', Icone: ShieldAlert },
  em_falta: { rotulo: 'Em falta', cls: 'bg-destructive/10 text-destructive', Icone: FileX },
}

export function caminhoDocumento(subId: string, mime: string, agora = Date.now()): string | null {
  const ext = EXT[mime]
  return ext ? `${subId}/doc-${agora}.${ext}` : null
}

function Selo({ estado }: { estado: EstadoDocSub }) {
  const { rotulo, cls, Icone } = SELO[estado]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      <Icone className="w-3 h-3" aria-hidden="true" /> {rotulo}
    </span>
  )
}

function detalheValidade(e: SubDocEstadoRow): string | null {
  if (e.estado === 'em_falta') return e.obrigatorio ? 'Documento obrigatório por carregar' : null
  if (!e.validade) return 'Sem data de validade'
  if (e.dias_restantes == null) return `Válido até ${fmtData(e.validade)}`
  if (e.dias_restantes < 0) return `Expirou em ${fmtData(e.validade)}`
  return `Válido até ${fmtData(e.validade)} (${e.dias_restantes} dia${e.dias_restantes === 1 ? '' : 's'})`
}

export function SubDocumentos({ subId }: { subId: string }) {
  const { podeSubempreitadas, podeObras } = useRole()
  const { estados, loading: aCarregarEstados, error: erroEstados, reload } = useEstadoDocsSub(subId)
  const { documentos } = useDocsSub(subId)
  const { registar, loading: aRegistar, error: erroRegistar } = useRegistarDocSub()
  const { remover, loading: aRemover, error: erroRemover } = useRemoverDocSub()
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoDocSub>('CERT_SS')
  const [referencia, setReferencia] = useState('')
  const [emitido, setEmitido] = useState('')
  const [validade, setValidade] = useState('')
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const ver = async (path: string) => {
    try {
      const url = await urlAssinadaContrato(path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : 'Não foi possível abrir o documento.')
    }
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    if (!ficheiro) { setErroLocal('Escolha o ficheiro do documento.'); return }
    if (ficheiro.size > TAMANHO_MAX) { setErroLocal('O ficheiro tem mais de 20 MB.'); return }
    const caminho = caminhoDocumento(subId, ficheiro.type)
    if (!caminho) { setErroLocal('Formato não suportado. Use PDF ou imagem (JPG, PNG, WebP, HEIC).'); return }
    if (emitido && validade && validade < emitido) { setErroLocal('A validade não pode ser anterior à data de emissão.'); return }
    setErroLocal(null)
    setAEnviar(true)
    const { error: erroEnvio } = await supabase.storage.from(BUCKET).upload(caminho, ficheiro, { contentType: ficheiro.type, upsert: false })
    if (erroEnvio) {
      setAEnviar(false)
      setErroLocal('Não foi possível enviar o ficheiro. Verifique a ligação e tente outra vez.')
      return
    }
    const id = await registar({
      subId, tipo, referencia: referencia.trim() || null, emitidoEm: emitido || null,
      validade: validade || null, path: caminho, nome: ficheiro.name,
    })
    setAEnviar(false)
    if (id !== null) {
      setAberto(false); setReferencia(''); setEmitido(''); setValidade(''); setFicheiro(null)
      reload()
    }
  }

  const apagar = async (id: string, rotulo: string) => {
    if (!window.confirm(`Remover o documento "${rotulo}"?`)) return
    if (await remover(id)) reload()
  }

  const nomeDoc = (id: string | null) => documentos.find(d => d.id === id)

  return (
    <Seccao
      titulo="Documentos legais"
      icone={<FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
      acao={podeSubempreitadas && <button type="button" className={botaoPrimario} onClick={() => { setErroLocal(null); setAberto(v => !v) }}>Carregar documento</button>}
    >
      {aberto && podeSubempreitadas && (
        <form onSubmit={e => void submeter(e)} className="rounded-xl border border-border p-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Tipo de documento
            <select className={inputCls} value={tipo} onChange={e => setTipo(e.target.value as TipoDocSub)}>
              {TIPOS.map(t => <option key={t} value={t}>{ROTULO_DOC[t]}</option>)}
            </select>
          </label>
          <label className="text-sm">Referência
            <input className={inputCls} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nº da apólice, certidão…" />
          </label>
          <label className="text-sm">Emitido em
            <input className={inputCls} type="date" value={emitido} onChange={e => setEmitido(e.target.value)} />
          </label>
          <label className="text-sm">Válido até
            <input className={inputCls} type="date" value={validade} onChange={e => setValidade(e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">Ficheiro (PDF ou imagem, até 20 MB)
            <input className={inputCls} type="file" accept="application/pdf,image/*" onChange={e => setFicheiro(e.target.files?.[0] ?? null)} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button className={botaoPrimario} disabled={aEnviar || aRegistar}>{aEnviar || aRegistar ? 'A guardar…' : 'Guardar documento'}</button>
            <button type="button" className={botaoSecundario} onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {(erroLocal || erroRegistar || erroRemover) && <p role="alert" className="text-sm text-destructive">{erroLocal || erroRegistar || erroRemover}</p>}
      {aCarregarEstados && estados.length === 0 && <p role="status" className="text-sm text-muted-foreground">A carregar documentos…</p>}
      {erroEstados && <p role="alert" className="text-sm text-destructive">{erroEstados} <button type="button" className="underline" onClick={reload}>Tentar de novo</button></p>}
      {!aCarregarEstados && !erroEstados && estados.length === 0 && <Vazio>Sem documentos obrigatórios definidos nem carregados.</Vazio>}

      <ul className="divide-y divide-border">
        {estados.map(e => {
          const doc = nomeDoc(e.doc_id)
          return (
            <li key={e.tipo} className="py-2.5 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-48">
                <p className="text-sm font-semibold">{ROTULO_DOC[e.tipo]}{e.obrigatorio && <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">obrigatório</span>}</p>
                <p className="text-xs text-muted-foreground">{[e.referencia, detalheValidade(e)].filter(Boolean).join(' · ')}</p>
              </div>
              <Selo estado={e.estado} />
              {doc && <button type="button" className="text-sm text-primary" aria-label={`Ver ${ROTULO_DOC[e.tipo]}`} onClick={() => void ver(doc.path)}>Ver</button>}
            </li>
          )
        })}
      </ul>

      {documentos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Histórico de documentos ({documentos.length})</summary>
          <ul className="divide-y divide-border mt-2">
            {documentos.map(d => (
              <li key={d.id} className="py-2 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-48">
                  <p className="text-sm">{ROTULO_DOC[d.tipo]}{d.referencia ? ` · ${d.referencia}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{d.nome ?? 'Ficheiro'} · carregado em {fmtData(d.criado_em)}{d.validade ? ` · validade ${fmtData(d.validade)}` : ''}</p>
                </div>
                <button type="button" className="text-sm text-primary" aria-label={`Abrir ${d.nome ?? ROTULO_DOC[d.tipo]}`} onClick={() => void ver(d.path)}>Abrir</button>
                {podeObras && <button type="button" className="text-sm text-destructive" disabled={aRemover} aria-label={`Remover ${d.nome ?? ROTULO_DOC[d.tipo]}`} onClick={() => void apagar(d.id, ROTULO_DOC[d.tipo])}>Remover</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Seccao>
  )
}
