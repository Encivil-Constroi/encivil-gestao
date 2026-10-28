// Operações dos testes de carga: as mesmas consultas que os services da app fazem (replicadas porque o
// Node não importa os .ts sem build). Cada operação cita o service de origem.
// Uma operação devolve { pedidos: [{ error, status }] } — um "ecrã" pode fazer vários pedidos em paralelo,
// como a app (Promise.all); a latência medida é a do ecrã inteiro.
import { randomUUID } from 'node:crypto'

const SELECT_ARTIGO = 'id, nome, codigo, unidade, stock_atual, stock_minimo, custo_unitario, foto_path'
const SELECT_MOV = 'id, produto_id, tipo, subtipo, quantidade, stock_antes, stock_depois, responsavel, destino_obra, obra_id, ' +
  'fornecedor, cliente, numero_fatura, preco_unitario, observacoes, created_at, ' +
  'produtos(nome, codigo, unidade, foto_path), obras(nome)'
const SELECT_COLABORADOR =
  'id, nome, numero_mecan, cargo, obra_id, user_id, ativo, notas, telemovel, email, foto_path, setor, created_at, obras!colaboradores_obra_id_fkey(id, nome)'
const SELECT_PICAGEM = '*, colaboradores(nome), obras(nome)'
const SELECT_PEDIDO = 'id, veiculo_id, veiculo_nome, funcionario_nome, data, tipo_fonte, tipo_combustivel, estado, contador, km_anterior, km_suspeito, foto_km_path, observacoes, local, solicitante_id, colaborador_id, criado_em, autorizado_em, decisao_em, motivo_recusa, contador_inicial, contador_inicial_origem, foto_contador_inicial_path, bomba_ligada_em, pump_auth_expires_at, pump_activated_at, pump_max_seconds, contador_final, contador_final_origem, foto_final_path, litros, custo_total, preco_litro, concluido_em, cancelado_em, abastecimento_id, foto_url, foto_medidor_url, litros_gemini, custo_gemini'
const FASE_SELECT = 'id,obra_id,nome,peso,progresso,data_inicio,data_fim_prevista,estado,ordem,notas,atualizado_por,atualizado_em'
const AFERICAO_SELECT = 'id,obra_id,data,progresso_pct,resumo,problemas,atrasos_dias,atraso_motivo,clima,clima_descricao,fotos,autor_id,criado_em'

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
const hojeLisboa = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
const umAnoAtras = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10) }
const todos = (...rs) => ({ pedidos: rs.map((r) => ({ error: r.error, status: r.status, n: Array.isArray(r.data) ? r.data.length : undefined })) })

// Movimento com client_id gerado no dispositivo: numa falha de rede a app reenvia com o mesmo id
// (fila offline, offlineQueue.ts) e o servidor devolve o movimento já gravado em vez de o repetir.
async function movimentoIdempotente(c, args, ctx) {
  const comId = { ...args, p_client_id: randomUUID() }
  for (let t = 0; ; t++) {
    const r = await c.rpc('registar_movimento_armazem', comId)
    if (!ctx.ehRede(r.error) || t >= 3) return r
    ctx.reenvio()
    await new Promise((res) => setTimeout(res, 300 * (t + 1)))
  }
}

export const OPERACOES = {
  // ── Leitura ────────────────────────────────────────────────────────────────
  // src/features/dashboard/hooks/useDashboard.ts (fetchDashboard: 5 pedidos em paralelo)
  dashboard: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'armazem', 'medicoes', 'leitura'],
    async fn({ c }) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      return todos(...await Promise.all([
        c.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
        c.from('movimentos_stock').select('*', { count: 'exact', head: true }).eq('tipo', 'entrada').gte('created_at', hoje.toISOString()),
        c.from('movimentos_stock').select('*', { count: 'exact', head: true }).eq('tipo', 'saida').gte('created_at', hoje.toISOString()),
        c.rpc('produtos_em_alerta'),
        c.from('movimentos_stock').select('*, produtos(nome, unidade)').order('created_at', { ascending: false }).limit(5),
      ]))
    },
  },
  // src/features/movimentos/services/armazemService.ts listarArtigosArmazem (sem paginação: todos os ativos)
  artigos: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'armazem', 'leitura'],
    async fn({ c }) { return todos(await c.from('produtos').select(SELECT_ARTIGO).eq('ativo', true).order('nome')) },
  },
  // armazemService.ts listarMovimentosArmazem({ desde: 30 dias }, página 0, 50) com count exact
  movimentos30d: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'armazem', 'medicoes', 'leitura'],
    async fn({ c }) {
      return todos(await c.from('movimentos_stock').select(SELECT_MOV, { count: 'exact' })
        .order('created_at', { ascending: false }).gte('created_at', diasAtras(30)).range(0, 49))
    },
  },
  // src/features/obras/services/obrasService.ts buscarVisao + fichaObraService.ts listarFases/listarAfericoes/
  // listarEventos/listarUltimosRelatorios (o ecrã ObraFichaPage carrega-os juntos)
  fichaObra: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'armazem', 'medicoes', 'leitura'],
    async fn({ c, fx }) {
      const obra = pick(fx.obras)
      return todos(...await Promise.all([
        c.rpc('obra_visao', { p_obra_id: obra }),
        c.from('obra_fases').select(FASE_SELECT).eq('obra_id', obra).order('ordem'),
        c.from('obra_afericoes').select(AFERICAO_SELECT).eq('obra_id', obra).order('data', { ascending: false }).order('criado_em', { ascending: false }),
        c.rpc('obra_eventos_lista', { p_obra_id: obra, p_limite: 50 }),
        c.rpc('obra_relatorios_lista', { p_obra_id: obra, p_desde: null, p_ate: null, p_estado: 'submetido', p_so_ocorrencias: false, p_limite: 3 }),
      ]))
    },
  },
  // src/features/colaboradores/services/colaboradoresService.ts listarColaboradores(true) — sem NIF
  colaboradores: {
    classe: 'leitura', papeis: ['admin', 'gestor'],
    async fn({ c }) { return todos(await c.from('colaboradores').select(SELECT_COLABORADOR).eq('ativo', true).order('nome')) },
  },
  // src/features/notificacoes/services/notificacoesService.ts (rpc produtos_em_alerta)
  produtosEmAlerta: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'armazem', 'leitura'],
    async fn({ c }) { return todos(await c.rpc('produtos_em_alerta')) },
  },
  // src/features/custos/services/custosService.ts custosMateriaisCombustivelPorObra
  custosMateriais: {
    classe: 'leitura', papeis: ['admin', 'gestor', 'medicoes'],
    async fn({ c }) { return todos(await c.rpc('custos_materiais_por_obra')) },
  },
  // src/features/combustivel/services/pedidosService.ts fetchContexto + listarPedidos({ solicitanteId })
  meusPedidos: {
    classe: 'leitura', papeis: ['motorista'],
    async fn({ c, vu }) {
      return todos(...await Promise.all([
        c.rpc('meu_contexto_abastecimento'),
        c.from('comb_abastecimentos_pendentes').select(SELECT_PEDIDO).order('criado_em', { ascending: false }).limit(200).eq('solicitante_id', vu.userId),
      ]))
    },
  },
  // src/features/frota/services/frotaService.ts listarResumoViaturas
  frotaResumo: {
    classe: 'leitura', papeis: ['mecanico'],
    async fn({ c }) { return todos(await c.rpc('frota_resumo_viaturas')) },
  },

  // ── Escrita ────────────────────────────────────────────────────────────────
  // src/features/movimentos/services/armazemService.ts registarMovimentoArmazem (subtipo OBRA = saída para obra)
  saidaStock: {
    classe: 'escrita', papeis: ['admin', 'gestor', 'armazem'],
    async fn({ c, fx, vu, ctx }) {
      return todos(await movimentoIdempotente(c, {
        p_produto_id: pick(fx.produtos), p_subtipo: 'OBRA', p_quantidade: rnd(1, 3), p_responsavel: `carga-vu${vu.n}`,
        p_obra_id: pick(fx.obras),
      }, ctx))
    },
  },
  // idem, subtipo COMPRA (entrada)
  entradaStock: {
    classe: 'escrita', papeis: ['admin', 'gestor', 'armazem'],
    async fn({ c, fx, vu, ctx }) {
      return todos(await movimentoIdempotente(c, {
        p_produto_id: pick(fx.produtos), p_subtipo: 'COMPRA', p_quantidade: rnd(1, 5), p_responsavel: `carga-vu${vu.n}`,
        p_fornecedor: 'Fornecedor Carga',
      }, ctx))
    },
  },
  // src/features/picagens/services/picagensService.ts registarPicagem (caminho sem geofence; o colaborador
  // ligado ao próprio utilizador, ou o gestor por qualquer colaborador — policy picagens_insert)
  picagem: {
    classe: 'escrita', papeis: ['gestor', 'leitura'],
    async fn({ c, fx, vu }) {
      const colab = vu.colaborador ?? pick(fx.colaboradores)
      return todos(await c.from('picagens').insert({
        colaborador_id: colab.id, obra_id: colab.obra_id ?? pick(fx.obras),
        tipo: (vu.picagens = (vu.picagens ?? 0) + 1) % 2 ? 'ENTRADA' : 'SAIDA',
        timestamp_dispositivo: new Date().toISOString(), origem: 'ONLINE',
      }).select(SELECT_PICAGEM).single())
    },
    disponivel: (vu) => vu.papel === 'gestor' || !!vu.colaborador,
  },
  // src/features/combustivel/services/pedidosService.ts criarPedido + cancelarPedido (o motorista desiste:
  // só um pedido em curso por motorista/viatura, por isso o ciclo de carga cria e cancela)
  pedidoAbastecimento: {
    classe: 'escrita', papeis: ['motorista'],
    async fn({ c, vu }) {
      const p = vu.pedidos.pop()
      if (!p) return { pedidos: [], semFixture: true }
      const r1 = await c.rpc('criar_pedido_abastecimento', {
        p_id: p.id, p_veiculo_id: vu.viatura, p_tipo_fonte: 'POSTO_RUA', p_tipo_combustivel: 'gasoleo',
        p_km: 10_000 + (vu.km = (vu.km ?? 0) + 50), p_foto_km_path: p.foto, p_observacoes: null,
      })
      if (r1.error) return todos(r1)
      return todos(r1, await c.rpc('cancelar_pedido_abastecimento', { p_id: p.id }))
    },
    disponivel: (vu) => !!vu.viatura,
  },
  // src/features/obras/services/relatoriosDiariosService.ts guardarRelatorioDiario (novo rascunho)
  relatorioDiario: {
    classe: 'escrita', papeis: ['admin', 'gestor', 'medicoes'],
    async fn({ c, fx, vu }) {
      return todos(await c.rpc('obra_guardar_relatorio', {
        p_id: null, p_obra_id: pick(fx.obras), p_data: hojeLisboa(), p_clima: 'SOL', p_temperatura_c: 18,
        p_clima_descricao: null, p_equipa_ids: [pick(fx.colaboradores).id], p_equipa_outros: null,
        p_subempreiteiros_ids: [], p_trabalhos: `Betonagem de lajes (carga-vu${vu.n})`, p_houve_ocorrencias: false,
        p_ocorrencias: null, p_observacoes: null, p_fotos: [],
      }))
    },
  },

  // ── Fecho de mês ───────────────────────────────────────────────────────────
  // src/app/pages/ReportsPage.tsx relatório de stock "ano": movimentosService.listarMovimentos ×2 + produtosService.listarProdutos(false)
  relatorioStockAno: {
    classe: 'fecho', papeis: ['admin', 'gestor', 'armazem', 'medicoes', 'leitura'],
    async fn({ c }) {
      const desde = umAnoAtras()
      const antes = new Date(desde); antes.setFullYear(antes.getFullYear() - 1)
      return todos(...await Promise.all([
        c.from('movimentos_stock').select('*, produtos(nome, unidade)').order('created_at', { ascending: false }).gte('created_at', new Date(desde).toISOString()),
        c.from('movimentos_stock').select('*, produtos(nome, unidade)').order('created_at', { ascending: false })
          .gte('created_at', antes.toISOString()).lt('created_at', new Date(desde).toISOString()),
        c.from('produtos').select('*').order('nome'),
      ]))
    },
  },
  // armazemService.ts exportarMovimentosArmazem({ desde: 1 ano }) — limit 5000
  exportMovimentosAno: {
    classe: 'fecho', papeis: ['admin', 'gestor', 'armazem'],
    async fn({ c }) {
      return todos(await c.from('movimentos_stock').select(SELECT_MOV).order('created_at', { ascending: false })
        .gte('created_at', new Date(umAnoAtras()).toISOString()).limit(5000))
    },
  },
  // src/features/custos/services/custosService.ts custoConsolidado (RPC + orçamentos da obra)
  custosConsolidados: {
    classe: 'fecho', papeis: ['admin', 'gestor', 'medicoes'],
    async fn({ c, fx }) {
      const obra = pick(fx.obras)
      return todos(...await Promise.all([
        c.rpc('custos_consolidados_por_obra', { p_obra_id: obra, p_data_ini: umAnoAtras(), p_data_fim: hojeLisboa() }),
        c.from('obras').select('orcamento_materiais, orcamento_mao_obra, orcamento_combustivel, orcamento_fornecedores, orcamento_subempreiteiros').eq('id', obra).single(),
      ]))
    },
  },
  // src/features/contabilidade/contabilidadeService.ts exportarAutos + exportarMateriais (1 ano)
  exportContabilidade: {
    classe: 'fecho', papeis: ['admin', 'gestor'],
    async fn({ c }) {
      const ini = umAnoAtras()
      return todos(...await Promise.all([
        c.from('autos_medicao')
          .select('numero, data_medicao, valor_periodo, valor_glosado, estado, estado_pagamento, data_pagamento, referencia_pagamento, validado_em, subempreiteiros!inner(nome, percentagem_retencao, obra_id, obras(nome))')
          .eq('estado', 'validado').order('data_medicao', { ascending: true }).gte('data_medicao', ini),
        c.from('movimentos_stock')
          .select('created_at, tipo, quantidade, responsavel, destino_obra, produtos(nome, codigo, unidade, custo_unitario), obras(nome)')
          .eq('tipo', 'saida').order('created_at', { ascending: true }).gte('created_at', new Date(ini).toISOString()),
      ]))
    },
  },
}

// Peso relativo de cada operação dentro da sua classe (o perfil decide a proporção entre classes)
export const PESOS = {
  dashboard: 3, artigos: 2, movimentos30d: 3, fichaObra: 2, colaboradores: 1, produtosEmAlerta: 1, custosMateriais: 1,
  meusPedidos: 1, frotaResumo: 1,
  saidaStock: 3, entradaStock: 2, picagem: 3, pedidoAbastecimento: 1, relatorioDiario: 1,
  relatorioStockAno: 1, exportMovimentosAno: 1, custosConsolidados: 1, exportContabilidade: 1,
}

// Listas que a app pede sem paginação: compara o que o PostgREST devolve com o total (max_rows = 1000)
export const VERIFICAR_TRUNCAGEM = {
  'artigos (armazemService.listarArtigosArmazem)': (c) => c.from('produtos').select(SELECT_ARTIGO, { count: 'exact' }).eq('ativo', true).order('nome'),
  'produtos (produtosService.listarProdutos)': (c) => c.from('produtos').select('*', { count: 'exact' }).eq('ativo', true).order('nome'),
  'relatório stock ano (movimentosService.listarMovimentos)': (c) => c.from('movimentos_stock').select('*, produtos(nome, unidade)', { count: 'exact' })
    .order('created_at', { ascending: false }).gte('created_at', new Date(umAnoAtras()).toISOString()),
  'export movimentos (armazemService.exportarMovimentosArmazem, limit 5000)': (c) => c.from('movimentos_stock').select(SELECT_MOV, { count: 'exact' })
    .order('created_at', { ascending: false }).limit(5000),
  'export materiais (contabilidadeService.exportarMateriais)': (c) => c.from('movimentos_stock').select('created_at, tipo', { count: 'exact' })
    .eq('tipo', 'saida').order('created_at', { ascending: true }),
  'colaboradores (colaboradoresService.listarColaboradores)': (c) => c.from('colaboradores').select(SELECT_COLABORADOR, { count: 'exact' }).eq('ativo', true).order('nome'),
  'fornecedores usados (armazemService.listarFornecedoresUsados, limit 500)': (c) => c.from('movimentos_stock').select('fornecedor', { count: 'exact' })
    .not('fornecedor', 'is', null).order('created_at', { ascending: false }).limit(500),
  'materiais por obra (rpc armazem_materiais_por_obra)': (c) => c.rpc('armazem_materiais_por_obra', { p_obra_id: undefined }, { count: 'exact' }),
  'produtos em alerta (rpc produtos_em_alerta)': (c) => c.rpc('produtos_em_alerta', undefined, { count: 'exact' }),
  'relatórios diários (rpc obra_relatorios_lista, p_limite 1000)': (c) => c.rpc('obra_relatorios_lista', {
    p_obra_id: null, p_desde: null, p_ate: null, p_estado: null, p_so_ocorrencias: false, p_limite: 1000 }, { count: 'exact' }),
}
