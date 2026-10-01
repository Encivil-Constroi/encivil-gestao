import { useState } from 'react'
import type { FotoObra, OrigemFoto } from '../../db'
import { useAdicionarFotos, useFotosObra, usePermissaoFotosObra } from '../../hooks/useFichaObra'
import { FotoCapture } from '../FotoCapture'
import { FotosGaleria } from '../FotosGaleria'
import { Seccao, botaoPrimario, botaoSecundario } from '../ui'
import type { SecaoProps } from './tipos'

const ORIGENS: { valor: OrigemFoto; texto: string }[] = [
  { valor: 'GALERIA', texto: 'Galeria' }, { valor: 'RELATORIO', texto: 'Relatório' },
  { valor: 'AFERICAO', texto: 'Aferição' }, { valor: 'SUBEMPREITADA', texto: 'Subempreitada' }, { valor: 'AUTO', texto: 'Auto' },
]

export function Fotos({ obraId }: SecaoProps) {
  const { fotos, loading, error, reload } = useFotosObra(obraId)
  const { adicionar, loading: aGuardar, error: erroGuardar } = useAdicionarFotos()
  const { podeAdicionar } = usePermissaoFotosObra(obraId)
  const [origem, setOrigem] = useState<OrigemFoto | ''>('')
  const [novas, setNovas] = useState<FotoObra[]>([])
  const [aberto, setAberto] = useState(false)
  const filtradas = origem ? fotos.filter(f => f.origem === origem) : fotos
  const guardar = async () => {
    if (!novas.length) return
    const resultado = await adicionar(obraId, novas)
    if (resultado !== null) { setNovas([]); setAberto(false); reload() }
  }
  return <Seccao titulo="Fotografias da obra" acao={podeAdicionar && <button type="button" className={botaoPrimario} onClick={() => setAberto(v => !v)}>Adicionar fotos</button>}>
    {aberto && podeAdicionar && <div className="rounded-xl border border-border p-4 space-y-3"><FotoCapture obraId={obraId} pasta="galeria" valor={novas} onChange={setNovas} /><button type="button" className={botaoPrimario} disabled={!novas.length || aGuardar} onClick={() => void guardar()}>Guardar fotos</button>{erroGuardar && <p role="alert" className="text-destructive text-sm">{erroGuardar}</p>}</div>}
    <label className="block text-sm">Origem das fotos<select className="ml-2 px-3 py-2 rounded-xl border border-input bg-input-background" value={origem} onChange={e => setOrigem(e.target.value as OrigemFoto | '')}><option value="">Todas</option>{ORIGENS.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></label>
    {loading && !fotos.length && <p role="status">A carregar fotografias…</p>}
    {error && <p role="alert">{error} <button type="button" className={botaoSecundario} onClick={reload}>Tentar de novo</button></p>}
    <FotosGaleria fotos={filtradas.map(f => ({ path: f.path, legenda: f.legenda, data: f.data, rotulo: ORIGENS.find(o => o.valor === f.origem)?.texto }))} vazio={origem ? 'Sem fotografias desta origem.' : 'Sem fotografias nesta obra.'} />
  </Seccao>
}
