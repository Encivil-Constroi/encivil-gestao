import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { CustoConsolidado } from '../services/custosService'

const CATEGORIAS = [
  { key: 'materiais'      , label: 'Materiais',       color: 'var(--chart-1)' },
  { key: 'maoDeObra'      , label: 'Mão de Obra',     color: 'var(--chart-5)' },
  { key: 'combustivel'    , label: 'Combustível',     color: 'var(--chart-4)' },
  { key: 'fornecedores'   , label: 'Fornecedores',    color: 'var(--chart-3)' },
  { key: 'subempreiteiros', label: 'Subempreiteiros', color: 'var(--chart-2)' },
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
          isAnimationActive={false}
        >
          {dados.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [EUR.format(value), '']}
          contentStyle={{
            background: 'var(--card)',
            color: 'var(--card-foreground)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          itemStyle={{ color: 'var(--card-foreground)' }}
          labelStyle={{ color: 'var(--card-foreground)' }}
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
