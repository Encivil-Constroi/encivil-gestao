import { useId, useMemo, useState } from 'react'
import { Search, X, Tractor, Truck } from 'lucide-react'
import { semAcentos } from '../lib/manutencao'
import { inputCls } from './ui'

export type OpcaoViatura = {
  id: string
  nome: string
  identificacao: string | null
  marca: string | null
  modelo: string | null
  tipo: string
}

export const ehMaquina = (tipo: string) => tipo !== 'viatura'

const rotulo = (v: OpcaoViatura) => (v.identificacao ? `${v.identificacao} — ${v.nome}` : v.nome)

// Escolha de viatura/máquina pesquisando pela matrícula (ou nome/modelo)
export function ViaturaCombobox({ viaturas, valor, onChange, rotuloCampo, placeholder = 'Pesquisar matrícula ou nome…', disabled, opcional }: {
  viaturas: OpcaoViatura[]
  valor: string | null
  onChange: (id: string | null) => void
  rotuloCampo: string
  placeholder?: string
  disabled?: boolean
  opcional?: boolean
}) {
  const listaId = useId()
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const escolhida = viaturas.find(v => v.id === valor) ?? null

  const resultados = useMemo(() => {
    const t = semAcentos(texto.trim())
    const lista = t
      ? viaturas.filter(v => semAcentos([v.identificacao, v.nome, v.marca, v.modelo].filter(Boolean).join(' ')).includes(t))
      : viaturas
    return lista.slice(0, 40)
  }, [viaturas, texto])

  const escolher = (id: string | null) => { onChange(id); setTexto(''); setAberto(false) }

  return (
    <div className="relative">
      <label className="block text-sm font-medium space-y-2">
        <span>{rotuloCampo}{!opcional && <span className="text-destructive"> *</span>}</span>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            role="combobox" aria-expanded={aberto} aria-controls={listaId} aria-autocomplete="list" autoComplete="off"
            disabled={disabled}
            value={aberto ? texto : (escolhida ? rotulo(escolhida) : texto)}
            placeholder={placeholder}
            onFocus={() => { setTexto(''); setAberto(true) }}
            onChange={e => { setTexto(e.target.value); setAberto(true) }}
            onBlur={() => setAberto(false)}
            onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
            className={`${inputCls} pl-10 ${escolhida && !disabled ? 'pr-10' : ''}`}
          />
          {escolhida && !disabled && (
            <button type="button" aria-label="Limpar escolha" onMouseDown={e => e.preventDefault()} onClick={() => escolher(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </label>

      {aberto && (
        <ul id={listaId} role="listbox" aria-label={rotuloCampo}
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto bg-card border border-border rounded-xl shadow-lg divide-y divide-border">
          {resultados.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nada encontrado.</li>}
          {resultados.map(v => (
            <li key={v.id} role="option" aria-selected={v.id === valor}
              onMouseDown={e => e.preventDefault()} onClick={() => escolher(v.id)}
              className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-accent/60 active:bg-accent">
              {ehMaquina(v.tipo) ? <Tractor className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                : <Truck className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{v.identificacao ?? 'Sem matrícula'}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {[v.nome, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                  {ehMaquina(v.tipo) && ' · máquina'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
