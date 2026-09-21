export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          atualizado_em: string
          criado_em: string
          entidade_id: string
          estado: string
          id: string
          reconhecido_em: string | null
          reconhecido_por: string | null
          regra_id: string
          resolvido_em: string | null
          resolvido_por: string | null
          severidade: string
          valor_atual: number | null
          valor_limiar: number | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          entidade_id: string
          estado?: string
          id?: string
          reconhecido_em?: string | null
          reconhecido_por?: string | null
          regra_id: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade: string
          valor_atual?: number | null
          valor_limiar?: number | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          entidade_id?: string
          estado?: string
          id?: string
          reconhecido_em?: string | null
          reconhecido_por?: string | null
          regra_id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          valor_atual?: number | null
          valor_limiar?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      atribuicoes_epi: {
        Row: {
          colaborador_id: string
          data_devolucao: string | null
          data_entrega: string
          data_validade: string | null
          devolvido: boolean | null
          id: string
          regra_alerta_id: string | null
          tipo_epi_id: string
        }
        Insert: {
          colaborador_id: string
          data_devolucao?: string | null
          data_entrega: string
          data_validade?: string | null
          devolvido?: boolean | null
          id?: string
          regra_alerta_id?: string | null
          tipo_epi_id: string
        }
        Update: {
          colaborador_id?: string
          data_devolucao?: string | null
          data_entrega?: string
          data_validade?: string | null
          devolvido?: boolean | null
          id?: string
          regra_alerta_id?: string | null
          tipo_epi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atribuicoes_epi_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atribuicoes_epi_regra_alerta_id_fkey"
            columns: ["regra_alerta_id"]
            isOneToOne: false
            referencedRelation: "regras_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atribuicoes_epi_tipo_epi_id_fkey"
            columns: ["tipo_epi_id"]
            isOneToOne: false
            referencedRelation: "tipos_epi"
            referencedColumns: ["id"]
          },
        ]
      }
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
          data_pagamento: string | null
          estado: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento: string
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          referencia_pagamento: string | null
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
          data_pagamento?: string | null
          estado?: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento?: string
          id?: string
          numero: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          referencia_pagamento?: string | null
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
          data_pagamento?: string | null
          estado?: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento?: string
          id?: string
          numero?: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          referencia_pagamento?: string | null
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
      colaboradores: {
        Row: {
          ativo: boolean
          cargo: string
          created_at: string
          id: string
          nif: string | null
          nome: string
          notas: string | null
          numero_mecan: string
          obra_id: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          cargo: string
          created_at?: string
          id?: string
          nif?: string | null
          nome: string
          notas?: string | null
          numero_mecan: string
          obra_id?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          id?: string
          nif?: string | null
          nome?: string
          notas?: string | null
          numero_mecan?: string
          obra_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
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
          foto_url: string | null
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
          foto_url?: string | null
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
          foto_url?: string | null
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
          contador: number | null
          criado_em: string
          custo_gemini: number | null
          custo_total: number | null
          data: string
          estado: string
          foto_medidor_url: string | null
          foto_url: string | null
          funcionario_nome: string
          id: string
          litros: number | null
          litros_gemini: number | null
          local: string | null
          observacoes: string | null
          tipo_fonte: string
          veiculo_id: string
          veiculo_nome: string
        }
        Insert: {
          contador?: number | null
          criado_em?: string
          custo_gemini?: number | null
          custo_total?: number | null
          data?: string
          estado?: string
          foto_medidor_url?: string | null
          foto_url?: string | null
          funcionario_nome: string
          id?: string
          litros?: number | null
          litros_gemini?: number | null
          local?: string | null
          observacoes?: string | null
          tipo_fonte?: string
          veiculo_id: string
          veiculo_nome: string
        }
        Update: {
          contador?: number | null
          criado_em?: string
          custo_gemini?: number | null
          custo_total?: number | null
          data?: string
          estado?: string
          foto_medidor_url?: string | null
          foto_url?: string | null
          funcionario_nome?: string
          id?: string
          litros?: number | null
          litros_gemini?: number | null
          local?: string | null
          observacoes?: string | null
          tipo_fonte?: string
          veiculo_id?: string
          veiculo_nome?: string
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comb_veiculos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          data_fim_seguro: string | null
          data_proxima_ipo: string | null
          id: string
          identificacao: string | null
          intervalo_revisao_km: number | null
          intervalo_revisao_meses: number | null
          nome: string
          observacoes: string | null
          proxima_revisao_data: string | null
          proxima_revisao_km: number | null
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
          data_fim_seguro?: string | null
          data_proxima_ipo?: string | null
          id?: string
          identificacao?: string | null
          intervalo_revisao_km?: number | null
          intervalo_revisao_meses?: number | null
          nome: string
          observacoes?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
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
          data_fim_seguro?: string | null
          data_proxima_ipo?: string | null
          id?: string
          identificacao?: string | null
          intervalo_revisao_km?: number | null
          intervalo_revisao_meses?: number | null
          nome?: string
          observacoes?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
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
      custo_hora_colaborador: {
        Row: {
          colaborador_id: string
          custo_normal: number
          custo_supl: number
          valido_ate: string | null
          valido_de: string
        }
        Insert: {
          colaborador_id: string
          custo_normal: number
          custo_supl: number
          valido_ate?: string | null
          valido_de: string
        }
        Update: {
          colaborador_id?: string
          custo_normal?: number
          custo_supl?: number
          valido_ate?: string | null
          valido_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "custo_hora_colaborador_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
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
      faltas: {
        Row: {
          colaborador_id: string
          comprovativo_key: string | null
          comunicada_em: string
          dado_saude: boolean
          data_fim: string
          data_inicio: string
          decidida_em: string | null
          decidida_por: string | null
          estado: string
          id: string
          justificacao_texto: string | null
          periodo: string | null
          prazo_prova_ate: string | null
          previsivel: boolean
          tipo_falta_id: string | null
        }
        Insert: {
          colaborador_id: string
          comprovativo_key?: string | null
          comunicada_em?: string
          dado_saude?: boolean
          data_fim: string
          data_inicio: string
          decidida_em?: string | null
          decidida_por?: string | null
          estado?: string
          id?: string
          justificacao_texto?: string | null
          periodo?: string | null
          prazo_prova_ate?: string | null
          previsivel?: boolean
          tipo_falta_id?: string | null
        }
        Update: {
          colaborador_id?: string
          comprovativo_key?: string | null
          comunicada_em?: string
          dado_saude?: boolean
          data_fim?: string
          data_inicio?: string
          decidida_em?: string | null
          decidida_por?: string | null
          estado?: string
          id?: string
          justificacao_texto?: string | null
          periodo?: string | null
          prazo_prova_ate?: string | null
          previsivel?: boolean
          tipo_falta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faltas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faltas_tipo_falta_id_fkey"
            columns: ["tipo_falta_id"]
            isOneToOne: false
            referencedRelation: "tipos_falta"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados_excecoes: {
        Row: {
          ambito: string
          data: string
          designacao: string
          tipo: string
        }
        Insert: {
          ambito: string
          data: string
          designacao: string
          tipo: string
        }
        Update: {
          ambito?: string
          data?: string
          designacao?: string
          tipo?: string
        }
        Relationships: []
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
      formacoes_colaborador: {
        Row: {
          certificado_key: string | null
          colaborador_id: string
          data_conclusao: string
          data_validade: string | null
          entidade: string | null
          id: string
          regra_alerta_id: string | null
          tipo_id: string
        }
        Insert: {
          certificado_key?: string | null
          colaborador_id: string
          data_conclusao: string
          data_validade?: string | null
          entidade?: string | null
          id?: string
          regra_alerta_id?: string | null
          tipo_id: string
        }
        Update: {
          certificado_key?: string | null
          colaborador_id?: string
          data_conclusao?: string
          data_validade?: string | null
          entidade?: string | null
          id?: string
          regra_alerta_id?: string | null
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "formacoes_colaborador_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacoes_colaborador_regra_alerta_id_fkey"
            columns: ["regra_alerta_id"]
            isOneToOne: false
            referencedRelation: "regras_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formacoes_colaborador_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_formacao"
            referencedColumns: ["id"]
          },
        ]
      }
      horario_colaborador: {
        Row: {
          colaborador_id: string
          horario_id: string
          valido_ate: string | null
          valido_de: string
        }
        Insert: {
          colaborador_id: string
          horario_id: string
          valido_ate?: string | null
          valido_de: string
        }
        Update: {
          colaborador_id?: string
          horario_id?: string
          valido_ate?: string | null
          valido_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "horario_colaborador_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horario_colaborador_horario_id_fkey"
            columns: ["horario_id"]
            isOneToOne: false
            referencedRelation: "horarios"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios: {
        Row: {
          ativo: boolean
          created_at: string
          designacao: string
          dias_semana: number[]
          hora_entrada: string
          hora_saida: string
          id: string
          intervalo_fim: string | null
          intervalo_inicio: string | null
          intervalo_min: number | null
          periodo_diario_h: number
          periodo_semanal_h: number
          tolerancia_entrada_min: number
          valido_ate: string | null
          valido_de: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          designacao: string
          dias_semana: number[]
          hora_entrada: string
          hora_saida: string
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          intervalo_min?: number | null
          periodo_diario_h: number
          periodo_semanal_h: number
          tolerancia_entrada_min?: number
          valido_ate?: string | null
          valido_de?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          designacao?: string
          dias_semana?: number[]
          hora_entrada?: string
          hora_saida?: string
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
          intervalo_min?: number | null
          periodo_diario_h?: number
          periodo_semanal_h?: number
          tolerancia_entrada_min?: number
          valido_ate?: string | null
          valido_de?: string | null
        }
        Relationships: []
      }
      liberacoes_retencao: {
        Row: {
          created_at: string
          data_liberacao: string
          id: string
          motivo: string
          obra_id: string | null
          observacoes: string | null
          registado_por: string | null
          subempreiteiro_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_liberacao?: string
          id?: string
          motivo?: string
          obra_id?: string | null
          observacoes?: string | null
          registado_por?: string | null
          subempreiteiro_id: string
          valor: number
        }
        Update: {
          created_at?: string
          data_liberacao?: string
          id?: string
          motivo?: string
          obra_id?: string | null
          observacoes?: string | null
          registado_por?: string | null
          subempreiteiro_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "liberacoes_retencao_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liberacoes_retencao_registado_por_fkey"
            columns: ["registado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liberacoes_retencao_subempreiteiro_id_fkey"
            columns: ["subempreiteiro_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiros"
            referencedColumns: ["id"]
          },
        ]
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
          geofence_centro: unknown
          geofence_poligono: unknown
          geofence_raio_m: number | null
          geofence_tipo: string | null
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
          geofence_centro?: unknown
          geofence_poligono?: unknown
          geofence_raio_m?: number | null
          geofence_tipo?: string | null
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
          geofence_centro?: unknown
          geofence_poligono?: unknown
          geofence_raio_m?: number | null
          geofence_tipo?: string | null
          id?: string
          localizacao?: string | null
          nome?: string
          observacoes?: string | null
          orcamento?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      picagens: {
        Row: {
          colaborador_id: string
          desvio_relogio_s: number | null
          distancia_geofence_m: number | null
          hora_final_validada: string | null
          hora_original_proposta: string | null
          id: string
          justificacao: string | null
          mock_location_detetada: boolean | null
          obra_id: string
          origem: string
          posicao: unknown
          precisao_m: number | null
          resultado: string
          timestamp_dispositivo: string
          timestamp_servidor: string | null
          tipo: string
          validada_em: string | null
          validada_por: string | null
        }
        Insert: {
          colaborador_id: string
          desvio_relogio_s?: number | null
          distancia_geofence_m?: number | null
          hora_final_validada?: string | null
          hora_original_proposta?: string | null
          id?: string
          justificacao?: string | null
          mock_location_detetada?: boolean | null
          obra_id: string
          origem?: string
          posicao?: unknown
          precisao_m?: number | null
          resultado?: string
          timestamp_dispositivo: string
          timestamp_servidor?: string | null
          tipo: string
          validada_em?: string | null
          validada_por?: string | null
        }
        Update: {
          colaborador_id?: string
          desvio_relogio_s?: number | null
          distancia_geofence_m?: number | null
          hora_final_validada?: string | null
          hora_original_proposta?: string | null
          id?: string
          justificacao?: string | null
          mock_location_detetada?: boolean | null
          obra_id?: string
          origem?: string
          posicao?: unknown
          precisao_m?: number | null
          resultado?: string
          timestamp_dispositivo?: string
          timestamp_servidor?: string | null
          tipo?: string
          validada_em?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "picagens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picagens_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
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
      regras_alerta: {
        Row: {
          ativa: boolean
          campo_ref: string
          canais: string[]
          criada_em: string
          destinatarios: string[]
          entidade_alvo: string
          entidade_id: string | null
          id: string
          limiar_atencao: number | null
          limiar_urgente: number | null
          tipo: string
        }
        Insert: {
          ativa?: boolean
          campo_ref: string
          canais?: string[]
          criada_em?: string
          destinatarios?: string[]
          entidade_alvo: string
          entidade_id?: string | null
          id?: string
          limiar_atencao?: number | null
          limiar_urgente?: number | null
          tipo: string
        }
        Update: {
          ativa?: boolean
          campo_ref?: string
          canais?: string[]
          criada_em?: string
          destinatarios?: string[]
          entidade_alvo?: string
          entidade_id?: string | null
          id?: string
          limiar_atencao?: number | null
          limiar_urgente?: number | null
          tipo?: string
        }
        Relationships: []
      }
      resumo_assiduidade_dia: {
        Row: {
          colaborador_id: string
          data: string
          desvio: number | null
          horas_efetivas: number | null
          horas_previstas: number | null
          horas_supl_propostas: number | null
          horas_supl_validadas: number | null
          obra_id: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          colaborador_id: string
          data: string
          desvio?: number | null
          horas_efetivas?: number | null
          horas_previstas?: number | null
          horas_supl_propostas?: number | null
          horas_supl_validadas?: number | null
          obra_id?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          colaborador_id?: string
          data?: string
          desvio?: number | null
          horas_efetivas?: number | null
          horas_previstas?: number | null
          horas_supl_propostas?: number | null
          horas_supl_validadas?: number | null
          obra_id?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resumo_assiduidade_dia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resumo_assiduidade_dia_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
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
          percentagem_retencao: number
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
          percentagem_retencao?: number
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
          percentagem_retencao?: number
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
      tipos_epi: {
        Row: {
          designacao: string
          id: string
          obrigatorio: boolean | null
          validade_dias: number | null
        }
        Insert: {
          designacao: string
          id?: string
          obrigatorio?: boolean | null
          validade_dias?: number | null
        }
        Update: {
          designacao?: string
          id?: string
          obrigatorio?: boolean | null
          validade_dias?: number | null
        }
        Relationships: []
      }
      tipos_falta: {
        Row: {
          ativo: boolean
          descontavel: boolean
          designacao: string
          id: string
          justificada: boolean | null
        }
        Insert: {
          ativo?: boolean
          descontavel?: boolean
          designacao: string
          id?: string
          justificada?: boolean | null
        }
        Update: {
          ativo?: boolean
          descontavel?: boolean
          designacao?: string
          id?: string
          justificada?: boolean | null
        }
        Relationships: []
      }
      tipos_formacao: {
        Row: {
          designacao: string
          id: string
          obrigatoria: boolean | null
          validade_anos: number | null
        }
        Insert: {
          designacao: string
          id?: string
          obrigatoria?: boolean | null
          validade_anos?: number | null
        }
        Update: {
          designacao?: string
          id?: string
          obrigatoria?: boolean | null
          validade_anos?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      alertas_detalhados: {
        Row: {
          atualizado_em: string | null
          campo_ref: string | null
          criado_em: string | null
          entidade_alvo: string | null
          entidade_detalhe: string | null
          entidade_id: string | null
          entidade_nome: string | null
          estado: string | null
          id: string | null
          limiar_atencao: number | null
          limiar_urgente: number | null
          reconhecido_em: string | null
          reconhecido_por: string | null
          regra_id: string | null
          regra_tipo: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          severidade: string | null
          valor_atual: number | null
          valor_limiar: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _upsert_alerta: {
        Args: {
          p_entidade_id: string
          p_regra_id: string
          p_severidade: string
          p_valor_atual: number
          p_valor_limiar: number
        }
        Returns: undefined
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      aprovar_abastecimento_pendente: {
        Args: { p_id: string }
        Returns: undefined
      }
      autorizar_abastecimento: {
        Args: { p_id: string }
        Returns: undefined
      }
      auth_role: { Args: never; Returns: string }
      avaliar_regras_alerta: { Args: never; Returns: number }
      calcular_resumo_dia: { Args: { p_data: string }; Returns: undefined }
      check_pend_rate_limit: {
        Args: { p_veiculo_id: string }
        Returns: boolean
      }
      criar_auto_rpc: {
        Args: {
          p_data: string
          p_notas?: string
          p_percentagem: number
          p_sub_id: string
          p_valor: number
        }
        Returns: {
          id: string
          numero: number
        }[]
      }
      custos_materiais_por_obra: {
        Args: never
        Returns: {
          combustivel: number
          materiais: number
          obra_id: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gerar_codigo_ferramenta: { Args: never; Returns: string }
      gerar_codigo_produto: { Args: never; Returns: string }
      gerar_codigo_veiculo: { Args: never; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      longtransactionsenabled: { Args: never; Returns: boolean }
      marcar_auto_em_atraso: { Args: { p_auto_id: string }; Returns: undefined }
      marcar_auto_pago: {
        Args: { p_auto_id: string; p_referencia?: string }
        Returns: undefined
      }
      pode_escrever: { Args: { modulo: string }; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      produtos_em_alerta: {
        Args: never
        Returns: {
          id: string
          nome: string
          stock_atual: number
          stock_minimo: number
          unidade: string
        }[]
      }
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
          p_assinatura_devolucao?: string
          p_assinatura_responsavel_dev?: string
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
          p_assinatura_entrega?: string
          p_assinatura_responsavel_ent?: string
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
      registar_picagem_geofence: {
        Args: {
          p_colaborador_id: string
          p_lat: number
          p_lon: number
          p_obra_id: string
          p_precisao_m: number
          p_timestamp_disp?: string
          p_tipo: string
        }
        Returns: Json
      }
      rejeitar_abastecimento: {
        Args: { p_id: string }
        Returns: undefined
      }
      rejeitar_abastecimento_pendente: {
        Args: { p_id: string }
        Returns: undefined
      }
      concluir_abastecimento: {
        Args: {
          p_id: string
          p_litros: number
          p_custo_total: number
          p_foto_medidor: string
        }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      validar_auto: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          data_medicao: string
          data_pagamento: string | null
          estado: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento: string
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          referencia_pagamento: string | null
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
          percentagem_retencao: number
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
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
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
