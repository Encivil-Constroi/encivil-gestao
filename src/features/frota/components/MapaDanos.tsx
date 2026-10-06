import type { MouseEvent } from 'react'
import { Plus, X } from 'lucide-react'
import type { DanoMarcado, VistaDano } from '../db'
import { MAX_DANOS, ROTULO_VISTA, VISTAS } from '../lib/entregas'
import { DesenhoVista } from './CarroVistas'

type Props = {
  /** Danos novos (os que se editam) */
  value: DanoMarcado[]
  onChange?: (v: DanoMarcado[]) => void
  /** Danos que já existiam na entrega: a cinzento e sem remoção */
  existentes?: DanoMarcado[]
  readOnly?: boolean
  max?: number
}

const limitar = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000))

export function MapaDanos({ value, onChange, existentes = [], readOnly = false, max = MAX_DANOS }: Props) {
  const total = existentes.length + value.length
  const cheio = total >= max
  const editavel = !readOnly && !!onChange

  const adicionar = (vista: VistaDano, x: number, y: number) => {
    if (!editavel || cheio) return
    onChange!([...value, { vista, x: limitar(x), y: limitar(y) }])
  }

  const aoTocar = (vista: VistaDano) => (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    // sem dimensões (ex.: testes) cai no centro em vez de dar NaN
    const x = r.width > 0 ? (e.clientX - r.left) / r.width : 0.5
    const y = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5
    adicionar(vista, x, y)
  }

  const remover = (i: number) => onChange?.(value.filter((_, k) => k !== i))
  const nota = (i: number, texto: string) =>
    onChange?.(value.map((d, k) => (k === i ? { ...d, nota: texto || undefined } : d)))

  const todos = [
    ...existentes.map((d, i) => ({ d, n: i + 1, novo: false, idx: -1 })),
    ...value.map((d, i) => ({ d, n: existentes.length + i + 1, novo: true, idx: i })),
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {VISTAS.map(({ vista, rotulo }) => (
          <div key={vista} className={vista === 'cima' ? 'col-span-2 max-w-[60%] mx-auto w-full' : ''}>
            <div
              role="group"
              aria-label={`Vista ${rotulo}`}
              data-vista={vista}
              onClick={editavel ? aoTocar(vista) : undefined}
              className={`relative w-full aspect-[200/120] rounded-xl border border-border bg-card ${editavel && !cheio ? 'cursor-crosshair' : ''}`}
            >
              <DesenhoVista vista={vista} />
              {todos.filter(t => t.d.vista === vista).map(t => (
                <span
                  key={`${t.novo ? 'n' : 'e'}${t.n}`}
                  data-marcador={t.n}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center pointer-events-none shadow ${
                    t.novo ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-secondary-foreground'}`}
                  style={{ left: `${t.d.x * 100}%`, top: `${t.d.y * 100}%` }}
                >
                  {t.n}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{rotulo}</span>
              {editavel && (
                <button type="button" onClick={() => adicionar(vista, 0.5, 0.5)} disabled={cheio}
                  aria-label={`Adicionar dano — ${rotulo}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-secondary/20 hover:bg-secondary/30 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Adicionar dano
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editavel && (
        <p className={`text-sm font-semibold text-center ${cheio ? 'text-warning' : 'text-destructive'}`}>
          {cheio ? `Máximo de ${max} danos atingido` : 'Toque na imagem para marcar novos danos'}
        </p>
      )}

      {todos.length > 0 ? (
        <ul className="space-y-2" aria-label="Danos marcados">
          {todos.map(t => (
            <li key={`${t.novo ? 'n' : 'e'}${t.n}`}
              className={`flex items-center gap-2 rounded-xl border p-2 ${t.novo ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40'}`}>
              <span className={`w-6 h-6 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${t.novo ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-secondary-foreground'}`}>{t.n}</span>
              <span className="text-xs text-muted-foreground shrink-0 w-24">{ROTULO_VISTA[t.d.vista]}</span>
              {t.novo && editavel ? (
                <>
                  <input value={t.d.nota ?? ''} onChange={e => nota(t.idx, e.target.value)} maxLength={200}
                    aria-label={`Nota do dano ${t.n}`} placeholder="Nota (opcional)"
                    className="flex-1 min-w-0 px-3 py-2 bg-input-background border border-input rounded-lg text-sm" />
                  <button type="button" onClick={() => remover(t.idx)} aria-label={`Remover dano ${t.n}`}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0">
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <span className="flex-1 min-w-0 text-sm truncate">
                  {t.d.nota || <span className="text-muted-foreground">Sem nota</span>}
                  {!t.novo && <span className="text-xs text-muted-foreground"> · já existente</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !editavel && <p className="text-sm text-muted-foreground text-center">Sem danos marcados.</p>
      )}
    </div>
  )
}
