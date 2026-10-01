import { useState, type FormEvent } from 'react'
import { Users, UserPlus } from 'lucide-react'
import { useRole } from '@/features/auth/useRole'
import { useColaboradoresAtivos } from '../../hooks/useObras'
import { useAutoresObra, useEquipaObra, useGerirEquipa } from '../../hooks/useFichaRecursos'
import { hojeLisboa, dataLisboa, dataHoraLisboa } from '../../lib/datasRecursos'
import { Seccao, Vazio, botaoPrimario, botaoSecundario, inputCls } from '../ui'
import type { SecaoProps } from './tipos'

export function Equipa({ obraId }: SecaoProps) {
  const { podeObras } = useRole()
  const { equipa, loading, error, reload } = useEquipaObra(obraId)
  const { autores, loading: loadingAutores, error: erroAutores } = useAutoresObra(obraId, podeObras)
  const { colaboradores } = useColaboradoresAtivos()
  const { alocar, remover, definirAutores, loading: aGuardar, error: erroGuardar } = useGerirEquipa(obraId)
  const [colaboradorId, setColaboradorId] = useState('')
  const [funcao, setFuncao] = useState('')
  const [desde, setDesde] = useState(hojeLisboa)
  const [autorSelecionados, setAutorSelecionados] = useState<string[] | null>(null)
  const [mensagem, setMensagem] = useState('')
  const ativos = equipa.filter(p => p.ativo)
  const historico = equipa.filter(p => !p.ativo)
  const disponiveis = colaboradores.filter(c => !ativos.some(p => p.colaborador_id === c.id))
  const selecionados = autorSelecionados ?? autores.filter(a => a.designado).map(a => a.user_id)

  async function adicionar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!colaboradorId) return
    const id = await alocar(colaboradorId, funcao, desde)
    if (id) { setColaboradorId(''); setFuncao(''); setMensagem('Colaborador alocado.'); reload() }
  }

  async function retirar(id: string, nome: string) {
    if (!window.confirm(`Remover ${nome} da equipa da obra?`)) return
    if (await remover(id, hojeLisboa())) { setMensagem('Colaborador removido da equipa.'); reload() }
  }

  async function guardarAutores() {
    if (await definirAutores(selecionados)) { setAutorSelecionados(null); setMensagem('Autores de relatórios guardados.') }
  }

  return <div className="space-y-4">
    <Seccao titulo={`Equipa atual · ${ativos.length}`} icone={<Users className="w-4 h-4 text-primary" aria-hidden="true" />}>
      {loading && <p className="text-sm text-muted-foreground">A carregar equipa…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error} <button onClick={reload} className="underline">Tentar de novo</button></p>}
      {!loading && !error && ativos.length === 0 && <Vazio>Ainda não há colaboradores alocados.</Vazio>}
      <div className="divide-y divide-border">
        {ativos.map(p => <div key={p.alocacao_id} className="py-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-40"><p className="font-medium text-sm">{p.nome}</p><p className="text-xs text-muted-foreground">{p.funcao || 'Função não indicada'} · Desde {dataLisboa(p.desde)}</p></div>
          <div className="text-xs text-muted-foreground text-right"><p>{p.presente_hoje ? '● Presente hoje' : 'Não presente hoje'}</p><p>Último ponto: {dataHoraLisboa(p.ultima_picagem)}</p></div>
          {podeObras && <button type="button" disabled={aGuardar} onClick={() => void retirar(p.alocacao_id, p.nome)} className="text-xs text-destructive hover:underline disabled:opacity-50">Remover</button>}
        </div>)}
      </div>
    </Seccao>

    {podeObras && <Seccao titulo="Alocar colaborador" icone={<UserPlus className="w-4 h-4 text-primary" aria-hidden="true" />}>
      <form onSubmit={e => void adicionar(e)} className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-medium">Colaborador
          <select required value={colaboradorId} onChange={e => setColaboradorId(e.target.value)} className={inputCls}><option value="">Selecionar colaborador</option>{disponiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        </label>
        <label className="text-xs font-medium">Função na obra
          <input value={funcao} onChange={e => setFuncao(e.target.value)} maxLength={120} placeholder="Ex.: Encarregado" className={inputCls} />
        </label>
        <label className="text-xs font-medium">Desde
          <input type="date" required value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
        </label>
        <div className="flex items-end"><button type="submit" disabled={aGuardar || !colaboradorId} className={botaoPrimario}>Alocar</button></div>
      </form>
    </Seccao>}

    {podeObras && <Seccao titulo="Quem pode escrever relatórios">
      <p className="text-xs text-muted-foreground">Administração, gestão e medições já têm acesso. Designe aqui outros utilizadores para esta obra.</p>
      {loadingAutores && <p className="text-sm text-muted-foreground">A carregar utilizadores…</p>}
      {erroAutores && <p role="alert" className="text-sm text-destructive">{erroAutores}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {autores.filter(a => !['admin', 'gestor', 'medicoes'].includes(a.role)).map(a => <label key={a.user_id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-accent">
          <input type="checkbox" checked={selecionados.includes(a.user_id)} onChange={e => setAutorSelecionados(e.target.checked ? [...selecionados, a.user_id] : selecionados.filter(id => id !== a.user_id))} />{a.nome}
        </label>)}
      </div>
      {!loadingAutores && autores.length === 0 && !erroAutores && <Vazio>Não há utilizadores elegíveis.</Vazio>}
      <button type="button" disabled={aGuardar || loadingAutores || !!erroAutores || autorSelecionados === null} onClick={() => void guardarAutores()} className={botaoSecundario}>Guardar autores</button>
    </Seccao>}

    {historico.length > 0 && <Seccao titulo="Histórico da equipa"><div className="divide-y divide-border">{historico.map(p => <p key={p.alocacao_id} className="text-sm py-2">{p.nome} <span className="text-muted-foreground">· {p.funcao || 'Sem função'} · {dataLisboa(p.desde)} a {dataLisboa(p.ate)}</span></p>)}</div></Seccao>}
    {erroGuardar && <p role="alert" className="text-sm text-destructive">{erroGuardar}</p>}
    {mensagem && <p role="status" className="text-sm text-success">{mensagem}</p>}
  </div>
}
