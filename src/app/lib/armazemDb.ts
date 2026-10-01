import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

// Armazém completo (migration 20261001000000). Os tipos gerados só voltam a ser
// regenerados com o CLI (etapa 3 do plano de segurança); até lá as colunas e
// RPCs novas ficam declaradas aqui por cima dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

type Pub = Database['public']
type T = Pub['Tables']

export type SubtipoEntrada = 'COMPRA' | 'DEVOLUCAO_OBRA' | 'PROPRIO_ENCIVIL' | 'ACERTO'
export type SubtipoSaida = 'OBRA' | 'VENDA' | 'QUEBRA'
export type SubtipoMovimento = SubtipoEntrada | SubtipoSaida | 'INVENTARIO'

type Com<Tab extends keyof T, Extra> = Omit<T[Tab], 'Row' | 'Insert' | 'Update'> & {
  Row: T[Tab]['Row'] & Extra
  Insert: T[Tab]['Insert'] & Partial<Extra>
  Update: T[Tab]['Update'] & Partial<Extra>
}

export type ProdutoExtra = { foto_path: string | null; localizacao: string | null }
export type MovimentoExtra = {
  subtipo: SubtipoMovimento | null; fornecedor: string | null; numero_fatura: string | null
  cliente: string | null; preco_unitario: number | null
}
export type FerramentaExtra = {
  foto_path: string | null; marca: string | null; modelo: string | null; nova: boolean
  data_compra: string | null; garantia_ate: string | null
}
export type EmprestimoExtra = { foto_entrega_path: string | null; foto_devolucao_path: string | null }

export type MaterialObraRow = {
  obra_id: string; obra_nome: string; obra_estado: string
  produto_id: string; produto_nome: string; produto_codigo: string; unidade: string; foto_path: string | null
  enviado: number; devolvido: number; liquido: number; valor: number; ultimo_movimento: string
}

export type ArmazemDatabase = Omit<Database, 'public'> & {
  public: Omit<Pub, 'Tables' | 'Functions'> & {
    Tables: Omit<T, 'produtos' | 'movimentos_stock' | 'ferramentas' | 'emprestimos_ferramentas'> & {
      produtos: Com<'produtos', ProdutoExtra>
      movimentos_stock: Com<'movimentos_stock', MovimentoExtra>
      ferramentas: Com<'ferramentas', FerramentaExtra>
      emprestimos_ferramentas: Com<'emprestimos_ferramentas', EmprestimoExtra>
    }
    Functions: Omit<Pub['Functions'], 'registar_emprestimo_ferramenta' | 'registar_devolucao_ferramenta'> & {
      registar_movimento_armazem: {
        Args: {
          p_produto_id: string; p_subtipo: SubtipoMovimento; p_quantidade: number; p_responsavel: string
          p_obra_id?: string | null; p_fornecedor?: string | null; p_numero_fatura?: string | null
          p_cliente?: string | null; p_preco_unitario?: number | null; p_observacoes?: string | null
        }
        Returns: T['movimentos_stock']['Row'] & MovimentoExtra
      }
      armazem_materiais_por_obra: { Args: { p_obra_id?: string | null }; Returns: MaterialObraRow[] }
      registar_emprestimo_ferramenta: {
        Args: Pub['Functions']['registar_emprestimo_ferramenta']['Args'] & { p_foto_entrega_path?: string | null }
        Returns: T['emprestimos_ferramentas']['Row'] & EmprestimoExtra
      }
      registar_devolucao_ferramenta: {
        Args: Pub['Functions']['registar_devolucao_ferramenta']['Args'] & { p_foto_devolucao_path?: string | null }
        Returns: T['emprestimos_ferramentas']['Row'] & EmprestimoExtra
      }
    }
  }
}

export const armazemDb = supabase as unknown as SupabaseClient<ArmazemDatabase>
