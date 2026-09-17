import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { CustoConsolidado } from '../services/custosService'

const CATEGORIAS = [
  { key: 'materiais'      , label: 'Materiais',       color: '#3b82f6' },
  { key: 'maoDeObra'      , label: 'Mão de Obra',     color: '#8b5cf6' },
  { key: 'combustivel'    , label: 'Combustível',     color: '#f59e0b' },
  { key: 'fornecedores'   , label: 'Fornecedores',    color: '#ef4444' },
  { key: 'subempreiteiros', label: 'Subempreiteiros', color: '#10b981' },
] as const

type CatKey = (typeof CATEGORIAS)[number]['key']

const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

interface Props {
  custo: CustoConsolidado
}

export function DashboardRentabilidade({ custo }: Props) {
  const dados = CATEGORIAS
    .map(c => ({ name: c.label, value: custo[c.key as CatKey], color: c.color }))
    .filter(d => d.value > 0)

  if (dados.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Sem dados para o período seleccionado.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={dados}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          dataKey="value"
          label={false}
        >
          {dados.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [EUR.format(value), '']}
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            fontSize: '12px',
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px', paddingTop: 8 }}
          formatter={(value) => <span className="text-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
