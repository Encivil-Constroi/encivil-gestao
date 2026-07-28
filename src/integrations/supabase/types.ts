export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      auto_linhas: {
        Row: {
          artigo_id: string | null
          auto_id: string
          created_at: string
          descricao: string
          id: string
          is_extra: boolean
          preco_unitario: number
          quantidade: number
          unidade: string
        }
        Insert: {
          artigo_id?: string | null
          auto_id: string
          created_at?: string
          descricao: string
          id?: string
          is_extra?: boolean
          preco_unitario: number
          quantidade: number
          unidade: string
        }
        Update: {
          artigo_id?: string | null
          auto_id?: string
          created_at?: string
          descricao?: string
          id?: string
          is_extra?: boolean
          preco_unitario?: number
          quantidade?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_linhas_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiro_artigos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_linhas_auto_id_fkey"
            columns: ["auto_id"]
            isOneToOne: false
            referencedRelation: "autos_medicao"
            referencedColumns: ["id"]
          },
        ]
      }
      autos_medicao: {
        Row: {
          created_at: string
          created_by: string | null
          data_medicao: string
          estado: Database["public"]["Enums"]["estado_auto"]
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          subempreiteiro_id: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_periodo: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_medicao?: string
          estado?: Database["public"]["Enums"]["estado_auto"]
          id?: string
          numero: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          subempreiteiro_id: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_periodo?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_medicao?: string
          estado?: Database["public"]["Enums"]["estado_auto"]
          id?: string
          numero?: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          subempreiteiro_id?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_periodo?: number
        }
        Relationships: [
          {
            foreignKeyName: "autos_medicao_subempreiteiro_id_fkey"
            columns: ["subempreiteiro_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiros"
            referencedColumns: ["id"]
          },
        ]
      }
      comb_abastecimentos: {
        Row: {
          contador: number | null
          created_at: string
          created_by: string | null
          custo_total: number
          data: string
          id: string
          litros: number
          local: string | null
          obra_id: string | null
          observacoes: string | null
          responsavel: string
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          contador?: number | null
          created_at?: string
          created_by?: string | null
          custo_total: number
          data?: string
          id?: string
          litros: number
          local?: string | null
          obra_id?: string | null
          observacoes?: string | null
          responsavel: string
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          contador?: number | null
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data?: string
          id?: string
          litros?: number
          local?: string | null
          obra_id?: string | null
          observacoes?: string | null
          responsavel?: string
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comb_abastecimentos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comb_abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      comb_abastecimentos_pendentes: {
        Row: {
          id: string
          veiculo_id: string
          veiculo_nome: string
          funcionario_nome: string
          data: string
          litros: number
          custo_total: number
          contador: number | null
          local: string | null
          observacoes: string | null
          foto_url: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          veiculo_id: string
          veiculo_nome: string
          funcionario_nome: string
          data?: string
          litros: number
          custo_total: number
          contador?: number | null
          local?: string | null
          observacoes?: string | null
          foto_url?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          veiculo_id?: string
          veiculo_nome?: string
          funcionario_nome?: string
          data?: string
          litros?: number
          custo_total?: number
          contador?: number | null
          local?: string | null
          observacoes?: string | null
          foto_url?: string | null
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "comb_abastecimentos_pendentes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      comb_veiculos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          identificacao: string | null
          nome: string
          observacoes: string | null
          tipo: string
          tipo_combustivel: string
          unidade_contador: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          identificacao?: string | null
          nome: string
          observacoes?: string | null
          tipo?: string
          tipo_combustivel?: string
          unidade_contador?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          identificacao?: string | null
          nome?: string
          observacoes?: string | null
          tipo?: string
          tipo_combustivel?: string
          unidade_contador?: string
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes_empresa: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          nif_empresa: string | null
          nome_empresa: string
          responsavel_armazem: string | null
          sede_empresa: string | null
          stock_minimo_padrao: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          nif_empresa?: string | null
          nome_empresa?: string
          responsavel_armazem?: string | null
          sede_empresa?: string | null
          stock_minimo_padrao?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          nif_empresa?: string | null
          nome_empresa?: string
          responsavel_armazem?: string | null
          sede_empresa?: string | null
          stock_minimo_padrao?: number
          updated_at?: string
        }
        Relationships: []
      }
      emprestimos_ferramentas: {
        Row: {
          assinatura_devolucao: string | null
          assinatura_entrega: string | null
          assinatura_responsavel_devolucao: string | null
          assinatura_responsavel_entrega: string | null
          condicao_devolucao:
            | Database["public"]["Enums"]["condicao_devolucao"]
            | null
          condicao_entrega: string | null
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_emprestimo: string
          data_prevista_devolucao: string | null
          destino_obra: string | null
          estado: Database["public"]["Enums"]["estado_emprestimo"]
          ferramenta_id: string
          funcionario_documento: string | null
          funcionario_nome: string
          id: string
          obra_id: string | null
          observacoes: string | null
          observacoes_devolucao: string | null
          responsavel_entrega: string
          responsavel_recebimento: string | null
          updated_at: string
        }
        Insert: {
          assinatura_devolucao?: string | null
          assinatura_entrega?: string | null
          assinatura_responsavel_devolucao?: string | null
          assinatura_responsavel_entrega?: string | null
          condicao_devolucao?:
            | Database["public"]["Enums"]["condicao_devolucao"]
            | null
          condicao_entrega?: string | null
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          data_prevista_devolucao?: string | null
          destino_obra?: string | null
          estado?: Database["public"]["Enums"]["estado_emprestimo"]
          ferramenta_id: string
          funcionario_documento?: string | null
          funcionario_nome: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          observacoes_devolucao?: string | null
          responsavel_entrega: string
          responsavel_recebimento?: string | null
          updated_at?: string
        }
        Update: {
          assinatura_devolucao?: string | null
          assinatura_entrega?: string | null
          assinatura_responsavel_devolucao?: string | null
          assinatura_responsavel_entrega?: string | null
          condicao_devolucao?:
            | Database["public"]["Enums"]["condicao_devolucao"]
            | null
          condicao_entrega?: string | null
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          data_prevista_devolucao?: string | null
          destino_obra?: string | null
          estado?: Database["public"]["Enums"]["estado_emprestimo"]
          ferramenta_id?: string
          funcionario_documento?: string | null
          funcionario_nome?: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          observacoes_devolucao?: string | null
          responsavel_entrega?: string
          responsavel_recebimento?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emprestimos_ferramentas_ferramenta_id_fkey"
            columns: ["ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_ferramentas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_ferramenta"]
          id: string
          nome: string
          numero_serie: string | null
          observacoes: string | null
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_ferramenta"]
          id?: string
          nome: string
          numero_serie?: string | null
          observacoes?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_ferramenta"]
          id?: string
          nome?: string
          numero_serie?: string | null
          observacoes?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
      movimentos_stock: {
        Row: {
          created_at: string
          created_by: string | null
          destino_obra: string | null
          id: string
          obra_id: string | null
          observacoes: string | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destino_obra?: string | null
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destino_obra?: string | null
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          responsavel?: string
          stock_antes?: number
          stock_depois?: number
          tipo?: Database["public"]["Enums"]["tipo_movimento"]
        }
        Relationships: [
          {
            foreignKeyName: "movimentos_stock_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentos_stock_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          ativo: boolean
          cliente: string | null
          created_at: string
          created_by: string | null
          estado: string
          id: string
          localizacao: string | null
          nome: string
          observacoes: string | null
          orcamento: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          localizacao?: string | null
          nome: string
          observacoes?: string | null
          orcamento?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          localizacao?: string | null
          nome?: string
          observacoes?: string | null
          orcamento?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          custo_unitario: number
          id: string
          nome: string
          observacoes: string | null
          stock_atual: number
          stock_minimo: number
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo?: string
          created_at?: string
          custo_unitario?: number
          id?: string
          nome: string
          observacoes?: string | null
          stock_atual?: number
          stock_minimo?: number
          unidade: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          custo_unitario?: number
          id?: string
          nome?: string
          observacoes?: string | null
          stock_atual?: number
          stock_minimo?: number
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["role_utilizador"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["role_utilizador"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["role_utilizador"]
        }
        Relationships: []
      }
      subempreiteiro_artigos: {
        Row: {
          created_at: string
          descricao: string
          id: string
          is_extra: boolean
          preco_unitario: number
          quantidade_prevista: number
          subempreiteiro_id: string
          unidade: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          is_extra?: boolean
          preco_unitario: number
          quantidade_prevista: number
          subempreiteiro_id: string
          unidade: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          is_extra?: boolean
          preco_unitario?: number
          quantidade_prevista?: number
          subempreiteiro_id?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "subempreiteiro_artigos_subempreiteiro_id_fkey"
            columns: ["subempreiteiro_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiros"
            referencedColumns: ["id"]
          },
        ]
      }
      subempreiteiros: {
        Row: {
          condicoes: string | null
          contacto_responsavel: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["estado_subempreitada"]
          id: string
          nome: string
          obra_id: string
          tipo: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_global: number | null
        }
        Insert: {
          condicoes?: string | null
          contacto_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_subempreitada"]
          id?: string
          nome: string
          obra_id: string
          tipo?: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_global?: number | null
        }
        Update: {
          condicoes?: string | null
          contacto_responsavel?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["estado_subempreitada"]
          id?: string
          nome?: string
          obra_id?: string
          tipo?: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_global?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subempreiteiros_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aprovar_abastecimento_pendente: { Args: { p_id: string }; Returns: void }
      criar_auto_rpc: {
        Args: {
          p_sub_id: string
          p_data: string
          p_percentagem: number | null
          p_valor: number
          p_notas?: string | null
        }
        Returns: { id: string; numero: number }[]
      }
      custos_materiais_por_obra: {
        Args: Record<string, never>
        Returns: { obra_id: string; materiais: number; combustivel: number }[]
      }
      produtos_em_alerta: {
        Args: Record<string, never>
        Returns: { id: string; nome: string; unidade: string; stock_atual: number; stock_minimo: number }[]
      }
      auth_role: { Args: never; Returns: string }
      gerar_codigo_ferramenta: { Args: never; Returns: string }
      gerar_codigo_produto: { Args: never; Returns: string }
      gerar_codigo_veiculo: { Args: never; Returns: string }
      pode_escrever: { Args: { modulo: string }; Returns: boolean }
      promover_role: {
        Args: {
          p_novo_role: Database["public"]["Enums"]["role_utilizador"]
          p_user_id: string
        }
        Returns: {
          created_at: string
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["role_utilizador"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registar_devolucao_ferramenta: {
        Args: {
          p_condicao_devolucao: Database["public"]["Enums"]["condicao_devolucao"]
          p_emprestimo_id: string
          p_observacoes_devolucao?: string
          p_responsavel_recebimento: string
        }
        Returns: {
          assinatura_devolucao: string | null
          assinatura_entrega: string | null
          assinatura_responsavel_devolucao: string | null
          assinatura_responsavel_entrega: string | null
          condicao_devolucao:
            | Database["public"]["Enums"]["condicao_devolucao"]
            | null
          condicao_entrega: string | null
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_emprestimo: string
          data_prevista_devolucao: string | null
          destino_obra: string | null
          estado: Database["public"]["Enums"]["estado_emprestimo"]
          ferramenta_id: string
          funcionario_documento: string | null
          funcionario_nome: string
          id: string
          obra_id: string | null
          observacoes: string | null
          observacoes_devolucao: string | null
          responsavel_entrega: string
          responsavel_recebimento: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "emprestimos_ferramentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registar_emprestimo_ferramenta: {
        Args: {
          p_condicao_entrega?: string
          p_data_prevista_devolucao?: string
          p_destino_obra?: string
          p_ferramenta_id: string
          p_funcionario_documento?: string
          p_funcionario_nome: string
          p_obra_id?: string
          p_observacoes?: string
          p_responsavel_entrega: string
        }
        Returns: {
          assinatura_devolucao: string | null
          assinatura_entrega: string | null
          assinatura_responsavel_devolucao: string | null
          assinatura_responsavel_entrega: string | null
          condicao_devolucao:
            | Database["public"]["Enums"]["condicao_devolucao"]
            | null
          condicao_entrega: string | null
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_emprestimo: string
          data_prevista_devolucao: string | null
          destino_obra: string | null
          estado: Database["public"]["Enums"]["estado_emprestimo"]
          ferramenta_id: string
          funcionario_documento: string | null
          funcionario_nome: string
          id: string
          obra_id: string | null
          observacoes: string | null
          observacoes_devolucao: string | null
          responsavel_entrega: string
          responsavel_recebimento: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "emprestimos_ferramentas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registar_movimento: {
        Args: {
          p_destino_obra?: string
          p_obra_id?: string
          p_observacoes?: string
          p_produto_id: string
          p_quantidade: number
          p_responsavel: string
          p_tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        Returns: {
          created_at: string
          created_by: string | null
          destino_obra: string | null
          id: string
          obra_id: string | null
          observacoes: string | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        SetofOptions: {
          from: "*"
          to: "movimentos_stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validar_auto: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          data_medicao: string
          estado: Database["public"]["Enums"]["estado_auto"]
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          subempreiteiro_id: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_periodo: number
        }
        SetofOptions: {
          from: "*"
          to: "autos_medicao"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rejeitar_abastecimento_pendente: { Args: { p_id: string }; Returns: void }
      validar_subempreiteiro: {
        Args: { p_id: string }
        Returns: {
          condicoes: string | null
          contacto_responsavel: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["estado_subempreitada"]
          id: string
          nome: string
          obra_id: string
          tipo: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_global: number | null
        }
        SetofOptions: {
          from: "*"
          to: "subempreiteiros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      condicao_devolucao: "bom_estado" | "danificada" | "perdida"
      estado_auto: "rascunho" | "validado"
      estado_emprestimo: "ativo" | "devolvido"
      estado_ferramenta: "disponivel" | "emprestada" | "manutencao" | "inativa"
      estado_subempreitada: "rascunho" | "validado"
      role_utilizador: "admin" | "gestor" | "armazem" | "medicoes" | "leitura"
      tipo_movimento: "entrada" | "saida" | "ajuste"
      tipo_subempreitada: "global" | "unitario"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      condicao_devolucao: ["bom_estado", "danificada", "perdida"],
      estado_auto: ["rascunho", "validado"],
      estado_emprestimo: ["ativo", "devolvido"],
      estado_ferramenta: ["disponivel", "emprestada", "manutencao", "inativa"],
      estado_subempreitada: ["rascunho", "validado"],
      role_utilizador: ["admin", "gestor", "armazem", "medicoes", "leitura"],
      tipo_movimento: ["entrada", "saida", "ajuste"],
      tipo_subempreitada: ["global", "unitario"],
    },
  },
} as const


// Aliases usados no código da app (derivados dos enums gerados).
export type RoleUtilizador = Database['public']['Enums']['role_utilizador']
export type TipoMovimento = Database['public']['Enums']['tipo_movimento']
