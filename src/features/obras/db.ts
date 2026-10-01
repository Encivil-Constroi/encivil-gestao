import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Esquema da migration 20261003000000_obras_completo (desenho em
// docs/superpowers/specs/2026-10-03-obras-completo-design.md, §3). Os tipos
// gerados só voltam a ser regenerados com o CLI; até lá o esquema fica
// declarado aqui, no formato dos tipos gerados — sem `as any`.
// Quando os tipos forem regenerados, apagar este ficheiro e usar `supabase`.

export type EstadoObra = 'planeada' | 'ativa' | 'suspensa' | 'concluida'
export type Saude = 'ok' | 'atencao' | 'critico'
export type ProgressoFonte = 'fases' | 'afericao' | 'subempreitadas' | 'nenhuma'
export type ClimaObra =
  | 'SOL' | 'NUBLADO' | 'CHUVA_FRACA' | 'CHUVA_FORTE' | 'VENTO'
  | 'NEVOEIRO' | 'CALOR_EXTREMO' | 'FRIO' | 'TEMPESTADE'
export type OrigemFoto = 'GALERIA' | 'RELATORIO' | 'AFERICAO' | 'SUBEMPREITADA' | 'AUTO'
export type PastaFotoObra = 'galeria' | 'relatorios' | 'afericoes' | 'subempreitadas' | 'autos'
export type TipoOcorrencia = 'ATRASO' | 'PROBLEMA' | 'CLIMA' | 'QUALIDADE' | 'SEGURANCA' | 'NOTA'
export type Gravidade = 'baixa' | 'media' | 'alta'

// Foto guardada em jsonb: caminho no bucket `obras`
export type FotoObra = { path: string; legenda: string | null }

export type ObraRow = {
  id: string
  nome: string
  cliente: string | null
  localizacao: string | null
  estado: EstadoObra
  orcamento: number | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  data_inicio: string | null
  data_prevista_fim: string | null
  data_fim_real: string | null
  morada: string | null
  latitude: number | null
  longitude: number | null
  responsavel_id: string | null
  engenheiro_id: string | null
  tipo_obra: string | null
  descricao: string | null
}

// Devolvido por obras_painel() e obra_visao()
export type ObraResumoRow = {
  obra_id: string
  nome: string
  cliente: string | null
  localizacao: string | null
  morada: string | null
  latitude: number | null
  longitude: number | null
  estado: EstadoObra
  data_inicio: string | null
  data_prevista_fim: string | null
  data_fim_real: string | null
  progresso_pct: number | null
  progresso_fonte: ProgressoFonte
  progresso_esperado_pct: number | null
  saude: Saude
  motivos: string[]
  orcamento: number | null
  custo_total: number
  equipa_n: number
  viaturas_n: number
  ferramentas_n: number
  subs_n: number
  materiais_valor: number
  ocorrencias_abertas: number
  relatorios_n: number
  fotos_n: number
  afericoes_n: number
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

export type EquipaRow = {
  alocacao_id: string
  colaborador_id: string
  nome: string
  funcao: string | null
  desde: string
  ate: string | null
  ativo: boolean
  ultima_picagem: string | null
  presente_hoje: boolean
}

export type FaseRow = {
  id: string
  obra_id: string
  nome: string
  peso: number
  progresso: number
  data_inicio: string | null
  data_fim_prevista: string | null
  estado: 'pendente' | 'em_curso' | 'concluida'
  ordem: number
  notas: string | null
  atualizado_por: string | null
  atualizado_em: string
}

export type AfericaoRow = {
  id: string
  obra_id: string
  data: string
  progresso_pct: number | null
  resumo: string
  problemas: string | null
  atrasos_dias: number
  atraso_motivo: string | null
  clima: ClimaObra | null
  clima_descricao: string | null
  fotos: FotoObra[]
  autor_id: string | null
  criado_em: string
}

export type RelatorioRow = {
  id: string
  obra_id: string
  data: string
  estado: 'rascunho' | 'submetido'
  clima: ClimaObra | null
  temperatura_c: number | null
  clima_descricao: string | null
  equipa_ids: string[]
  equipa_outros: string | null
  subempreiteiros_ids: string[]
  trabalhos: string | null
  houve_ocorrencias: boolean
  ocorrencias: string | null
  observacoes: string | null
  fotos: FotoObra[]
  autor_id: string
  criado_em: string
  atualizado_em: string
  submetido_em: string | null
  submetido_por: string | null
  reaberto_em: string | null
  reaberto_por: string | null
  reaberto_motivo: string | null
}

export type RelatorioListaRow = {
  id: string
  obra_id: string
  obra_nome: string
  data: string
  estado: 'rascunho' | 'submetido'
  clima: ClimaObra | null
  houve_ocorrencias: boolean
  trabalhos: string | null
  n_fotos: number
  n_equipa: number
  autor_id: string
  autor_nome: string | null
  submetido_em: string | null
}

export type ObraFotoRow = {
  id: string
  obra_id: string
  path: string
  legenda: string | null
  tirada_em: string
  autor_id: string | null
  criado_em: string
}

export type FotoTodasRow = {
  obra_id: string
  path: string
  legenda: string | null
  data: string
  origem: OrigemFoto
  ref_id: string
  autor_id: string | null
}

export type SubOcorrenciaRow = {
  id: string
  subempreiteiro_id: string
  obra_id: string
  tipo: TipoOcorrencia
  gravidade: Gravidade
  data: string
  descricao: string
  dias_atraso: number
  fotos: FotoObra[]
  resolvido: boolean
  resolvido_em: string | null
  resolvido_por: string | null
  resolucao: string | null
  autor_id: string | null
  criado_em: string
}

export type SubResumoRow = {
  sub_id: string
  obra_id: string
  obra_nome: string
  nome: string
  especialidade: string | null
  tipo: string
  estado: string
  valor_contrato: number
  executado: number
  executado_pct: number
  atraso_dias_total: number
  ocorrencias_abertas: number
  tem_contrato: boolean
  data_fim_prevista: string | null
  saude: Saude
  motivos: string[]
}

export type SubPainel = {
  valor_contrato: number
  executado: number
  executado_pct: number
  pago: number
  por_pagar: number
  retencao_acumulada: number
  autos_n: number
  ultimo_auto: string | null
  dias_sem_auto: number | null
  atraso_dias_total: number
  ocorrencias_abertas: { baixa: number; media: number; alta: number }
  ocorrencias_total: number
  presencas_relatorios: number
  prazo: { inicio: string | null; fim_previsto: string | null; dias_restantes: number | null }
  saude: Saude
  motivos: string[]
}

export type EventoRow = {
  id: string
  tipo: string
  titulo: string
  detalhe: string | null
  autor_nome: string | null
  criado_em: string
}

export type ObraFrotaRow = {
  veiculo_id: string
  nome: string
  identificacao: string | null
  tipo: string
  marca: string | null
  modelo: string | null
  estado_operacional: string
  condutor_nome: string | null
  desde: string | null
  km_atual: number | null
  ehmaquina: boolean
  atual: boolean
  entregue_em: string | null
  devolvido_em: string | null
}

export type ObraFerramentaRow = {
  emprestimo_id: string
  ferramenta_id: string
  nome: string
  numero_serie: string | null
  foto_path: string | null
  colaborador_nome: string | null
  data_saida: string
  data_devolucao: string | null
  ativo: boolean
  dias_fora: number
}

export type ObraMaterialRow = {
  produto_id: string
  nome: string
  unidade: string
  enviado: number
  devolvido: number
  liquido: number
  valor: number
  ultimo_movimento: string | null
}

export type ObraEquipaTabela = {
  id: string; obra_id: string; colaborador_id: string; funcao: string | null
  desde: string; ate: string | null; criado_por: string | null; criado_em: string
}
export type ObraAutorRow = { obra_id: string; user_id: string; adicionado_por: string | null; criado_em: string }

type Tabela<Row, Insert = never, Update = never> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type ObraGuardarArgs = {
  p_id: string | null
  p_nome: string
  p_cliente: string | null
  p_morada: string | null
  p_localizacao: string | null
  p_latitude: number | null
  p_longitude: number | null
  p_estado: EstadoObra
  p_data_inicio: string | null
  p_data_prevista_fim: string | null
  p_orcamento: number | null
  p_responsavel_id: string | null
  p_engenheiro_id: string | null
  p_tipo_obra: string | null
  p_descricao: string | null
  p_observacoes: string | null
}

export type SubFichaObraRow = {
  id: string
  obra_id: string
  ativo: boolean
  created_at: string
  nif: string | null
  telefone: string | null
  email: string | null
  especialidade: string | null
  data_inicio: string | null
  data_fim_prevista: string | null
  contrato_path: string | null
  contrato_nome: string | null
}

export type AutoEvidenciasObraRow = {
  id: string
  fotos: FotoObra[]
  anotacoes: string | null
  problemas: string | null
  atraso_dias: number
  clima: ClimaObra | null
  clima_descricao: string | null
  progresso_fisico_pct: number | null
}

export type ObrasDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      obras:                    Tabela<ObraRow>
      obra_equipa:              Tabela<ObraEquipaTabela>
      obra_fases:               Tabela<FaseRow>
      obra_afericoes:           Tabela<AfericaoRow>
      obra_autores:             Tabela<ObraAutorRow>
      obra_relatorios_diarios:  Tabela<RelatorioRow>
      obra_fotos:               Tabela<ObraFotoRow>
      obra_eventos:             Tabela<EventoRow & { obra_id: string; autor_id: string | null }>
      sub_ocorrencias:          Tabela<SubOcorrenciaRow>
      subempreiteiros:          Tabela<SubFichaObraRow>
      autos_medicao:            Tabela<AutoEvidenciasObraRow>
    }
    Views: {
      obra_fotos_todas: { Row: FotoTodasRow; Relationships: [] }
    }
    Functions: {
      obras_painel: { Args: Record<string, never>; Returns: ObraResumoRow[] }
      obra_visao: { Args: { p_obra_id: string }; Returns: ObraResumoRow[] }
      obra_guardar: { Args: ObraGuardarArgs; Returns: string }
      obra_alocar_colaborador: {
        Args: { p_obra_id: string; p_colaborador_id: string; p_funcao: string | null; p_desde: string }
        Returns: string
      }
      obra_remover_colaborador: { Args: { p_alocacao_id: string; p_ate: string }; Returns: undefined }
      obra_equipa_lista: { Args: { p_obra_id: string }; Returns: EquipaRow[] }
      obra_guardar_fase: {
        Args: {
          p_id: string | null; p_obra_id: string; p_nome: string; p_peso: number; p_progresso: number
          p_data_inicio: string | null; p_data_fim_prevista: string | null; p_notas: string | null
        }
        Returns: string
      }
      obra_apagar_fase: { Args: { p_id: string }; Returns: undefined }
      obra_registar_afericao: {
        Args: {
          p_obra_id: string; p_data: string; p_progresso_pct: number | null; p_resumo: string
          p_problemas: string | null; p_atrasos_dias: number; p_atraso_motivo: string | null
          p_clima: ClimaObra | null; p_clima_descricao: string | null; p_fotos: FotoObra[]
        }
        Returns: string
      }
      obra_definir_autores: { Args: { p_obra_id: string; p_user_ids: string[] }; Returns: undefined }
      obra_autores_lista: { Args: { p_obra_id: string }; Returns: { user_id: string; nome: string; role: string; designado: boolean }[] }
      obra_guardar_relatorio: {
        Args: {
          p_id: string | null; p_obra_id: string; p_data: string; p_clima: ClimaObra | null
          p_temperatura_c: number | null; p_clima_descricao: string | null; p_equipa_ids: string[]
          p_equipa_outros: string | null; p_subempreiteiros_ids: string[]; p_trabalhos: string | null
          p_houve_ocorrencias: boolean; p_ocorrencias: string | null; p_observacoes: string | null
          p_fotos: FotoObra[]
        }
        Returns: string
      }
      obra_submeter_relatorio: { Args: { p_id: string }; Returns: undefined }
      obra_reabrir_relatorio: { Args: { p_id: string; p_motivo: string }; Returns: undefined }
      obra_relatorios_lista: {
        Args: {
          p_obra_id: string | null; p_desde: string | null; p_ate: string | null
          p_estado: string | null; p_so_ocorrencias: boolean; p_limite: number
        }
        Returns: RelatorioListaRow[]
      }
      obra_relatorio_detalhe: { Args: { p_id: string }; Returns: unknown }
      obra_adicionar_fotos: { Args: { p_obra_id: string; p_fotos: FotoObra[] }; Returns: number }
      obra_apagar_foto: { Args: { p_id: string }; Returns: undefined }
      sub_atualizar_ficha: {
        Args: {
          p_id: string; p_nif: string | null; p_telefone: string | null; p_email: string | null
          p_especialidade: string | null; p_data_inicio: string | null; p_data_fim_prevista: string | null
        }
        Returns: undefined
      }
      sub_anexar_contrato: { Args: { p_id: string; p_path: string; p_nome: string }; Returns: undefined }
      sub_remover_contrato: { Args: { p_id: string }; Returns: undefined }
      sub_registar_ocorrencia: {
        Args: {
          p_subempreiteiro_id: string; p_tipo: TipoOcorrencia; p_gravidade: Gravidade; p_data: string
          p_descricao: string; p_dias_atraso: number; p_fotos: FotoObra[]
        }
        Returns: string
      }
      sub_resolver_ocorrencia: { Args: { p_id: string; p_resolucao: string }; Returns: undefined }
      auto_guardar_evidencias: {
        Args: {
          p_auto_id: string; p_fotos: FotoObra[]; p_anotacoes: string | null; p_problemas: string | null
          p_atraso_dias: number; p_clima: ClimaObra | null; p_clima_descricao: string | null
          p_progresso_fisico_pct: number | null
        }
        Returns: undefined
      }
      sub_painel: { Args: { p_id: string }; Returns: SubPainel }
      subs_resumo: { Args: { p_obra_id: string | null }; Returns: SubResumoRow[] }
      obra_eventos_lista: { Args: { p_obra_id: string; p_limite?: number }; Returns: EventoRow[] }
      obra_frota: { Args: { p_obra_id: string }; Returns: ObraFrotaRow[] }
      obra_ferramentas: { Args: { p_obra_id: string }; Returns: ObraFerramentaRow[] }
      obra_materiais: { Args: { p_obra_id: string }; Returns: ObraMaterialRow[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export const obrasDb = supabase as unknown as SupabaseClient<ObrasDatabase>
