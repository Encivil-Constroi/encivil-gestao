// Controlos grandes (uso no telemóvel, no pátio) partilhados pela entrega, devolução e detalhe

export function Segmentado<T extends string>({ rotulo, valor, opcoes, onChange }: {
  rotulo: string
  valor: T | null
  opcoes: { valor: T; rotulo: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold">{rotulo}</div>
      <div role="radiogroup" aria-label={rotulo} className="flex gap-1.5">
        {opcoes.map(o => {
          const ativo = o.valor === valor
          return (
            <button key={o.valor} type="button" role="radio" aria-checked={ativo} onClick={() => onChange(o.valor)}
              className={`flex-1 min-h-11 px-2 rounded-xl text-sm font-medium border transition-colors ${
                ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}>
              {o.rotulo}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Interruptor({ rotulo, ativo, onChange }: { rotulo: string; ativo: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <span className="text-sm font-medium">{rotulo}</span>
      <button type="button" role="switch" aria-checked={ativo} aria-label={rotulo} onClick={() => onChange(!ativo)}
        className={`relative w-14 h-8 rounded-full border transition-colors shrink-0 ${ativo ? 'bg-primary border-primary' : 'bg-muted border-border'}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${ativo ? 'left-[1.75rem]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
