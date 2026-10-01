import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChevronLeft, Search, Check } from 'lucide-react'
import { toast } from 'sonner'
import { FotoInput } from '@/app/components/FotoInput'
import { SignaturePad } from '@/app/components/SignaturePad'
import { useRole } from '@/features/auth/useRole'
import { useObras } from '@/features/obras/hooks/useObras'
import { useFerramentas } from '@/features/ferramentas/hooks/useFerramentas'
import { useEmprestimos, useRegistarEmprestimo } from '@/features/ferramentas/hooks/useEmprestimos'
import { ESTADO_FERRAMENTA, fmtData, hojeIso } from '@/features/ferramentas/lib/estadoFerramenta'
import {
  Campo, Carregando, FotoFerramenta, inputCls, useExigePermissaoFerramentas,
} from '@/features/ferramentas/components/ui'

const ATIVOS = { estado: 'ativo' as const }

export function EmprestimoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const permitido = useExigePermissaoFerramentas()
  const { nome } = useRole()
  const { tools, loading } = useFerramentas()
  const { loans: ativos } = useEmprestimos(ATIVOS)
  const { obras } = useObras(true)
  const { registar, loading: aRegistar, error: erroServidor } = useRegistarEmprestimo()

  const [ferramentaId, setFerramentaId] = useState(() => new URLSearchParams(location.search).get('ferramenta') ?? '')
  const [pesquisa, setPesquisa] = useState('')
  const [f, setF] = useState({
    funcionario: '', documento: '', obraId: '', destino: '', prevista: '',
    condicao: 'Bom estado', entregue: nome, observacoes: '',
  })
  const [outroDestino, setOutroDestino] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)
  const [assFuncionario, setAssFuncionario] = useState<string | null>(null)
  const [assResponsavel, setAssResponsavel] = useState<string | null>(null)

  useEffect(() => {
    if (nome) setF(p => ({ ...p, entregue: p.entregue || nome }))
  }, [nome])

  const emUso = useMemo(() => new Map(ativos.map(l => [l.toolId, l])), [ativos])
  const q = pesquisa.trim().toLowerCase()
  const lista = useMemo(() => {
    const ok = tools.filter(t => t.status !== 'inativa' && (!q || [t.name, t.code, t.serialNumber, t.marca, t.modelo].some(v => v?.toLowerCase().includes(q))))
    // Disponíveis primeiro: são as únicas escolhíveis
    return [...ok].sort((a, b) => Number(b.status === 'disponivel') - Number(a.status === 'disponivel'))
  }, [tools, q])

  const escolhida = tools.find(t => t.id === ferramentaId)
  const escolhivel = escolhida?.status === 'disponivel'

  if (!permitido || loading) return <Carregando />

  const escolher = (id: string) => { setFerramentaId(id); setFoto(null) }
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }))

  const pronto = escolhivel && !!foto && !!assFuncionario && !!assResponsavel && !!f.funcionario.trim() && !!f.entregue.trim()

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!escolhivel) { toast.error('Escolha uma ferramenta disponível.'); return }
    if (!foto) { toast.error('Tire a foto do estado da ferramenta.'); return }
    if (!assFuncionario) { toast.error('A assinatura do funcionário é obrigatória.'); return }
    if (!assResponsavel) { toast.error('A assinatura de quem entrega é obrigatória.'); return }

    const obra = obras.find(o => o.id === f.obraId)
    const r = await registar({
      toolId: ferramentaId,
      employeeName: f.funcionario.trim(),
      deliveredBy: f.entregue.trim(),
      signature: assFuncionario,
      responsibleSignature: assResponsavel,
      employeeDocument: f.documento.trim() || undefined,
      destination: outroDestino ? f.destino.trim() || undefined : obra?.name,
      obraId: outroDestino ? undefined : f.obraId || undefined,
      expectedReturnDate: f.prevista || undefined,
      deliveryCondition: f.condicao.trim() || undefined,
      notes: f.observacoes.trim() || undefined,
      fotoEntregaPath: foto,
    })
    if (r) {
      toast.success('Empréstimo registado.')
      navigate(`/armazem/ferramenta/${r.toolId}`, { replace: true, state: { termLoan: r } })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="p-2 hover:bg-accent rounded-lg shrink-0">
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div>
          <h2 className="text-xl font-semibold">Registar empréstimo</h2>
          <p className="text-sm text-muted-foreground">Entregar uma ferramenta a um funcionário</p>
        </div>
      </div>

      <form onSubmit={submeter} className="space-y-4" noValidate>
        <section className="bg-card rounded-2xl border border-border p-4 space-y-3" aria-label="Ferramenta">
          <h3 className="text-sm font-semibold">1. Ferramenta</h3>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={pesquisa} onChange={e => setPesquisa(e.target.value)} aria-label="Pesquisar ferramenta"
              placeholder="Pesquisar por nome, código ou n.º de série…"
              className="w-full pl-10 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
          </div>
          <ul className="space-y-2 max-h-80 overflow-y-auto" role="radiogroup" aria-label="Ferramentas">
            {lista.map(t => {
              const livre = t.status === 'disponivel'
              const l = emUso.get(t.id)
              const marcada = ferramentaId === t.id
              return (
                <li key={t.id}>
                  <button type="button" role="radio" aria-checked={marcada} disabled={!livre}
                    onClick={() => escolher(t.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${
                      marcada ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : livre ? 'border-border hover:border-primary/40 bg-card' : 'border-border bg-muted/40 opacity-60 cursor-not-allowed'}`}>
                    <FotoFerramenta caminho={t.fotoPath} alt="" className="w-12 h-12 rounded-lg shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{t.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        <span className="font-mono">{t.code}</span>
                        {[t.marca, t.modelo].filter(Boolean).length > 0 && <> · {[t.marca, t.modelo].filter(Boolean).join(' ')}</>}
                      </span>
                      {!livre && (
                        <span className="block text-xs font-medium text-warning mt-0.5">
                          {l ? `em uso por ${l.employeeName} desde ${fmtData(l.loanDate)}` : ESTADO_FERRAMENTA[t.status].rotulo}
                        </span>
                      )}
                    </span>
                    {marcada ? <Check className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                      : livre && <span className="text-[11px] font-semibold text-success shrink-0">Disponível</span>}
                  </button>
                </li>
              )
            })}
            {lista.length === 0 && <li className="text-sm text-muted-foreground text-center py-4">Nenhuma ferramenta encontrada.</li>}
          </ul>
          {ferramentaId && escolhida && !escolhivel && (
            <p role="alert" className="text-sm text-destructive font-medium">
              Esta ferramenta não está disponível{emUso.get(ferramentaId) ? `: em uso por ${emUso.get(ferramentaId)!.employeeName}` : ''}.
            </p>
          )}
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 space-y-4" aria-label="Entrega">
          <h3 className="text-sm font-semibold">2. Entrega</h3>
          <Campo rotulo="Nome do funcionário" htmlFor="emp-func">
            <input id="emp-func" className={inputCls} value={f.funcionario} onChange={e => set('funcionario', e.target.value)} placeholder="Nome completo" required />
          </Campo>
          <Campo rotulo="CC / NIF" opcional htmlFor="emp-doc">
            <input id="emp-doc" className={inputCls} value={f.documento} onChange={e => set('documento', e.target.value)} placeholder="Documento de identificação" />
          </Campo>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="emp-obra" className="block text-sm font-medium">
                {outroDestino ? 'Outro destino' : 'Obra'} <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </label>
              <button type="button" onClick={() => setOutroDestino(v => !v)} className="text-xs font-medium text-primary hover:underline">
                {outroDestino ? 'Escolher obra' : 'Outro destino'}
              </button>
            </div>
            {outroDestino ? (
              <input id="emp-obra" className={inputCls} value={f.destino} onChange={e => set('destino', e.target.value)} placeholder="Destino sem obra formal" />
            ) : (
              <select id="emp-obra" className={inputCls} value={f.obraId} onChange={e => set('obraId', e.target.value)}>
                <option value="">Sem obra associada</option>
                {obras.filter(o => o.status === 'ativa').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>
          <Campo rotulo="Devolução prevista" opcional htmlFor="emp-prev">
            <input id="emp-prev" type="date" min={hojeIso()} className={inputCls} value={f.prevista} onChange={e => set('prevista', e.target.value)} />
          </Campo>
          <Campo rotulo="Condição na entrega" htmlFor="emp-cond">
            <input id="emp-cond" className={inputCls} value={f.condicao} onChange={e => set('condicao', e.target.value)} />
          </Campo>
          <Campo rotulo="Responsável pela entrega" htmlFor="emp-resp">
            <input id="emp-resp" className={inputCls} value={f.entregue} onChange={e => set('entregue', e.target.value)} required />
          </Campo>
          <Campo rotulo="Observações" opcional htmlFor="emp-obs">
            <textarea id="emp-obs" rows={2} className={`${inputCls} resize-none`} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </Campo>
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 space-y-4" aria-label="Prova do estado">
          <h3 className="text-sm font-semibold">3. Foto do estado</h3>
          {escolhivel ? (
            <FotoInput key={ferramentaId} soCamera obrigatoria rotulo="Foto do estado na entrega"
              dono={{ tipo: 'ferramentas', id: ferramentaId, prefixo: 'entrega_' }} valor={foto} onChange={setFoto} />
          ) : (
            <p className="text-sm text-muted-foreground">Escolha primeiro uma ferramenta disponível.</p>
          )}
        </section>

        <section className="bg-card rounded-2xl border border-border p-4 space-y-4" aria-label="Assinaturas">
          <h3 className="text-sm font-semibold">4. Assinaturas</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ao assinar, o funcionário confirma que recebeu a ferramenta em bom estado e é responsável por ela até à devolução (termo de responsabilidade).
          </p>
          <SignaturePad label="Assinatura do funcionário (confirma a receção)" value={assFuncionario} onChange={setAssFuncionario} />
          <SignaturePad label="Assinatura de quem entrega" value={assResponsavel} onChange={setAssResponsavel} />
        </section>

        {erroServidor && <p role="alert" className="text-sm text-destructive font-medium">{erroServidor}</p>}

        <div className="sticky bottom-20 md:bottom-0 py-3 bg-background/80 backdrop-blur-sm">
          <div className="flex gap-3">
            <button type="submit" disabled={aRegistar || !pronto}
              className="flex-1 py-3.5 bg-warning text-white rounded-xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
              {aRegistar ? 'A registar…' : 'Confirmar empréstimo'}
            </button>
            <button type="button" onClick={() => navigate(-1)} disabled={aRegistar}
              className="px-5 py-3.5 bg-secondary text-secondary-foreground rounded-xl font-medium">Cancelar</button>
          </div>
          {!foto && escolhivel && <p className="text-xs text-muted-foreground mt-1.5 text-center">Falta a foto do estado da ferramenta.</p>}
        </div>
      </form>
    </div>
  )
}
