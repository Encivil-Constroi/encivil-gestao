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
          push_em: string | null
          push_severidade: string | null
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
          push_em?: string | null
          push_severidade?: string | null
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
          push_em?: string | null
          push_severidade?: string | null
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
          operacao: string | null
          tabela: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          operacao?: string | null
          tabela?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          operacao?: string | null
          tabela?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      auto_evidencias: {
        Row: {
          auto_id: string
          autor_id: string | null
          dentro_obra: boolean | null
          distancia_obra_m: number | null
          enviada_em: string
          hash_sha256: string
          id: string
          latitude: number | null
          legenda: string | null
          linha_id: string | null
          longitude: number | null
          motivo_invalida: string | null
          path: string
          precisao_m: number | null
          precisao_ok: boolean | null
          tirada_em: string
          valida: boolean
        }
        Insert: {
          auto_id: string
          autor_id?: string | null
          dentro_obra?: boolean | null
          distancia_obra_m?: number | null
          enviada_em?: string
          hash_sha256: string
          id?: string
          latitude?: number | null
          legenda?: string | null
          linha_id?: string | null
          longitude?: number | null
          motivo_invalida?: string | null
          path: string
          precisao_m?: number | null
          precisao_ok?: boolean | null
          tirada_em: string
          valida?: boolean
        }
        Update: {
          auto_id?: string
          autor_id?: string | null
          dentro_obra?: boolean | null
          distancia_obra_m?: number | null
          enviada_em?: string
          hash_sha256?: string
          id?: string
          latitude?: number | null
          legenda?: string | null
          linha_id?: string | null
          longitude?: number | null
          motivo_invalida?: string | null
          path?: string
          precisao_m?: number | null
          precisao_ok?: boolean | null
          tirada_em?: string
          valida?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "auto_evidencias_auto_id_fkey"
            columns: ["auto_id"]
            isOneToOne: false
            referencedRelation: "autos_medicao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_evidencias_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "auto_linhas"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_glosas: {
        Row: {
          auto_id: string
          criado_em: string
          criado_por: string | null
          descricao: string
          estado: string
          id: string
          levantada_em: string | null
          levantada_por: string | null
          linha_id: string | null
          motivo: string
          motivo_levantamento: string | null
          ocorrencia_id: string | null
          valor: number
        }
        Insert: {
          auto_id: string
          criado_em?: string
          criado_por?: string | null
          descricao: string
          estado?: string
          id?: string
          levantada_em?: string | null
          levantada_por?: string | null
          linha_id?: string | null
          motivo: string
          motivo_levantamento?: string | null
          ocorrencia_id?: string | null
          valor: number
        }
        Update: {
          auto_id?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          estado?: string
          id?: string
          levantada_em?: string | null
          levantada_por?: string | null
          linha_id?: string | null
          motivo?: string
          motivo_levantamento?: string | null
          ocorrencia_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_glosas_auto_id_fkey"
            columns: ["auto_id"]
            isOneToOne: false
            referencedRelation: "autos_medicao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_glosas_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "auto_linhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_glosas_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "sub_ocorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_linhas: {
        Row: {
          artigo_id: string | null
          auto_id: string
          created_at: string
          descricao: string
          id: string
          is_extra: boolean
          justificacao: string | null
          preco_unitario: number
          qtd_pedida: number | null
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
          justificacao?: string | null
          preco_unitario: number
          qtd_pedida?: number | null
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
          justificacao?: string | null
          preco_unitario?: number
          qtd_pedida?: number | null
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
      auto_verificacoes: {
        Row: {
          auto_id: string
          id: string
          item: string
          observacao: string | null
          ordem: number
          resultado: string
          verificado_em: string | null
          verificado_por: string | null
        }
        Insert: {
          auto_id: string
          id?: string
          item: string
          observacao?: string | null
          ordem: number
          resultado?: string
          verificado_em?: string | null
          verificado_por?: string | null
        }
        Update: {
          auto_id?: string
          id?: string
          item?: string
          observacao?: string | null
          ordem?: number
          resultado?: string
          verificado_em?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_verificacoes_auto_id_fkey"
            columns: ["auto_id"]
            isOneToOne: false
            referencedRelation: "autos_medicao"
            referencedColumns: ["id"]
          },
        ]
      }
      autos_medicao: {
        Row: {
          anotacoes: string | null
          atraso_dias: number
          clima: string | null
          clima_descricao: string | null
          created_at: string
          created_by: string | null
          data_medicao: string
          data_pagamento: string | null
          data_vencimento: string | null
          estado: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento: string
          excecao_motivo: string | null
          fatura_data: string | null
          fatura_nome: string | null
          fatura_numero: string | null
          fatura_path: string | null
          fatura_registada_em: string | null
          fatura_valor: number | null
          fotos: Json
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          problemas: string | null
          progresso_fisico_pct: number | null
          referencia_pagamento: string | null
          subempreiteiro_id: string
          submetido_em: string | null
          submetido_por: string | null
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_glosado: number
          valor_periodo: number
          verificado_em: string | null
          verificado_por: string | null
          workflow: string
        }
        Insert: {
          anotacoes?: string | null
          atraso_dias?: number
          clima?: string | null
          clima_descricao?: string | null
          created_at?: string
          created_by?: string | null
          data_medicao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          estado?: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento?: string
          excecao_motivo?: string | null
          fatura_data?: string | null
          fatura_nome?: string | null
          fatura_numero?: string | null
          fatura_path?: string | null
          fatura_registada_em?: string | null
          fatura_valor?: number | null
          fotos?: Json
          id?: string
          numero: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          problemas?: string | null
          progresso_fisico_pct?: number | null
          referencia_pagamento?: string | null
          subempreiteiro_id: string
          submetido_em?: string | null
          submetido_por?: string | null
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_glosado?: number
          valor_periodo?: number
          verificado_em?: string | null
          verificado_por?: string | null
          workflow?: string
        }
        Update: {
          anotacoes?: string | null
          atraso_dias?: number
          clima?: string | null
          clima_descricao?: string | null
          created_at?: string
          created_by?: string | null
          data_medicao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          estado?: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento?: string
          excecao_motivo?: string | null
          fatura_data?: string | null
          fatura_nome?: string | null
          fatura_numero?: string | null
          fatura_path?: string | null
          fatura_registada_em?: string | null
          fatura_valor?: number | null
          fotos?: Json
          id?: string
          numero?: number
          observacoes?: string | null
          percentagem_periodo?: number | null
          problemas?: string | null
          progresso_fisico_pct?: number | null
          referencia_pagamento?: string | null
          subempreiteiro_id?: string
          submetido_em?: string | null
          submetido_por?: string | null
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_glosado?: number
          valor_periodo?: number
          verificado_em?: string | null
          verificado_por?: string | null
          workflow?: string
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
          email: string | null
          foto_path: string | null
          id: string
          nif: string | null
          nome: string
          notas: string | null
          numero_mecan: string
          obra_id: string | null
          setor: string | null
          telemovel: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          cargo: string
          created_at?: string
          email?: string | null
          foto_path?: string | null
          id?: string
          nif?: string | null
          nome: string
          notas?: string | null
          numero_mecan: string
          obra_id?: string | null
          setor?: string | null
          telemovel?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          email?: string | null
          foto_path?: string | null
          id?: string
          nif?: string | null
          nome?: string
          notas?: string | null
          numero_mecan?: string
          obra_id?: string | null
          setor?: string | null
          telemovel?: string | null
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
      colaboradores_dados_laborais: {
        Row: {
          categoria_profissional: string | null
          colaborador_id: string
          data_admissao: string | null
          data_fim_contrato: string | null
          iban: string | null
          niss: string | null
          tipo_contrato: string | null
          updated_at: string
        }
        Insert: {
          categoria_profissional?: string | null
          colaborador_id: string
          data_admissao?: string | null
          data_fim_contrato?: string | null
          iban?: string | null
          niss?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Update: {
          categoria_profissional?: string | null
          colaborador_id?: string
          data_admissao?: string | null
          data_fim_contrato?: string | null
          iban?: string | null
          niss?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_dados_laborais_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: true
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      comb_abastecimentos: {
        Row: {
          colaborador_id: string | null
          contador: number | null
          created_at: string
          created_by: string | null
          custo_total: number
          data: string
          foto_path: string | null
          foto_url: string | null
          id: string
          litros: number
          local: string | null
          obra_id: string | null
          observacoes: string | null
          pedido_id: string | null
          preco_litro: number | null
          responsavel: string
          solicitante_id: string | null
          tipo_combustivel: string | null
          tipo_fonte: string | null
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          colaborador_id?: string | null
          contador?: number | null
          created_at?: string
          created_by?: string | null
          custo_total: number
          data?: string
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          litros: number
          local?: string | null
          obra_id?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          preco_litro?: number | null
          responsavel: string
          solicitante_id?: string | null
          tipo_combustivel?: string | null
          tipo_fonte?: string | null
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          colaborador_id?: string | null
          contador?: number | null
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data?: string
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          litros?: number
          local?: string | null
          obra_id?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          preco_litro?: number | null
          responsavel?: string
          solicitante_id?: string | null
          tipo_combustivel?: string | null
          tipo_fonte?: string | null
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comb_abastecimentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comb_abastecimentos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comb_abastecimentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "comb_abastecimentos_pendentes"
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
          abastecimento_id: string | null
          autorizado_em: string | null
          autorizado_por: string | null
          bomba_ligada_em: string | null
          cancelado_em: string | null
          cancelado_por: string | null
          colaborador_id: string | null
          concluido_em: string | null
          contador: number | null
          contador_final: number | null
          contador_final_origem: string | null
          contador_inicial: number | null
          contador_inicial_origem: string | null
          criado_em: string
          custo_gemini: number | null
          custo_total: number | null
          data: string
          decisao_em: string | null
          decisao_por: string | null
          estado: string
          foto_contador_inicial_path: string | null
          foto_final_path: string | null
          foto_km_path: string | null
          foto_medidor_url: string | null
          foto_url: string | null
          funcionario_nome: string
          id: string
          km_anterior: number | null
          km_suspeito: boolean
          litros: number | null
          litros_gemini: number | null
          local: string | null
          motivo_recusa: string | null
          notificado_decisao_em: string | null
          observacoes: string | null
          preco_litro: number | null
          pump_activated_at: string | null
          pump_auth_expires_at: string | null
          pump_auth_token: string | null
          pump_max_seconds: number
          push_notificado_em: string | null
          solicitante_id: string | null
          tipo_combustivel: string | null
          tipo_fonte: string
          veiculo_id: string
          veiculo_nome: string
        }
        Insert: {
          abastecimento_id?: string | null
          autorizado_em?: string | null
          autorizado_por?: string | null
          bomba_ligada_em?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string | null
          concluido_em?: string | null
          contador?: number | null
          contador_final?: number | null
          contador_final_origem?: string | null
          contador_inicial?: number | null
          contador_inicial_origem?: string | null
          criado_em?: string
          custo_gemini?: number | null
          custo_total?: number | null
          data?: string
          decisao_em?: string | null
          decisao_por?: string | null
          estado?: string
          foto_contador_inicial_path?: string | null
          foto_final_path?: string | null
          foto_km_path?: string | null
          foto_medidor_url?: string | null
          foto_url?: string | null
          funcionario_nome: string
          id?: string
          km_anterior?: number | null
          km_suspeito?: boolean
          litros?: number | null
          litros_gemini?: number | null
          local?: string | null
          motivo_recusa?: string | null
          notificado_decisao_em?: string | null
          observacoes?: string | null
          preco_litro?: number | null
          pump_activated_at?: string | null
          pump_auth_expires_at?: string | null
          pump_auth_token?: string | null
          pump_max_seconds?: number
          push_notificado_em?: string | null
          solicitante_id?: string | null
          tipo_combustivel?: string | null
          tipo_fonte?: string
          veiculo_id: string
          veiculo_nome: string
        }
        Update: {
          abastecimento_id?: string | null
          autorizado_em?: string | null
          autorizado_por?: string | null
          bomba_ligada_em?: string | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string | null
          concluido_em?: string | null
          contador?: number | null
          contador_final?: number | null
          contador_final_origem?: string | null
          contador_inicial?: number | null
          contador_inicial_origem?: string | null
          criado_em?: string
          custo_gemini?: number | null
          custo_total?: number | null
          data?: string
          decisao_em?: string | null
          decisao_por?: string | null
          estado?: string
          foto_contador_inicial_path?: string | null
          foto_final_path?: string | null
          foto_km_path?: string | null
          foto_medidor_url?: string | null
          foto_url?: string | null
          funcionario_nome?: string
          id?: string
          km_anterior?: number | null
          km_suspeito?: boolean
          litros?: number | null
          litros_gemini?: number | null
          local?: string | null
          motivo_recusa?: string | null
          notificado_decisao_em?: string | null
          observacoes?: string | null
          preco_litro?: number | null
          pump_activated_at?: string | null
          pump_auth_expires_at?: string | null
          pump_auth_token?: string | null
          pump_max_seconds?: number
          push_notificado_em?: string | null
          solicitante_id?: string | null
          tipo_combustivel?: string | null
          tipo_fonte?: string
          veiculo_id?: string
          veiculo_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "comb_abastecimentos_pendentes_abastecimento_id_fkey"
            columns: ["abastecimento_id"]
            isOneToOne: false
            referencedRelation: "comb_abastecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comb_abastecimentos_pendentes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comb_abastecimentos_pendentes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      comb_aprovadores: {
        Row: {
          criado_em: string
          criado_por: string | null
          user_id: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          user_id: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comb_precos: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          preco_litro: number
          tipo_combustivel: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          preco_litro: number
          tipo_combustivel: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          preco_litro?: number
          tipo_combustivel?: string
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
          data_ultima_revisao: string | null
          estado_operacional: string
          id: string
          identificacao: string | null
          intervalo_revisao_km: number | null
          intervalo_revisao_meses: number | null
          ipo_foto_path: string | null
          km_registo: number | null
          km_ultima_revisao: number | null
          marca: string | null
          modelo: string | null
          nome: string
          obra_atual_id: string | null
          observacoes: string | null
          proxima_revisao_data: string | null
          proxima_revisao_km: number | null
          pump_max_seconds: number
          seguro_foto_path: string | null
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
          data_ultima_revisao?: string | null
          estado_operacional?: string
          id?: string
          identificacao?: string | null
          intervalo_revisao_km?: number | null
          intervalo_revisao_meses?: number | null
          ipo_foto_path?: string | null
          km_registo?: number | null
          km_ultima_revisao?: number | null
          marca?: string | null
          modelo?: string | null
          nome: string
          obra_atual_id?: string | null
          observacoes?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
          pump_max_seconds?: number
          seguro_foto_path?: string | null
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
          data_ultima_revisao?: string | null
          estado_operacional?: string
          id?: string
          identificacao?: string | null
          intervalo_revisao_km?: number | null
          intervalo_revisao_meses?: number | null
          ipo_foto_path?: string | null
          km_registo?: number | null
          km_ultima_revisao?: number | null
          marca?: string | null
          modelo?: string | null
          nome?: string
          obra_atual_id?: string | null
          observacoes?: string | null
          proxima_revisao_data?: string | null
          proxima_revisao_km?: number | null
          pump_max_seconds?: number
          seguro_foto_path?: string | null
          tipo?: string
          tipo_combustivel?: string
          unidade_contador?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comb_veiculos_obra_atual_id_fkey"
            columns: ["obra_atual_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
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
          foto_devolucao_path: string | null
          foto_entrega_path: string | null
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
          foto_devolucao_path?: string | null
          foto_entrega_path?: string | null
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
          foto_devolucao_path?: string | null
          foto_entrega_path?: string | null
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
      eventos_seguranca: {
        Row: {
          criado_em: string
          detalhe: Json
          email: string | null
          id: string
          tipo: string
          utilizador_id: string | null
        }
        Insert: {
          criado_em?: string
          detalhe?: Json
          email?: string | null
          id?: string
          tipo: string
          utilizador_id?: string | null
        }
        Update: {
          criado_em?: string
          detalhe?: Json
          email?: string | null
          id?: string
          tipo?: string
          utilizador_id?: string | null
        }
        Relationships: []
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
      faturas_fornecedor: {
        Row: {
          base_tributavel: number | null
          classificado_em: string | null
          created_at: string
          criado_por: string | null
          data_fatura: string | null
          data_recepcao: string
          estado: string
          extraido_em: string | null
          ficheiro_path: string | null
          fornecedor: string
          id: string
          lancado_em: string | null
          nif_fornecedor: string | null
          numero_fatura: string | null
          obra_id: string | null
          observacoes: string | null
          total_fatura: number | null
          updated_at: string
          valor_iva: number | null
        }
        Insert: {
          base_tributavel?: number | null
          classificado_em?: string | null
          created_at?: string
          criado_por?: string | null
          data_fatura?: string | null
          data_recepcao?: string
          estado?: string
          extraido_em?: string | null
          ficheiro_path?: string | null
          fornecedor: string
          id?: string
          lancado_em?: string | null
          nif_fornecedor?: string | null
          numero_fatura?: string | null
          obra_id?: string | null
          observacoes?: string | null
          total_fatura?: number | null
          updated_at?: string
          valor_iva?: number | null
        }
        Update: {
          base_tributavel?: number | null
          classificado_em?: string | null
          created_at?: string
          criado_por?: string | null
          data_fatura?: string | null
          data_recepcao?: string
          estado?: string
          extraido_em?: string | null
          ficheiro_path?: string | null
          fornecedor?: string
          id?: string
          lancado_em?: string | null
          nif_fornecedor?: string | null
          numero_fatura?: string | null
          obra_id?: string | null
          observacoes?: string | null
          total_fatura?: number | null
          updated_at?: string
          valor_iva?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_fornecedor_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
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
          data_compra: string | null
          estado: Database["public"]["Enums"]["estado_ferramenta"]
          foto_path: string | null
          garantia_ate: string | null
          id: string
          marca: string | null
          modelo: string | null
          nome: string
          nova: boolean
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
          data_compra?: string | null
          estado?: Database["public"]["Enums"]["estado_ferramenta"]
          foto_path?: string | null
          garantia_ate?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          nome: string
          nova?: boolean
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
          data_compra?: string | null
          estado?: Database["public"]["Enums"]["estado_ferramenta"]
          foto_path?: string | null
          garantia_ate?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          nome?: string
          nova?: boolean
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
      frota_alerta_destinatarios: {
        Row: {
          criado_em: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          user_id?: string
        }
        Relationships: []
      }
      frota_itens_catalogo: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string
          chave: string
          criado_em: string
          criado_por: string | null
          id: string
          intervalo_km_padrao: number | null
          intervalo_meses_padrao: number | null
          limiar_atencao_dias: number
          limiar_atencao_km: number
          limiar_urgente_dias: number
          limiar_urgente_km: number
          natureza: string
          ordem: number
          rotulo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria: string
          chave: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          intervalo_km_padrao?: number | null
          intervalo_meses_padrao?: number | null
          limiar_atencao_dias?: number
          limiar_atencao_km?: number
          limiar_urgente_dias?: number
          limiar_urgente_km?: number
          natureza: string
          ordem?: number
          rotulo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string
          chave?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          intervalo_km_padrao?: number | null
          intervalo_meses_padrao?: number | null
          limiar_atencao_dias?: number
          limiar_atencao_km?: number
          limiar_urgente_dias?: number
          limiar_urgente_km?: number
          natureza?: string
          ordem?: number
          rotulo?: string
        }
        Relationships: []
      }
      frota_veiculo_itens: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          id: string
          intervalo_km: number | null
          intervalo_meses: number | null
          item_id: string
          proxima_data: string | null
          proxima_km: number | null
          ultima_data: string | null
          ultima_km: number | null
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          item_id: string
          proxima_data?: string | null
          proxima_km?: number | null
          ultima_data?: string | null
          ultima_km?: number | null
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          item_id?: string
          proxima_data?: string | null
          proxima_km?: number | null
          ultima_data?: string | null
          ultima_km?: number | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frota_veiculo_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "frota_itens_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frota_veiculo_itens_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
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
      linhas_fatura: {
        Row: {
          artigo_id: string | null
          confianca: number | null
          created_at: string
          descricao: string
          descricao_norm: string | null
          destino: string
          fatura_id: string
          id: string
          lancado: boolean
          movimento_id: string | null
          preco_unitario: number | null
          quantidade: number | null
          total_linha: number | null
          unidade: string | null
        }
        Insert: {
          artigo_id?: string | null
          confianca?: number | null
          created_at?: string
          descricao: string
          descricao_norm?: string | null
          destino?: string
          fatura_id: string
          id?: string
          lancado?: boolean
          movimento_id?: string | null
          preco_unitario?: number | null
          quantidade?: number | null
          total_linha?: number | null
          unidade?: string | null
        }
        Update: {
          artigo_id?: string | null
          confianca?: number | null
          created_at?: string
          descricao?: string
          descricao_norm?: string | null
          destino?: string
          fatura_id?: string
          id?: string
          lancado?: boolean
          movimento_id?: string | null
          preco_unitario?: number | null
          quantidade?: number | null
          total_linha?: number | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linhas_fatura_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linhas_fatura_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_fornecedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linhas_fatura_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "movimentos_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentos_stock: {
        Row: {
          cliente: string | null
          created_at: string
          created_by: string | null
          destino_obra: string | null
          fornecedor: string | null
          id: string
          numero_fatura: string | null
          obra_id: string | null
          observacoes: string | null
          preco_unitario: number | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          subtipo: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        Insert: {
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          destino_obra?: string | null
          fornecedor?: string | null
          id?: string
          numero_fatura?: string | null
          obra_id?: string | null
          observacoes?: string | null
          preco_unitario?: number | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          subtipo?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        Update: {
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          destino_obra?: string | null
          fornecedor?: string | null
          id?: string
          numero_fatura?: string | null
          obra_id?: string | null
          observacoes?: string | null
          preco_unitario?: number | null
          produto_id?: string
          quantidade?: number
          responsavel?: string
          stock_antes?: number
          stock_depois?: number
          subtipo?: string | null
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
      obra_afericoes: {
        Row: {
          atraso_motivo: string | null
          atrasos_dias: number
          autor_id: string | null
          clima: string | null
          clima_descricao: string | null
          criado_em: string
          data: string
          fotos: Json
          id: string
          obra_id: string
          problemas: string | null
          progresso_pct: number | null
          resumo: string
        }
        Insert: {
          atraso_motivo?: string | null
          atrasos_dias?: number
          autor_id?: string | null
          clima?: string | null
          clima_descricao?: string | null
          criado_em?: string
          data: string
          fotos?: Json
          id?: string
          obra_id: string
          problemas?: string | null
          progresso_pct?: number | null
          resumo: string
        }
        Update: {
          atraso_motivo?: string | null
          atrasos_dias?: number
          autor_id?: string | null
          clima?: string | null
          clima_descricao?: string | null
          criado_em?: string
          data?: string
          fotos?: Json
          id?: string
          obra_id?: string
          problemas?: string | null
          progresso_pct?: number | null
          resumo?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_afericoes_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_autores: {
        Row: {
          adicionado_por: string | null
          criado_em: string
          obra_id: string
          user_id: string
        }
        Insert: {
          adicionado_por?: string | null
          criado_em?: string
          obra_id: string
          user_id: string
        }
        Update: {
          adicionado_por?: string | null
          criado_em?: string
          obra_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_autores_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_equipa: {
        Row: {
          ate: string | null
          colaborador_id: string
          criado_em: string
          criado_por: string | null
          desde: string
          funcao: string | null
          id: string
          obra_id: string
        }
        Insert: {
          ate?: string | null
          colaborador_id: string
          criado_em?: string
          criado_por?: string | null
          desde?: string
          funcao?: string | null
          id?: string
          obra_id: string
        }
        Update: {
          ate?: string | null
          colaborador_id?: string
          criado_em?: string
          criado_por?: string | null
          desde?: string
          funcao?: string | null
          id?: string
          obra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_equipa_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_equipa_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_eventos: {
        Row: {
          autor_id: string | null
          criado_em: string
          detalhe: string | null
          id: string
          obra_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          detalhe?: string | null
          id?: string
          obra_id: string
          tipo: string
          titulo: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          detalhe?: string | null
          id?: string
          obra_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_eventos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_fases: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          estado: string
          id: string
          nome: string
          notas: string | null
          obra_id: string
          ordem: number
          peso: number
          progresso: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          estado?: string
          id?: string
          nome: string
          notas?: string | null
          obra_id: string
          ordem?: number
          peso?: number
          progresso?: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          estado?: string
          id?: string
          nome?: string
          notas?: string | null
          obra_id?: string
          ordem?: number
          peso?: number
          progresso?: number
        }
        Relationships: [
          {
            foreignKeyName: "obra_fases_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_fotos: {
        Row: {
          autor_id: string | null
          criado_em: string
          id: string
          legenda: string | null
          obra_id: string
          path: string
          tirada_em: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          id?: string
          legenda?: string | null
          obra_id: string
          path: string
          tirada_em?: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          id?: string
          legenda?: string | null
          obra_id?: string
          path?: string
          tirada_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_fotos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_orcamento_itens: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: string
          criado_em: string
          descricao: string
          id: string
          obra_id: string
          preco_unitario: number
          quantidade: number
          tolerancia_pct: number
          unidade: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo: string
          criado_em?: string
          descricao: string
          id?: string
          obra_id: string
          preco_unitario?: number
          quantidade?: number
          tolerancia_pct?: number
          unidade: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string
          criado_em?: string
          descricao?: string
          id?: string
          obra_id?: string
          preco_unitario?: number
          quantidade?: number
          tolerancia_pct?: number
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_orcamento_itens_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_relatorios_diarios: {
        Row: {
          atualizado_em: string
          autor_id: string | null
          clima: string | null
          clima_descricao: string | null
          criado_em: string
          data: string
          equipa_ids: string[]
          equipa_outros: string | null
          estado: string
          fotos: Json
          houve_ocorrencias: boolean
          id: string
          obra_id: string
          observacoes: string | null
          ocorrencias: string | null
          reaberto_em: string | null
          reaberto_motivo: string | null
          reaberto_por: string | null
          subempreiteiros_ids: string[]
          submetido_em: string | null
          submetido_por: string | null
          temperatura_c: number | null
          trabalhos: string | null
        }
        Insert: {
          atualizado_em?: string
          autor_id?: string | null
          clima?: string | null
          clima_descricao?: string | null
          criado_em?: string
          data: string
          equipa_ids?: string[]
          equipa_outros?: string | null
          estado?: string
          fotos?: Json
          houve_ocorrencias?: boolean
          id?: string
          obra_id: string
          observacoes?: string | null
          ocorrencias?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por?: string | null
          subempreiteiros_ids?: string[]
          submetido_em?: string | null
          submetido_por?: string | null
          temperatura_c?: number | null
          trabalhos?: string | null
        }
        Update: {
          atualizado_em?: string
          autor_id?: string | null
          clima?: string | null
          clima_descricao?: string | null
          criado_em?: string
          data?: string
          equipa_ids?: string[]
          equipa_outros?: string | null
          estado?: string
          fotos?: Json
          houve_ocorrencias?: boolean
          id?: string
          obra_id?: string
          observacoes?: string | null
          ocorrencias?: string | null
          reaberto_em?: string | null
          reaberto_motivo?: string | null
          reaberto_por?: string | null
          subempreiteiros_ids?: string[]
          submetido_em?: string | null
          submetido_por?: string | null
          temperatura_c?: number | null
          trabalhos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obra_relatorios_diarios_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
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
          data_fim_real: string | null
          data_inicio: string | null
          data_prevista_fim: string | null
          descricao: string | null
          engenheiro_id: string | null
          estado: string
          geofence_centro: unknown
          geofence_poligono: unknown
          geofence_raio_m: number | null
          geofence_tipo: string | null
          id: string
          latitude: number | null
          localizacao: string | null
          longitude: number | null
          morada: string | null
          nome: string
          observacoes: string | null
          orcamento: number | null
          orcamento_combustivel: number | null
          orcamento_fornecedores: number | null
          orcamento_mao_obra: number | null
          orcamento_materiais: number | null
          orcamento_subempreiteiros: number | null
          responsavel_id: string | null
          tipo_obra: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          data_prevista_fim?: string | null
          descricao?: string | null
          engenheiro_id?: string | null
          estado?: string
          geofence_centro?: unknown
          geofence_poligono?: unknown
          geofence_raio_m?: number | null
          geofence_tipo?: string | null
          id?: string
          latitude?: number | null
          localizacao?: string | null
          longitude?: number | null
          morada?: string | null
          nome: string
          observacoes?: string | null
          orcamento?: number | null
          orcamento_combustivel?: number | null
          orcamento_fornecedores?: number | null
          orcamento_mao_obra?: number | null
          orcamento_materiais?: number | null
          orcamento_subempreiteiros?: number | null
          responsavel_id?: string | null
          tipo_obra?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          data_prevista_fim?: string | null
          descricao?: string | null
          engenheiro_id?: string | null
          estado?: string
          geofence_centro?: unknown
          geofence_poligono?: unknown
          geofence_raio_m?: number | null
          geofence_tipo?: string | null
          id?: string
          latitude?: number | null
          localizacao?: string | null
          longitude?: number | null
          morada?: string | null
          nome?: string
          observacoes?: string | null
          orcamento?: number | null
          orcamento_combustivel?: number | null
          orcamento_fornecedores?: number | null
          orcamento_mao_obra?: number | null
          orcamento_materiais?: number | null
          orcamento_subempreiteiros?: number | null
          responsavel_id?: string | null
          tipo_obra?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obras_engenheiro_id_fkey"
            columns: ["engenheiro_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obras_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
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
          foto_path: string | null
          id: string
          localizacao: string | null
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
          foto_path?: string | null
          id?: string
          localizacao?: string | null
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
          foto_path?: string | null
          id?: string
          localizacao?: string | null
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
          foto_path: string | null
          id: string
          nome: string
          role: Database["public"]["Enums"]["role_utilizador"]
          telemovel: string | null
        }
        Insert: {
          created_at?: string
          email: string
          foto_path?: string | null
          id: string
          nome: string
          role?: Database["public"]["Enums"]["role_utilizador"]
          telemovel?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          foto_path?: string | null
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["role_utilizador"]
          telemovel?: string | null
        }
        Relationships: []
      }
      pump_comandos: {
        Row: {
          comando: string
          consumido_em: string | null
          criado_em: string
          criado_por: string | null
          id: string
          pedido_id: string | null
          pump_id: string
        }
        Insert: {
          comando: string
          consumido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          pedido_id?: string | null
          pump_id: string
        }
        Update: {
          comando?: string
          consumido_em?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          pedido_id?: string | null
          pump_id?: string
        }
        Relationships: []
      }
      pump_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          bloqueada: boolean
          horario_fim: string | null
          horario_inicio: string | null
          motivo: string | null
          pump_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          bloqueada?: boolean
          horario_fim?: string | null
          horario_inicio?: string | null
          motivo?: string | null
          pump_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          bloqueada?: boolean
          horario_fim?: string | null
          horario_inicio?: string | null
          motivo?: string | null
          pump_id?: string
        }
        Relationships: []
      }
      pump_heartbeat: {
        Row: {
          last_seen_at: string
          nivel_alarme: boolean | null
          pump_id: string
          relay_on: boolean | null
        }
        Insert: {
          last_seen_at?: string
          nivel_alarme?: boolean | null
          pump_id: string
          relay_on?: boolean | null
        }
        Update: {
          last_seen_at?: string
          nivel_alarme?: boolean | null
          pump_id?: string
          relay_on?: boolean | null
        }
        Relationships: []
      }
      pump_sessoes: {
        Row: {
          abastecimento_id: string | null
          autorizado_por: string | null
          fim_em: string | null
          funcionario_nome: string | null
          id: string
          inicio_em: string
          motivo_fim: string | null
          origem: string
          pedido_id: string | null
          pump_id: string
          segundos_autorizados: number
          veiculo_id: string | null
          veiculo_nome: string | null
        }
        Insert: {
          abastecimento_id?: string | null
          autorizado_por?: string | null
          fim_em?: string | null
          funcionario_nome?: string | null
          id?: string
          inicio_em?: string
          motivo_fim?: string | null
          origem?: string
          pedido_id?: string | null
          pump_id: string
          segundos_autorizados: number
          veiculo_id?: string | null
          veiculo_nome?: string | null
        }
        Update: {
          abastecimento_id?: string | null
          autorizado_por?: string | null
          fim_em?: string | null
          funcionario_nome?: string | null
          id?: string
          inicio_em?: string
          motivo_fim?: string | null
          origem?: string
          pedido_id?: string | null
          pump_id?: string
          segundos_autorizados?: number
          veiculo_id?: string | null
          veiculo_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pump_sessoes_abastecimento_id_fkey"
            columns: ["abastecimento_id"]
            isOneToOne: false
            referencedRelation: "comb_abastecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pump_sessoes_veiculo_id_fkey"
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
      regras_classificacao: {
        Row: {
          artigo_id: string | null
          confianca: number
          created_at: string
          descricao_norm: string
          destino: string
          fornecedor: string
          id: string
          total_usos: number
          updated_at: string
        }
        Insert: {
          artigo_id?: string | null
          confianca?: number
          created_at?: string
          descricao_norm: string
          destino: string
          fornecedor: string
          id?: string
          total_usos?: number
          updated_at?: string
        }
        Update: {
          artigo_id?: string | null
          confianca?: number
          created_at?: string
          descricao_norm?: string
          destino?: string
          fornecedor?: string
          id?: string
          total_usos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_classificacao_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
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
      seguranca_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          id: boolean
          mfa_obrigatorio: boolean
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          mfa_obrigatorio?: boolean
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          mfa_obrigatorio?: boolean
        }
        Relationships: []
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
      sub_documentos: {
        Row: {
          criado_em: string
          criado_por: string | null
          emitido_em: string | null
          id: string
          nome: string | null
          path: string
          referencia: string | null
          subempreiteiro_id: string
          tipo: string
          validade: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          emitido_em?: string | null
          id?: string
          nome?: string | null
          path: string
          referencia?: string | null
          subempreiteiro_id: string
          tipo: string
          validade?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          emitido_em?: string | null
          id?: string
          nome?: string | null
          path?: string
          referencia?: string | null
          subempreiteiro_id?: string
          tipo?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_documentos_subempreiteiro_id_fkey"
            columns: ["subempreiteiro_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiros"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_ocorrencias: {
        Row: {
          autor_id: string | null
          criado_em: string
          data: string
          descricao: string
          dias_atraso: number
          fotos: Json
          gravidade: string
          id: string
          obra_id: string
          resolucao: string | null
          resolvido: boolean
          resolvido_em: string | null
          resolvido_por: string | null
          subempreiteiro_id: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          data: string
          descricao: string
          dias_atraso?: number
          fotos?: Json
          gravidade?: string
          id?: string
          obra_id: string
          resolucao?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          subempreiteiro_id: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          data?: string
          descricao?: string
          dias_atraso?: number
          fotos?: Json
          gravidade?: string
          id?: string
          obra_id?: string
          resolucao?: string | null
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          subempreiteiro_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_ocorrencias_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_ocorrencias_subempreiteiro_id_fkey"
            columns: ["subempreiteiro_id"]
            isOneToOne: false
            referencedRelation: "subempreiteiros"
            referencedColumns: ["id"]
          },
        ]
      }
      subempreiteiro_artigos: {
        Row: {
          created_at: string
          descricao: string
          id: string
          is_extra: boolean
          orcamento_item_id: string | null
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
          orcamento_item_id?: string | null
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
          orcamento_item_id?: string | null
          preco_unitario?: number
          quantidade_prevista?: number
          subempreiteiro_id?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "subempreiteiro_artigos_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "obra_orcamento_itens"
            referencedColumns: ["id"]
          },
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
          ativo: boolean
          condicoes: string | null
          contacto_responsavel: string | null
          contrato_enviado_em: string | null
          contrato_nome: string | null
          contrato_path: string | null
          created_at: string
          created_by: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          email: string | null
          especialidade: string | null
          estado: Database["public"]["Enums"]["estado_subempreitada"]
          id: string
          nif: string | null
          nome: string
          obra_id: string
          percentagem_retencao: number
          telefone: string | null
          tipo: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_global: number | null
        }
        Insert: {
          ativo?: boolean
          condicoes?: string | null
          contacto_responsavel?: string | null
          contrato_enviado_em?: string | null
          contrato_nome?: string | null
          contrato_path?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          email?: string | null
          especialidade?: string | null
          estado?: Database["public"]["Enums"]["estado_subempreitada"]
          id?: string
          nif?: string | null
          nome: string
          obra_id: string
          percentagem_retencao?: number
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_subempreitada"]
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_global?: number | null
        }
        Update: {
          ativo?: boolean
          condicoes?: string | null
          contacto_responsavel?: string | null
          contrato_enviado_em?: string | null
          contrato_nome?: string | null
          contrato_path?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          email?: string | null
          especialidade?: string | null
          estado?: Database["public"]["Enums"]["estado_subempreitada"]
          id?: string
          nif?: string | null
          nome?: string
          obra_id?: string
          percentagem_retencao?: number
          telefone?: string | null
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
      subs_config: {
        Row: {
          alcada_gestor_ate: number
          atualizado_em: string
          atualizado_por: string | null
          aviso_validade_dias: number
          bloquear_pagamento_sem_docs: boolean
          checklist_padrao: Json
          docs_obrigatorios: string[]
          exigir_fatura_para_pagar: boolean
          foto_idade_max_min: number
          id: boolean
          min_fotos_verificacao: number
          prazo_pagamento_dias: number
          precisao_max_m: number
          raio_padrao_m: number
          retencao_padrao_pct: number
        }
        Insert: {
          alcada_gestor_ate?: number
          atualizado_em?: string
          atualizado_por?: string | null
          aviso_validade_dias?: number
          bloquear_pagamento_sem_docs?: boolean
          checklist_padrao?: Json
          docs_obrigatorios?: string[]
          exigir_fatura_para_pagar?: boolean
          foto_idade_max_min?: number
          id?: boolean
          min_fotos_verificacao?: number
          prazo_pagamento_dias?: number
          precisao_max_m?: number
          raio_padrao_m?: number
          retencao_padrao_pct?: number
        }
        Update: {
          alcada_gestor_ate?: number
          atualizado_em?: string
          atualizado_por?: string | null
          aviso_validade_dias?: number
          bloquear_pagamento_sem_docs?: boolean
          checklist_padrao?: Json
          docs_obrigatorios?: string[]
          exigir_fatura_para_pagar?: boolean
          foto_idade_max_min?: number
          id?: boolean
          min_fotos_verificacao?: number
          prazo_pagamento_dias?: number
          precisao_max_m?: number
          raio_padrao_m?: number
          retencao_padrao_pct?: number
        }
        Relationships: []
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
      veiculo_atribuicoes: {
        Row: {
          ate: string | null
          colaborador_id: string
          criado_em: string
          criado_por: string | null
          desde: string
          id: string
          veiculo_id: string
        }
        Insert: {
          ate?: string | null
          colaborador_id: string
          criado_em?: string
          criado_por?: string | null
          desde?: string
          id?: string
          veiculo_id: string
        }
        Update: {
          ate?: string | null
          colaborador_id?: string
          criado_em?: string
          criado_por?: string | null
          desde?: string
          id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_atribuicoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_atribuicoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_checklists: {
        Row: {
          condutor_id: string | null
          criado_em: string
          criado_por: string | null
          data: string
          estado_geral: string
          foto_keys: string[]
          id: string
          itens: Json
          km_na_altura: number | null
          observacoes: string | null
          veiculo_id: string
        }
        Insert: {
          condutor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          estado_geral: string
          foto_keys?: string[]
          id?: string
          itens: Json
          km_na_altura?: number | null
          observacoes?: string | null
          veiculo_id: string
        }
        Update: {
          condutor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          estado_geral?: string
          foto_keys?: string[]
          id?: string
          itens?: Json
          km_na_altura?: number | null
          observacoes?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_checklists_condutor_id_fkey"
            columns: ["condutor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_checklists_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_entregas: {
        Row: {
          adblue: string
          colaborador_id: string
          combustivel: string
          criado_em: string
          criado_por: string | null
          danos: Json
          data: string
          entrega_ref: string | null
          id: string
          inventario: Json
          km: number
          limpeza: string
          obra_id: string | null
          observacoes: string | null
          oleo: string
          para_oficina: boolean
          pneus: string
          refrigeracao: string
          tipo: string
          veiculo_id: string
        }
        Insert: {
          adblue?: string
          colaborador_id: string
          combustivel: string
          criado_em?: string
          criado_por?: string | null
          danos?: Json
          data?: string
          entrega_ref?: string | null
          id?: string
          inventario?: Json
          km: number
          limpeza?: string
          obra_id?: string | null
          observacoes?: string | null
          oleo?: string
          para_oficina?: boolean
          pneus?: string
          refrigeracao?: string
          tipo: string
          veiculo_id: string
        }
        Update: {
          adblue?: string
          colaborador_id?: string
          combustivel?: string
          criado_em?: string
          criado_por?: string | null
          danos?: Json
          data?: string
          entrega_ref?: string | null
          id?: string
          inventario?: Json
          km?: number
          limpeza?: string
          obra_id?: string | null
          observacoes?: string | null
          oleo?: string
          para_oficina?: boolean
          pneus?: string
          refrigeracao?: string
          tipo?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_entregas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_entregas_entrega_ref_fkey"
            columns: ["entrega_ref"]
            isOneToOne: false
            referencedRelation: "veiculo_entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_entregas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_manutencao_edicoes: {
        Row: {
          antes: Json
          depois: Json
          editado_em: string
          editado_por: string | null
          id: string
          manutencao_id: string
        }
        Insert: {
          antes: Json
          depois: Json
          editado_em?: string
          editado_por?: string | null
          id?: string
          manutencao_id: string
        }
        Update: {
          antes?: Json
          depois?: Json
          editado_em?: string
          editado_por?: string | null
          id?: string
          manutencao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_manutencao_edicoes_manutencao_id_fkey"
            columns: ["manutencao_id"]
            isOneToOne: false
            referencedRelation: "veiculo_manutencoes"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_manutencoes: {
        Row: {
          atualiza_proxima: boolean
          condutor_id: string | null
          criado_em: string
          criado_por: string | null
          custo: number | null
          data: string
          descricao: string | null
          editado_em: string | null
          editado_por: string | null
          id: string
          item_id: string | null
          km_na_altura: number | null
          observacoes: string | null
          oficina: string | null
          veiculo_id: string
        }
        Insert: {
          atualiza_proxima?: boolean
          condutor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          custo?: number | null
          data?: string
          descricao?: string | null
          editado_em?: string | null
          editado_por?: string | null
          id?: string
          item_id?: string | null
          km_na_altura?: number | null
          observacoes?: string | null
          oficina?: string | null
          veiculo_id: string
        }
        Update: {
          atualiza_proxima?: boolean
          condutor_id?: string | null
          criado_em?: string
          criado_por?: string | null
          custo?: number | null
          data?: string
          descricao?: string | null
          editado_em?: string | null
          editado_por?: string | null
          id?: string
          item_id?: string | null
          km_na_altura?: number | null
          observacoes?: string | null
          oficina?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_manutencoes_condutor_id_fkey"
            columns: ["condutor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_manutencoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "frota_itens_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "comb_veiculos"
            referencedColumns: ["id"]
          },
        ]
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
      obra_fotos_todas: {
        Row: {
          autor_id: string | null
          data: string | null
          legenda: string | null
          obra_id: string | null
          origem: string | null
          path: string | null
          ref_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _atualizar_ultima_revisao: {
        Args: { p_veiculo_id: string }
        Returns: undefined
      }
      _auto_evento: {
        Args: {
          p_acao: string
          p_auto_id: string
          p_detalhe?: string
          p_tipo: string
        }
        Returns: undefined
      }
      _auto_recalcular_glosado: {
        Args: { p_auto_id: string }
        Returns: undefined
      }
      _auto_workflow: { Args: { p_auto_id: string }; Returns: string }
      _autor_designado: { Args: { p_obra_id: string }; Returns: boolean }
      _avaliar_frota_item: { Args: { p_id: string }; Returns: string }
      _classificar_e_aprender_impl: {
        Args: { p_fatura_id: string; p_linhas: Json }
        Returns: undefined
      }
      _clima_ok: { Args: { p_clima: string }; Returns: boolean }
      _custos_consolidados_por_obra_impl: {
        Args: { p_data_fim?: string; p_data_ini?: string; p_obra_id: string }
        Returns: Json
      }
      _distancia_m: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      _eur: { Args: { p: number }; Returns: string }
      _foto_da_ferramenta: {
        Args: { p_ferramenta: string; p_path: string }
        Returns: boolean
      }
      _foto_do_pedido: {
        Args: { p_path: string; p_pedido: string; p_veiculo: string }
        Returns: boolean
      }
      _fotos_forma_ok: { Args: { p_fotos: Json }; Returns: boolean }
      _hoje_pt: { Args: never; Returns: string }
      _lancar_fatura_impl: {
        Args: { p_fatura_id: string; p_responsavel: string }
        Returns: undefined
      }
      _nome_utilizador: { Args: { p_id: string }; Returns: string }
      _obra_evento: {
        Args: {
          p_detalhe?: string
          p_obra_id: string
          p_tipo: string
          p_titulo: string
        }
        Returns: undefined
      }
      _obra_fotos_validar: {
        Args: { p_fotos: Json; p_obra_id: string }
        Returns: Json
      }
      _obra_resumos: {
        Args: { p_obra_id: string }
        Returns: Database["public"]["CompositeTypes"]["obra_resumo"][]
        SetofOptions: {
          from: "*"
          to: "obra_resumo"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      _quem_pede: { Args: never; Returns: Record<string, unknown> }
      _recalcular_item_manutencao: {
        Args: { p_item_id: string; p_veiculo_id: string }
        Returns: undefined
      }
      _registar_evento: {
        Args: {
          p_detalhe: Json
          p_email?: string
          p_tipo: string
          p_utilizador: string
        }
        Returns: undefined
      }
      _registar_picagem_geofence_impl: {
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
      _sub_docs_bloqueio: { Args: { p_sub_id: string }; Returns: string[] }
      _sub_docs_estado: {
        Args: { p_sub_id: string }
        Returns: {
          dias_restantes: number
          doc_id: string
          estado: string
          obrigatorio: boolean
          referencia: string
          tipo: string
          validade: string
        }[]
      }
      _sub_oc_bloqueantes: { Args: { p_sub_id: string }; Returns: number }
      _subs_cfg: {
        Args: never
        Returns: {
          alcada_gestor_ate: number
          atualizado_em: string
          atualizado_por: string | null
          aviso_validade_dias: number
          bloquear_pagamento_sem_docs: boolean
          checklist_padrao: Json
          docs_obrigatorios: string[]
          exigir_fatura_para_pagar: boolean
          foto_idade_max_min: number
          id: boolean
          min_fotos_verificacao: number
          prazo_pagamento_dias: number
          precisao_max_m: number
          raio_padrao_m: number
          retencao_padrao_pct: number
        }
        SetofOptions: {
          from: "*"
          to: "subs_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _subs_metricas: {
        Args: { p_obra_id: string; p_sub_id: string }
        Returns: {
          artigos_sem_eap: number
          ativo: boolean
          atraso_aberto: number
          atraso_dias_total: number
          autos_n: number
          bruto: number
          data_fim_prevista: string
          data_inicio: string
          desvio_pp: number
          dias_restantes: number
          dias_sem_auto: number
          docs_a_expirar: string[]
          docs_em_falta: string[]
          docs_estado: string
          em_aprovacao_n: number
          em_aprovacao_valor: number
          especialidade: string
          estado: string
          executado: number
          executado_pct: number
          glosado: number
          motivos: string[]
          nome: string
          obra_id: string
          obra_nome: string
          oc_alta: number
          oc_baixa: number
          oc_media: number
          ocorrencias_bloqueantes: number
          ocorrencias_total: number
          orcado_ligado: number
          pago: number
          por_pagar: number
          presencas_relatorios: number
          progresso_fisico_pct: number
          retencao_acumulada: number
          retencao_libertada: number
          saude: string
          sub_id: string
          taxa_glosa_pct: number
          tem_contrato: boolean
          tipo: string
          ultimo_auto: string
          valor_contrato: number
        }[]
      }
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
      abastecimento_push_autorizado: {
        Args: { p_segredo: string }
        Returns: boolean
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
      armazem_materiais_por_obra: {
        Args: { p_obra_id?: string }
        Returns: {
          devolvido: number
          enviado: number
          foto_path: string
          liquido: number
          obra_estado: string
          obra_id: string
          obra_nome: string
          produto_codigo: string
          produto_id: string
          produto_nome: string
          ultimo_movimento: string
          unidade: string
          valor: number
        }[]
      }
      arquivar_subempreiteiro: { Args: { p_id: string }; Returns: undefined }
      atribuir_condutor: {
        Args: {
          p_colaborador_id: string
          p_desde?: string
          p_veiculo_id: string
        }
        Returns: string
      }
      atualizar_meu_perfil: {
        Args: { p_foto_path: string; p_nome: string; p_telemovel: string }
        Returns: undefined
      }
      auth_role: { Args: never; Returns: string }
      auto_apagar_evidencia: { Args: { p_id: string }; Returns: undefined }
      auto_aprovar: {
        Args: { p_auto_id: string; p_excecao_docs_motivo?: string }
        Returns: undefined
      }
      auto_devolver: {
        Args: { p_auto_id: string; p_motivo: string }
        Returns: undefined
      }
      auto_evidencias_lista: {
        Args: { p_auto_id: string }
        Returns: {
          auto_id: string
          autor_id: string | null
          dentro_obra: boolean | null
          distancia_obra_m: number | null
          enviada_em: string
          hash_sha256: string
          id: string
          latitude: number | null
          legenda: string | null
          linha_id: string | null
          longitude: number | null
          motivo_invalida: string | null
          path: string
          precisao_m: number | null
          precisao_ok: boolean | null
          tirada_em: string
          valida: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "auto_evidencias"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      auto_glosar: {
        Args: {
          p_auto_id: string
          p_descricao: string
          p_linha_id?: string
          p_motivo: string
          p_ocorrencia_id?: string
          p_valor: number
        }
        Returns: string
      }
      auto_guardar_evidencias: {
        Args: {
          p_anotacoes?: string
          p_atraso_dias?: number
          p_auto_id: string
          p_clima?: string
          p_clima_descricao?: string
          p_fotos?: Json
          p_problemas?: string
          p_progresso_fisico_pct?: number
        }
        Returns: undefined
      }
      auto_iniciar_verificacao: {
        Args: { p_auto_id: string }
        Returns: undefined
      }
      auto_levantar_glosa: {
        Args: { p_glosa_id: string; p_motivo: string }
        Returns: undefined
      }
      auto_registar_evidencia: {
        Args: {
          p_auto_id: string
          p_hash: string
          p_lat: number
          p_legenda: string
          p_linha_id?: string
          p_lon: number
          p_path: string
          p_precisao_m: number
          p_tirada_em: string
        }
        Returns: Json
      }
      auto_registar_fatura: {
        Args: {
          p_auto_id: string
          p_data: string
          p_nome: string
          p_numero: string
          p_path: string
          p_valor: number
        }
        Returns: undefined
      }
      auto_registar_verificacao: {
        Args: { p_auto_id: string; p_itens: Json }
        Returns: undefined
      }
      auto_submeter: { Args: { p_auto_id: string }; Returns: undefined }
      auto_verificar: {
        Args: { p_auto_id: string; p_excecao_motivo?: string }
        Returns: undefined
      }
      autorizar_abastecimento: { Args: { p_id: string }; Returns: undefined }
      avaliar_frota: { Args: { p_veiculo_id?: string }; Returns: number }
      avaliar_regras_alerta: { Args: never; Returns: number }
      bomba_bloqueio_motivo: { Args: { p_pump_id: string }; Returns: string }
      calcular_resumo_dia: { Args: { p_data: string }; Returns: undefined }
      cancelar_autorizacao_bomba: { Args: { p_id: string }; Returns: undefined }
      cancelar_pedido_abastecimento: {
        Args: { p_id: string }
        Returns: undefined
      }
      check_pend_rate_limit: {
        Args: { p_veiculo_id: string }
        Returns: boolean
      }
      classificar_e_aprender: {
        Args: { p_fatura_id: string; p_linhas: Json }
        Returns: undefined
      }
      colaborador_nif: { Args: { p_id: string }; Returns: string }
      concluir_abastecimento: {
        Args: {
          p_custo_total: number
          p_foto_medidor: string
          p_id: string
          p_litros: number
        }
        Returns: undefined
      }
      concluir_pedido_abastecimento: {
        Args: {
          p_custo: number
          p_foto_path: string
          p_id: string
          p_leitura_final: number
          p_litros: number
          p_origem: string
        }
        Returns: string
      }
      configurar_item_veiculo: {
        Args: {
          p_ativo: boolean
          p_intervalo_km: number
          p_intervalo_meses: number
          p_item_id: string
          p_proxima_data: string
          p_proxima_km: number
          p_veiculo_id: string
        }
        Returns: string
      }
      contabilidade_mapa_assiduidade: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          cargo: string
          colaborador_id: string
          dias_subsidio_alimentacao: number
          dias_trabalhados: number
          faltas_descontaveis_dias: number
          faltas_detalhe: Json
          faltas_injustificadas_dias: number
          faltas_justificadas_dias: number
          horas_extra_descanso_50: number
          horas_extra_total: number
          horas_extra_util_25: number
          horas_extra_util_375: number
          horas_normais: number
          nif: string
          niss: string
          nome: string
          numero_mecan: string
        }[]
      }
      contrato_obra_valido: { Args: { p_nome: string }; Returns: boolean }
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
      criar_pedido_abastecimento: {
        Args: {
          p_foto_km_path: string
          p_id: string
          p_km: number
          p_observacoes?: string
          p_tipo_combustivel: string
          p_tipo_fonte: string
          p_veiculo_id: string
        }
        Returns: string
      }
      custos_consolidados_por_obra: {
        Args: { p_data_fim?: string; p_data_ini?: string; p_obra_id: string }
        Returns: Json
      }
      custos_materiais_por_obra: {
        Args: never
        Returns: {
          combustivel: number
          materiais: number
          obra_id: string
        }[]
      }
      definir_aprovador_combustivel: {
        Args: { p_aprova: boolean; p_user_id: string }
        Returns: undefined
      }
      definir_estado_viatura: {
        Args: { p_estado: string; p_veiculo_id: string }
        Returns: undefined
      }
      definir_mfa_obrigatorio: {
        Args: { p_ativo: boolean }
        Returns: {
          atualizado_em: string
          atualizado_por: string | null
          id: boolean
          mfa_obrigatorio: boolean
        }
        SetofOptions: {
          from: "*"
          to: "seguranca_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      definir_preco_combustivel: {
        Args: { p_preco: number; p_tipo: string }
        Returns: undefined
      }
      definir_regras_bomba: {
        Args: {
          p_bloqueada: boolean
          p_horario_fim: string
          p_horario_inicio: string
          p_motivo: string
        }
        Returns: undefined
      }
      devolver_viatura: {
        Args: {
          p_adblue: string
          p_combustivel: string
          p_danos: Json
          p_data: string
          p_inventario: Json
          p_km: number
          p_limpeza: string
          p_observacoes?: string
          p_oleo: string
          p_para_oficina?: boolean
          p_pneus: string
          p_refrigeracao: string
          p_veiculo_id: string
        }
        Returns: string
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
      editar_manutencao: {
        Args: {
          p_custo: number
          p_data: string
          p_descricao: string
          p_id: string
          p_item_id: string
          p_km: number
          p_observacoes: string
          p_oficina: string
        }
        Returns: undefined
      }
      enablelongtransactions: { Args: never; Returns: string }
      entregar_viatura: {
        Args: {
          p_adblue: string
          p_colaborador_id: string
          p_combustivel: string
          p_danos: Json
          p_data: string
          p_inventario: Json
          p_km: number
          p_limpeza: string
          p_obra_id: string
          p_observacoes?: string
          p_oleo: string
          p_pneus: string
          p_refrigeracao: string
          p_veiculo_id: string
        }
        Returns: string
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      estado_bomba: {
        Args: { p_pump_id?: string }
        Returns: {
          bloqueada: boolean
          bloqueio_motivo: string
          horario_fim: string
          horario_inicio: string
          last_seen_at: string
          motivo: string
          nivel_alarme: boolean
          relay_on: boolean
          segundos_sem_contacto: number
        }[]
      }
      foto_abastecimento_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_armazem_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_combustivel_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_frota_doc_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_frota_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_obra_valida: { Args: { p_nome: string }; Returns: boolean }
      foto_rh_valida: { Args: { p_nome: string }; Returns: boolean }
      frota_arquivar_viatura: {
        Args: { p_arquivar?: boolean; p_veiculo_id: string }
        Returns: undefined
      }
      frota_guardar_viatura: {
        Args: {
          p_data_fim_seguro: string
          p_data_proxima_ipo: string
          p_data_ultima_revisao: string
          p_id: string
          p_identificacao: string
          p_ipo_foto_path: string
          p_km_atual: number
          p_km_ultima_revisao: number
          p_marca: string
          p_modelo: string
          p_observacoes?: string
          p_seguro_foto_path: string
          p_tipo: string
          p_tipo_combustivel: string
          p_unidade_contador: string
        }
        Returns: string
      }
      frota_historico_manutencoes: {
        Args: {
          p_ate?: string
          p_desde?: string
          p_limite?: number
          p_veiculo_id?: string
        }
        Returns: {
          condutor_nome: string
          custo: number
          data: string
          descricao: string
          editado_em: string
          editado_por: string
          id: string
          identificacao: string
          item_id: string
          item_rotulo: string
          km_na_altura: number
          observacoes: string
          oficina: string
          registado_em: string
          registado_por: string
          unidade_contador: string
          veiculo_id: string
          veiculo_nome: string
        }[]
      }
      frota_linha_tempo: {
        Args: { p_limite?: number; p_veiculo_id: string }
        Returns: {
          detalhe: string
          leitura: number
          quando: string
          ref_id: string
          tipo: string
          titulo: string
          utilizador: string
        }[]
      }
      frota_listar_entregas: {
        Args: { p_limite?: number; p_veiculo_id?: string }
        Returns: {
          adblue: string
          colaborador_id: string
          colaborador_nome: string
          combustivel: string
          criado_em: string
          danos: Json
          data: string
          entrega_ref: string
          id: string
          identificacao: string
          inventario: Json
          km: number
          limpeza: string
          obra_id: string
          obra_nome: string
          observacoes: string
          oleo: string
          para_oficina: boolean
          pneus: string
          refrigeracao: string
          registado_por: string
          tipo: string
          veiculo_id: string
          veiculo_nome: string
        }[]
      }
      frota_push_autorizado: { Args: { p_segredo: string }; Returns: boolean }
      frota_resumo_viaturas: {
        Args: never
        Returns: {
          alertas_atencao: number
          alertas_urgentes: number
          codigo: string
          condutor_desde: string
          condutor_id: string
          condutor_nome: string
          data_fim_seguro: string
          data_proxima_ipo: string
          data_ultima_revisao: string
          estado_operacional: string
          id: string
          identificacao: string
          km_atual: number
          marca: string
          modelo: string
          nome: string
          obra_id: string
          obra_nome: string
          tipo: string
          ultimo_checklist_data: string
          ultimo_checklist_estado: string
          unidade_contador: string
        }[]
      }
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
      get_pend_estado_bomba: {
        Args: { p_id: string }
        Returns: {
          bloqueio_motivo: string
          bomba_ocupada: boolean
          desligada_confirmada: boolean
          estado: string
          motivo_fim: string
          pump_activated_at: string
          pump_max_seconds: number
          sessao_ativa: boolean
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      km_atual_veiculo: { Args: { p_veiculo_id: string }; Returns: number }
      lancar_fatura: {
        Args: { p_fatura_id: string; p_responsavel: string }
        Returns: undefined
      }
      ligar_bomba: { Args: { p_id: string }; Returns: undefined }
      longtransactionsenabled: { Args: never; Returns: boolean }
      marcar_auto_em_atraso: { Args: { p_auto_id: string }; Returns: undefined }
      marcar_auto_pago: {
        Args: {
          p_auto_id: string
          p_excecao_motivo?: string
          p_referencia?: string
        }
        Returns: undefined
      }
      meu_contexto_abastecimento: {
        Args: never
        Returns: {
          colaborador_id: string
          km_atual: number
          nome: string
          pedido_aberto_id: string
          pode_aprovar: boolean
          tipo_combustivel: string
          veiculo_id: string
          veiculo_identificacao: string
          veiculo_nome: string
        }[]
      }
      mfa_em_falta: { Args: never; Returns: boolean }
      obra_adicionar_fotos: {
        Args: { p_fotos: Json; p_obra_id: string }
        Returns: number
      }
      obra_alocar_colaborador: {
        Args: {
          p_colaborador_id: string
          p_desde?: string
          p_funcao?: string
          p_obra_id: string
        }
        Returns: string
      }
      obra_apagar_fase: { Args: { p_id: string }; Returns: undefined }
      obra_apagar_foto: { Args: { p_id: string }; Returns: undefined }
      obra_autores_lista: {
        Args: { p_obra_id: string }
        Returns: {
          designado: boolean
          nome: string
          role: string
          user_id: string
        }[]
      }
      obra_definir_autores: {
        Args: { p_obra_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      obra_equipa_lista: {
        Args: { p_obra_id: string }
        Returns: {
          alocacao_id: string
          ate: string
          ativo: boolean
          colaborador_id: string
          desde: string
          funcao: string
          nome: string
          presente_hoje: boolean
          ultima_picagem: string
        }[]
      }
      obra_eventos_lista: {
        Args: { p_limite?: number; p_obra_id: string }
        Returns: {
          autor_nome: string
          criado_em: string
          detalhe: string
          id: string
          tipo: string
          titulo: string
        }[]
      }
      obra_ferramentas: {
        Args: { p_obra_id: string }
        Returns: {
          ativo: boolean
          colaborador_nome: string
          data_devolucao: string
          data_saida: string
          dias_fora: number
          emprestimo_id: string
          ferramenta_id: string
          foto_path: string
          nome: string
          numero_serie: string
        }[]
      }
      obra_frota: {
        Args: { p_obra_id: string }
        Returns: {
          atual: boolean
          condutor_nome: string
          desde: string
          devolvido_em: string
          ehmaquina: boolean
          entregue_em: string
          estado_operacional: string
          identificacao: string
          km_atual: number
          marca: string
          modelo: string
          nome: string
          tipo: string
          veiculo_id: string
        }[]
      }
      obra_guardar: {
        Args: {
          p_cliente?: string
          p_data_inicio?: string
          p_data_prevista_fim?: string
          p_descricao?: string
          p_engenheiro_id?: string
          p_estado?: string
          p_id?: string
          p_latitude?: number
          p_localizacao?: string
          p_longitude?: number
          p_morada?: string
          p_nome?: string
          p_observacoes?: string
          p_orcamento?: number
          p_responsavel_id?: string
          p_tipo_obra?: string
        }
        Returns: string
      }
      obra_guardar_fase: {
        Args: {
          p_data_fim_prevista?: string
          p_data_inicio?: string
          p_id?: string
          p_nome?: string
          p_notas?: string
          p_obra_id?: string
          p_peso?: number
          p_progresso?: number
        }
        Returns: string
      }
      obra_guardar_relatorio: {
        Args: {
          p_clima?: string
          p_clima_descricao?: string
          p_data?: string
          p_equipa_ids?: string[]
          p_equipa_outros?: string
          p_fotos?: Json
          p_houve_ocorrencias?: boolean
          p_id?: string
          p_obra_id?: string
          p_observacoes?: string
          p_ocorrencias?: string
          p_subempreiteiros_ids?: string[]
          p_temperatura_c?: number
          p_trabalhos?: string
        }
        Returns: string
      }
      obra_materiais: {
        Args: { p_obra_id: string }
        Returns: {
          devolvido: number
          enviado: number
          liquido: number
          nome: string
          produto_id: string
          ultimo_movimento: string
          unidade: string
          valor: number
        }[]
      }
      obra_orcamento_apagar_item: { Args: { p_id: string }; Returns: undefined }
      obra_orcamento_guardar_item: {
        Args: {
          p_codigo?: string
          p_descricao?: string
          p_id?: string
          p_obra_id: string
          p_preco_unitario?: number
          p_quantidade?: number
          p_tolerancia_pct?: number
          p_unidade?: string
        }
        Returns: string
      }
      obra_orcamento_resumo: {
        Args: { p_obra_id: string }
        Returns: {
          codigo: string
          contratado_qtd: number
          contratado_valor: number
          descricao: string
          estado: string
          item_id: string
          medido_qtd: number
          medido_valor: number
          n_artigos: number
          orcado_qtd: number
          orcado_valor: number
          perc_contratado: number
          perc_medido: number
          saldo_qtd: number
          saldo_valor: number
          unidade: string
        }[]
      }
      obra_reabrir_relatorio: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      obra_registar_afericao: {
        Args: {
          p_atraso_motivo?: string
          p_atrasos_dias?: number
          p_clima?: string
          p_clima_descricao?: string
          p_data?: string
          p_fotos?: Json
          p_obra_id: string
          p_problemas?: string
          p_progresso_pct?: number
          p_resumo?: string
        }
        Returns: string
      }
      obra_relatorio_detalhe: { Args: { p_id: string }; Returns: Json }
      obra_relatorios_lista: {
        Args: {
          p_ate?: string
          p_desde?: string
          p_estado?: string
          p_limite?: number
          p_obra_id?: string
          p_so_ocorrencias?: boolean
        }
        Returns: {
          autor_id: string
          autor_nome: string
          clima: string
          data: string
          estado: string
          houve_ocorrencias: boolean
          id: string
          n_equipa: number
          n_fotos: number
          obra_id: string
          obra_nome: string
          submetido_em: string
          trabalhos: string
        }[]
      }
      obra_remover_colaborador: {
        Args: { p_alocacao_id: string; p_ate?: string }
        Returns: undefined
      }
      obra_submeter_relatorio: { Args: { p_id: string }; Returns: undefined }
      obra_visao: {
        Args: { p_obra_id: string }
        Returns: Database["public"]["CompositeTypes"]["obra_resumo"]
        SetofOptions: {
          from: "*"
          to: "obra_resumo"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      obras_painel: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["obra_resumo"][]
        SetofOptions: {
          from: "*"
          to: "obra_resumo"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      papel_real: { Args: never; Returns: string }
      parar_bomba: { Args: { p_pedido_id?: string }; Returns: undefined }
      pode_aprovar_combustivel: { Args: never; Returns: boolean }
      pode_escrever: { Args: { modulo: string }; Returns: boolean }
      pode_gerir_obras: { Args: never; Returns: boolean }
      pode_ler_obras: { Args: never; Returns: boolean }
      pode_medir_obras: { Args: never; Returns: boolean }
      pode_relatar_obra: { Args: { p_obra_id: string }; Returns: boolean }
      pode_ver_obra: { Args: { p_obra_id: string }; Returns: boolean }
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
          foto_path: string | null
          id: string
          nome: string
          role: Database["public"]["Enums"]["role_utilizador"]
          telemovel: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pump_poll: {
        Args: { p_nivel: boolean; p_pump_id: string; p_relay_on: boolean }
        Returns: Json
      }
      rate_limit_consumir: {
        Args: { p_chave: string; p_janela_seg: number; p_max: number }
        Returns: boolean
      }
      registar_checklist: {
        Args: {
          p_data: string
          p_foto_keys?: string[]
          p_itens: Json
          p_km: number
          p_observacoes: string
          p_veiculo_id: string
        }
        Returns: string
      }
      registar_contador_inicial: {
        Args: {
          p_foto_path: string
          p_id: string
          p_leitura: number
          p_origem: string
        }
        Returns: undefined
      }
      registar_devolucao_ferramenta: {
        Args: {
          p_assinatura_devolucao?: string
          p_assinatura_responsavel_dev?: string
          p_condicao_devolucao: Database["public"]["Enums"]["condicao_devolucao"]
          p_emprestimo_id: string
          p_foto_devolucao_path?: string
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
          foto_devolucao_path: string | null
          foto_entrega_path: string | null
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
          p_foto_entrega_path?: string
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
          foto_devolucao_path: string | null
          foto_entrega_path: string | null
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
      registar_evento_seguranca: {
        Args: { p_detalhe?: Json; p_tipo: string }
        Returns: undefined
      }
      registar_login_falhado: { Args: { p_email: string }; Returns: undefined }
      registar_manutencao: {
        Args: {
          p_atualiza: boolean
          p_custo: number
          p_data: string
          p_descricao: string
          p_item_id: string
          p_km: number
          p_observacoes: string
          p_oficina: string
          p_proxima_data?: string
          p_veiculo_id: string
        }
        Returns: string
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
          cliente: string | null
          created_at: string
          created_by: string | null
          destino_obra: string | null
          fornecedor: string | null
          id: string
          numero_fatura: string | null
          obra_id: string | null
          observacoes: string | null
          preco_unitario: number | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          subtipo: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento"]
        }
        SetofOptions: {
          from: "*"
          to: "movimentos_stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registar_movimento_armazem: {
        Args: {
          p_cliente?: string
          p_fornecedor?: string
          p_numero_fatura?: string
          p_obra_id?: string
          p_observacoes?: string
          p_preco_unitario?: number
          p_produto_id: string
          p_quantidade: number
          p_responsavel: string
          p_subtipo: string
        }
        Returns: {
          cliente: string | null
          created_at: string
          created_by: string | null
          destino_obra: string | null
          fornecedor: string | null
          id: string
          numero_fatura: string | null
          obra_id: string | null
          observacoes: string | null
          preco_unitario: number | null
          produto_id: string
          quantidade: number
          responsavel: string
          stock_antes: number
          stock_depois: number
          subtipo: string | null
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
        Args: { p_id: string; p_motivo?: string }
        Returns: undefined
      }
      rejeitar_abastecimento_pendente: {
        Args: { p_id: string }
        Returns: undefined
      }
      sessao_aal: { Args: never; Returns: string }
      sessoes_bomba: {
        Args: { p_limite?: number }
        Returns: {
          abastecimento_id: string | null
          autorizado_por: string | null
          fim_em: string | null
          funcionario_nome: string | null
          id: string
          inicio_em: string
          motivo_fim: string | null
          origem: string
          pedido_id: string | null
          pump_id: string
          segundos_autorizados: number
          veiculo_id: string | null
          veiculo_nome: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pump_sessoes"
          isOneToOne: false
          isSetofReturn: true
        }
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
      sub_anexar_contrato: {
        Args: { p_id: string; p_nome: string; p_path: string }
        Returns: undefined
      }
      sub_atualizar_ficha: {
        Args: {
          p_data_fim_prevista?: string
          p_data_inicio?: string
          p_email?: string
          p_especialidade?: string
          p_id: string
          p_nif?: string
          p_telefone?: string
        }
        Returns: undefined
      }
      sub_doc_registar: {
        Args: {
          p_emitido_em?: string
          p_nome?: string
          p_path?: string
          p_referencia?: string
          p_sub_id: string
          p_tipo: string
          p_validade?: string
        }
        Returns: string
      }
      sub_doc_remover: { Args: { p_id: string }; Returns: undefined }
      sub_docs_estado: {
        Args: { p_sub_id: string }
        Returns: {
          dias_restantes: number
          doc_id: string
          estado: string
          obrigatorio: boolean
          referencia: string
          tipo: string
          validade: string
        }[]
      }
      sub_libertar_retencao: {
        Args: {
          p_motivo: string
          p_obs?: string
          p_sub_id: string
          p_valor: number
        }
        Returns: string
      }
      sub_painel: { Args: { p_id: string }; Returns: Json }
      sub_registar_ocorrencia: {
        Args: {
          p_data?: string
          p_descricao?: string
          p_dias_atraso?: number
          p_fotos?: Json
          p_gravidade?: string
          p_subempreiteiro_id: string
          p_tipo: string
        }
        Returns: string
      }
      sub_remover_contrato: { Args: { p_id: string }; Returns: undefined }
      sub_resolver_ocorrencia: {
        Args: { p_id: string; p_resolucao: string }
        Returns: undefined
      }
      subs_config_guardar: { Args: { p_cfg: Json }; Returns: undefined }
      subs_config_ler: {
        Args: never
        Returns: {
          alcada_gestor_ate: number
          atualizado_em: string
          atualizado_por: string | null
          aviso_validade_dias: number
          bloquear_pagamento_sem_docs: boolean
          checklist_padrao: Json
          docs_obrigatorios: string[]
          exigir_fatura_para_pagar: boolean
          foto_idade_max_min: number
          id: boolean
          min_fotos_verificacao: number
          prazo_pagamento_dias: number
          precisao_max_m: number
          raio_padrao_m: number
          retencao_padrao_pct: number
        }
        SetofOptions: {
          from: "*"
          to: "subs_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      subs_fluxo_caixa: {
        Args: { p_obra_id?: string; p_semanas?: number }
        Returns: {
          aprovado: number
          em_aprovacao: number
          n_autos: number
          semana_inicio: string
        }[]
      }
      subs_painel_ceo: { Args: { p_obra_id?: string }; Returns: Json }
      subs_resumo: {
        Args: { p_obra_id?: string }
        Returns: {
          atraso_dias_total: number
          data_fim_prevista: string
          especialidade: string
          estado: string
          executado: number
          executado_pct: number
          motivos: string[]
          nome: string
          obra_id: string
          obra_nome: string
          ocorrencias_abertas: number
          saude: string
          sub_id: string
          tem_contrato: boolean
          tipo: string
          valor_contrato: number
        }[]
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
      utilizadores_com_mfa: { Args: never; Returns: string[] }
      validar_auto: {
        Args: { p_id: string }
        Returns: {
          anotacoes: string | null
          atraso_dias: number
          clima: string | null
          clima_descricao: string | null
          created_at: string
          created_by: string | null
          data_medicao: string
          data_pagamento: string | null
          data_vencimento: string | null
          estado: Database["public"]["Enums"]["estado_auto"]
          estado_pagamento: string
          excecao_motivo: string | null
          fatura_data: string | null
          fatura_nome: string | null
          fatura_numero: string | null
          fatura_path: string | null
          fatura_registada_em: string | null
          fatura_valor: number | null
          fotos: Json
          id: string
          numero: number
          observacoes: string | null
          percentagem_periodo: number | null
          problemas: string | null
          progresso_fisico_pct: number | null
          referencia_pagamento: string | null
          subempreiteiro_id: string
          submetido_em: string | null
          submetido_por: string | null
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_glosado: number
          valor_periodo: number
          verificado_em: string | null
          verificado_por: string | null
          workflow: string
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
          ativo: boolean
          condicoes: string | null
          contacto_responsavel: string | null
          contrato_enviado_em: string | null
          contrato_nome: string | null
          contrato_path: string | null
          created_at: string
          created_by: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          email: string | null
          especialidade: string | null
          estado: Database["public"]["Enums"]["estado_subempreitada"]
          id: string
          nif: string | null
          nome: string
          obra_id: string
          percentagem_retencao: number
          telefone: string | null
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
      role_utilizador:
        | "admin"
        | "gestor"
        | "armazem"
        | "medicoes"
        | "leitura"
        | "mecanico"
        | "motorista"
      tipo_movimento: "entrada" | "saida" | "ajuste"
      tipo_subempreitada: "global" | "unitario"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      obra_resumo: {
        obra_id: string | null
        nome: string | null
        cliente: string | null
        localizacao: string | null
        morada: string | null
        latitude: number | null
        longitude: number | null
        estado: string | null
        data_inicio: string | null
        data_prevista_fim: string | null
        data_fim_real: string | null
        progresso_pct: number | null
        progresso_fonte: string | null
        progresso_esperado_pct: number | null
        saude: string | null
        motivos: string[] | null
        orcamento: number | null
        custo_total: number | null
        equipa_n: number | null
        viaturas_n: number | null
        ferramentas_n: number | null
        subs_n: number | null
        materiais_valor: number | null
        ocorrencias_abertas: number | null
        relatorios_n: number | null
        fotos_n: number | null
        afericoes_n: number | null
        ultimo_relatorio: string | null
        dias_sem_relatorio: number | null
        responsavel_id: string | null
        responsavel_nome: string | null
        engenheiro_id: string | null
        engenheiro_nome: string | null
        tipo_obra: string | null
        descricao: string | null
        observacoes: string | null
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
      role_utilizador: [
        "admin",
        "gestor",
        "armazem",
        "medicoes",
        "leitura",
        "mecanico",
        "motorista",
      ],
      tipo_movimento: ["entrada", "saida", "ajuste"],
      tipo_subempreitada: ["global", "unitario"],
    },
  },
} as const
