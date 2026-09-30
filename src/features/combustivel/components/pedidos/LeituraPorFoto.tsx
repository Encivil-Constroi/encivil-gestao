import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Camera, Loader2, RotateCcw, Sparkles, PencilLine } from 'lucide-react'
import type { OrigemLeitura } from '../../db'
import { lerNumero } from '../../lib/pedido'
import { enviarFotoAbastecimento, lerFotoComIA, type TipoLeitura } from '../../services/fotosService'
import { botaoPrimario, botaoSecundario, inputCls } from './ui'

export type LeituraConfirmada = { fotoPath: string; valor: number; custo: number | null; origem: OrigemLeitura }

// "Foto na hora": com capture o telemóvel abre logo a câmara; no computador
// (sem câmara) cai no seletor de ficheiros — aí recusa fotos antigas
export const FOTO_MAX_IDADE_MS = 10 * 60_000

type Estado =
  | { passo: 'SEM_FOTO' }
  | { passo: 'A_ENVIAR' | 'A_LER'; previa: string }
  | { passo: 'LIDO'; previa: string; fotoPath: string; valorIA: number | null; custoIA: number | null }

export function LeituraPorFoto({
  veiculoId, pedidoId, leitura, titulo, instrucao, rotuloValor, unidade, pedirCusto = false,
  textoConfirmar, validar, resumo, aGuardar, onConfirmar,
}: {
  veiculoId: string
  pedidoId: string
  leitura: TipoLeitura
  titulo: string
  instrucao: string
  rotuloValor: string
  unidade?: string
  pedirCusto?: boolean
  textoConfirmar: string
  // Mensagem de erro para o valor escrito (ex.: leitura final menor que a inicial)
  validar?: (valor: number) => string | null
  resumo?: (valor: number) => ReactNode
  aGuardar: boolean
  onConfirmar: (l: LeituraConfirmada) => Promise<void> | void
}) {
  const inputId = useId()
  const ficheiroRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>({ passo: 'SEM_FOTO' })
  const [valorTxt, setValorTxt] = useState('')
  const [custoTxt, setCustoTxt] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const previa = estado.passo === 'SEM_FOTO' ? null : estado.previa
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa) }, [previa])

  const escolher = () => { setErro(null); ficheiroRef.current?.click() }

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const foto = e.target.files?.[0]
    e.target.value = ''
    if (!foto) return
    if (!foto.type.startsWith('image/') && foto.type !== '') { setErro('Escolha uma fotografia.'); return }
    if (foto.lastModified && Date.now() - foto.lastModified > FOTO_MAX_IDADE_MS) {
      setErro('Tire a foto agora, no momento — não use fotos antigas.')
      return
    }
    const url = URL.createObjectURL(foto)
    setEstado({ passo: 'A_ENVIAR', previa: url })
    let fotoPath: string
    try {
      fotoPath = await enviarFotoAbastecimento(veiculoId, pedidoId, foto)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar a foto.')
      setEstado({ passo: 'SEM_FOTO' })
      return
    }
    setEstado({ passo: 'A_LER', previa: url })
    const lido = await lerFotoComIA(fotoPath, leitura)
    const valorIA = lido && lido.confianca !== 'baixa' ? lido.valor : null
    const custoIA = lido && lido.confianca !== 'baixa' ? lido.custo : null
    setValorTxt(valorIA != null ? String(valorIA).replace('.', ',') : '')
    setCustoTxt(custoIA != null ? String(custoIA).replace('.', ',') : '')
    setEstado({ passo: 'LIDO', previa: url, fotoPath, valorIA, custoIA })
  }

  const valor = lerNumero(valorTxt)
  const custo = lerNumero(custoTxt)
  const erroValor = valor != null && validar ? validar(valor) : null
  const podeConfirmar = estado.passo === 'LIDO' && valor != null && !erroValor
    && (!pedirCusto || custo != null) && !aGuardar

  const confirmar = async () => {
    if (estado.passo !== 'LIDO' || valor == null) return
    const igualIA = estado.valorIA != null && Math.abs(estado.valorIA - valor) < 1e-9
      && (!pedirCusto || (estado.custoIA != null && custo != null && Math.abs(estado.custoIA - custo) < 1e-9))
    await onConfirmar({ fotoPath: estado.fotoPath, valor, custo: pedirCusto ? custo : null, origem: igualIA ? 'IA' : 'MANUAL' })
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{instrucao}</p>
      </div>

      <input ref={ficheiroRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={aoEscolher} aria-label={titulo} data-testid={`foto-${leitura}`} />

      {estado.passo === 'SEM_FOTO' && (
        <button type="button" onClick={escolher}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-primary/40 rounded-2xl text-primary bg-primary/5 active:scale-[0.99] transition-transform">
          <Camera className="w-10 h-10" aria-hidden="true" />
          <span className="text-base font-semibold">Tirar foto</span>
        </button>
      )}

      {previa && (
        <div className="relative">
          <img src={previa} alt="Foto tirada" className="w-full max-h-72 object-contain rounded-2xl border border-border bg-muted" />
          {(estado.passo === 'A_ENVIAR' || estado.passo === 'A_LER') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 rounded-2xl">
              <span role="status" className="flex items-center gap-2 px-4 py-2 bg-card rounded-full text-sm font-medium shadow">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                {estado.passo === 'A_ENVIAR' ? 'A enviar a foto…' : 'A ler com IA…'}
              </span>
            </div>
          )}
        </div>
      )}

      {estado.passo === 'LIDO' && (
        <div className="space-y-3">
          {estado.valorIA != null ? (
            <p className="flex items-center gap-2 text-sm text-primary font-medium">
              <Sparkles className="w-4 h-4" aria-hidden="true" /> Lido pela IA — confirme ou corrija.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-warning font-medium">
              <PencilLine className="w-4 h-4" aria-hidden="true" /> A IA não conseguiu ler. Escreva o valor que vê na foto.
            </p>
          )}

          <div>
            <label htmlFor={inputId} className="block text-sm font-medium mb-1.5">{rotuloValor}</label>
            <div className="relative">
              <input id={inputId} inputMode="decimal" autoComplete="off" value={valorTxt}
                onChange={e => setValorTxt(e.target.value)} className={`${inputCls} text-2xl font-bold tabular-nums pr-14`}
                aria-invalid={!!erroValor} />
              {unidade && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{unidade}</span>}
            </div>
            {valorTxt && valor == null && <p className="text-xs text-destructive mt-1">Número inválido.</p>}
            {erroValor && <p className="text-xs text-destructive mt-1" role="alert">{erroValor}</p>}
          </div>

          {pedirCusto && (
            <div>
              <label htmlFor={`${inputId}-custo`} className="block text-sm font-medium mb-1.5">Valor pago (talão)</label>
              <div className="relative">
                <input id={`${inputId}-custo`} inputMode="decimal" autoComplete="off" value={custoTxt}
                  onChange={e => setCustoTxt(e.target.value)} className={`${inputCls} text-xl font-bold tabular-nums pr-10`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
              </div>
            </div>
          )}

          {valor != null && !erroValor && resumo?.(valor)}

          <div className="flex gap-2">
            <button type="button" onClick={escolher} className={botaoSecundario} disabled={aGuardar}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Nova foto
            </button>
            <button type="button" onClick={confirmar} disabled={!podeConfirmar} className={`${botaoPrimario} flex-1 text-base`}>
              {aGuardar && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {textoConfirmar}
            </button>
          </div>
        </div>
      )}

      {erro && <p role="alert" className="text-sm text-destructive font-medium">{erro}</p>}
    </div>
  )
}
