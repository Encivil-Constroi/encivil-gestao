import { alternarPermissao, type ChavePermissao, type PermissoesFicha } from '@/features/auth/lib/permissoes'

const ITENS: { chave: ChavePermissao; rotulo: string; ajuda?: string }[] = [
  { chave: 'contaAtiva',        rotulo: 'Conta ativa', ajuda: 'Desligada: a pessoa não consegue entrar na app.' },
  { chave: 'apenasLeitura',     rotulo: 'Apenas leitura' },
  { chave: 'administrador',     rotulo: 'Administrador', ajuda: 'Acesso total, incluindo utilizadores e auditoria.' },
  { chave: 'gestorFrota',       rotulo: 'Gestor de Frota', ajuda: 'Sozinho: vê só a Frota.' },
  { chave: 'gestorArmazem',     rotulo: 'Gestor de Armazém' },
  { chave: 'gestorCombustivel', rotulo: 'Gestor de Combustível', ajuda: 'Escreve no combustível com o mesmo papel do Armazém.' },
  { chave: 'verRelatorios',     rotulo: 'Ver relatórios', ajuda: 'Automático: depende do papel (Frota sozinho e motorista não veem).' },
  { chave: 'motorista',         rotulo: 'Motorista', ajuda: 'Só pede abastecimentos e vê os seus pedidos.' },
]

export function PermissoesSwitches({ valor, onChange, colunas = false }: {
  valor: PermissoesFicha; onChange: (p: PermissoesFicha) => void; colunas?: boolean
}) {
  return (
    <fieldset className={colunas ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-2' : 'space-y-2'}>
      <legend className="text-sm font-medium mb-1.5 col-span-full">Permissões</legend>
      {ITENS.map(({ chave, rotulo, ajuda }) => (
        <label key={chave} className={`flex items-center justify-between gap-3 p-3 rounded-xl border border-border ${chave === 'verRelatorios' ? 'opacity-70' : 'cursor-pointer hover:bg-accent/40'}`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{rotulo}</span>
            {ajuda && <span className="block text-xs text-muted-foreground">{ajuda}</span>}
          </span>
          <input type="checkbox" role="switch" aria-label={rotulo} className="w-5 h-5 shrink-0 accent-primary"
            checked={valor[chave]} disabled={chave === 'verRelatorios'}
            onChange={() => onChange(alternarPermissao(valor, chave))} />
        </label>
      ))}
    </fieldset>
  )
}
