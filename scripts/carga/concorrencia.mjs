// Testes de concorrência (integridade), só na stack Supabase LOCAL (ver env.mjs).
// Uso: node scripts/carga/concorrencia.mjs [--so=<cenario>]
// Cada cenário imprime "OK|FALHA <nome> <detalhe>"; o processo sai com código 1 se algum falhar.
// As operações passam pela API como utilizadores reais do seed (RLS + RPC, como no browser). O psql
// (superutilizador) só prepara fixtures novas por corrida (marcador carga-conc-<ts>) e lê o resultado final.
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { API_URL, ANON_KEY, DIR_RESULTADOS, emailPapel, psql, senhaCarga } from './env.mjs'

const so = (process.argv.find((a) => a.startsWith('--so=')) ?? '').split('=')[1] || null
const TS = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const MARCA = `carga-conc-${TS}`
const senha = senhaCarga()
const linhas = []
const falhas = []

function log(l) { console.log(l); linhas.push(l) }
function resultado(ok, nome, detalhe) {
  log(`${ok ? 'OK' : 'FALHA'} ${nome} ${detalhe}`)
  if (!ok) falhas.push(nome)
}
const um = (sql) => psql(sql).split('\n')[0]
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

// --- Sessões: login sequencial (o Auth local limita 30 logins/5 min por IP); o paralelismo fica nas operações ---
const sessoes = new Map()
async function sessao(email) {
  if (sessoes.has(email)) return sessoes.get(email)
  for (let tentativa = 0; ; tentativa++) {
    const c = createClient(API_URL, ANON_KEY, opts)
    const { data, error } = await c.auth.signInWithPassword({ email, password: senha })
    if (!error) {
      const s = { email, token: data.session.access_token, userId: data.user.id }
      sessoes.set(email, s)
      return s
    }
    if (error.status === 429 && tentativa < 10) {
      log(`  (limite de logins do Auth local; nova tentativa em 30 s para ${email})`)
      await new Promise((r) => setTimeout(r, 30_000))
      continue
    }
    throw new Error(`login ${email}: ${error.message}`)
  }
}
// Um cliente por dispositivo simulado (o mesmo utilizador pode ter vários dispositivos com a mesma sessão)
function dispositivo(s) {
  return createClient(API_URL, ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${s.token}` } } })
}
async function dispositivos(emails, n) {
  const ss = []
  for (const e of emails) ss.push(await sessao(e))
  return Array.from({ length: n }, (_, i) => dispositivo(ss[i % ss.length]))
}
// Utilizadores de carga com papel armazem (seed: carga-u301..u400)
const emailsArmazem = async (n) =>
  psql(`select email from public.profiles where email like 'carga-u%@local.test' and role = 'armazem' order by email limit ${n}`)
    .split('\n').filter(Boolean)

async function emParalelo(n, fn) {
  const r = await Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)))
  const ok = []; const erros = []
  for (const x of r) {
    if (x.status === 'rejected') erros.push(String(x.reason?.message ?? x.reason))
    else if (x.value.error) erros.push(x.value.error.message)
    else ok.push(x.value.data)
  }
  return { ok, erros }
}
// Movimento como a app o envia: com client_id gerado no dispositivo. Numa falha de rede a app volta a enviar
// com o mesmo client_id (fila offline) e o servidor devolve o movimento já gravado em vez de o repetir.
// Com ~300 pedidos HTTP simultâneos o gateway local (Kong em Docker/Windows) fecha sockets (UND_ERR_SOCKET).
let reenviosRede = 0
async function movimento(dev, args) {
  const comId = { ...args, p_client_id: randomUUID() }
  for (let tentativa = 0; ; tentativa++) {
    const r = await dev.rpc('registar_movimento_armazem', comId)
    if (!(r.error?.message ?? '').includes('fetch failed') || tentativa >= 5) return r
    reenviosRede++
    await new Promise((res) => setTimeout(res, 200 * (tentativa + 1)))
  }
}
const resumoErros = (erros) => {
  const m = new Map()
  for (const e of erros) { const k = e.replace(/[0-9a-f-]{36}/g, '<id>').replace(/\d+(\.\d+)?/g, 'N').slice(0, 80); m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m].map(([k, v]) => `${v}x "${k}"`).join('; ')
}

// --- Fixtures (psql, como o admin de carga para passar pelas mesmas RPCs) ---
const ADMIN_ID = `(select id from public.profiles where email = '${emailPapel('admin')}')`
const COMO_ADMIN = `
select set_config('request.jwt.claim.sub', ${ADMIN_ID}::text, true);
select set_config('request.jwt.claims', json_build_object('sub', ${ADMIN_ID}, 'role', 'authenticated')::text, true);`
function criarArtigo(nome, stockInicial) {
  return psql(`begin;${COMO_ADMIN}
select (public.criar_produto(jsonb_build_object('nome', '${nome}', 'categoria', 'Outros', 'unidade', 'un',
  'stock_inicial', ${stockInicial}, 'stock_minimo', 0, 'responsavel', '${MARCA}'))).id;
commit;`).split('\n').filter((l) => /^[0-9a-f-]{36}$/.test(l)).at(-1)
}
const obraAtiva = () => um(`select id from public.obras where nome like 'carga-%' and estado = 'ativa' order by nome limit 1`)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

// --- Cenários ---
const cenarios = {
  async 'saidas-mesmo-artigo'(nome) {
    reenviosRede = 0
    const pid = criarArtigo(`${MARCA} saídas`, 100)
    const obra = obraAtiva()
    const devs = await dispositivos([emailPapel('armazem'), ...(await emailsArmazem(4))], 20)
    const { ok, erros } = await emParalelo(200, (i) => movimento(devs[i % devs.length], {
      p_produto_id: pid, p_subtipo: 'OBRA', p_quantidade: 1, p_responsavel: MARCA, p_obra_id: obra,
    }))
    const [stock, nSaidas, minDepois, inconsist] = um(`select p.stock_atual,
        (select count(*) from public.movimentos_stock m where m.produto_id = p.id and m.tipo = 'saida'),
        (select min(stock_depois) from public.movimentos_stock m where m.produto_id = p.id),
        (select count(*) from public.movimentos_stock m where m.produto_id = p.id and m.tipo = 'saida' and m.stock_depois <> m.stock_antes - m.quantidade)
      from public.produtos p where p.id = '${pid}'`).split('|').map(Number)
    const errosInesperados = erros.filter((e) => !e.includes('Stock insuficiente'))
    const bom = ok.length === 100 && stock === 0 && nSaidas === 100 && minDepois >= 0 && inconsist === 0 && errosInesperados.length === 0
    resultado(bom, nome, `sucessos=${ok.length}/200 stock_final=${stock} linhas_saida=${nSaidas} min_stock_depois=${minDepois} linhas_incoerentes=${inconsist} reenvios_rede=${reenviosRede}` +
      (errosInesperados.length ? ` erros_inesperados: ${resumoErros(errosInesperados)}` : ''))
  },

  async 'entradas-saidas-mistas'(nome) {
    // Só entradas (COMPRA) e saídas (OBRA, QUEBRA): sem INVENTARIO, a soma derivada não depende da ordem de commit.
    reenviosRede = 0
    const pids = [1, 2, 3].map((k) => criarArtigo(`${MARCA} mistas ${k}`, 100))
    const obra = obraAtiva()
    const devs = await dispositivos([emailPapel('armazem'), ...(await emailsArmazem(4))], 30)
    const { ok, erros } = await emParalelo(300, (i) => {
      const r = Math.random()
      const base = { p_produto_id: pids[i % 3], p_quantidade: rnd(1, 20), p_responsavel: MARCA }
      const args = r < 0.5 ? { ...base, p_subtipo: 'COMPRA', p_fornecedor: 'Fornecedor Carga' }
        : r < 0.9 ? { ...base, p_subtipo: 'OBRA', p_obra_id: obra }
          : { ...base, p_subtipo: 'QUEBRA' }
      return movimento(devs[i % devs.length], args)
    })
    const ids = pids.map((p) => `'${p}'`).join(',')
    const [divergentes, negativos, incoerentes, nMov] = um(`
      with d as (
        select p.id, p.stock_atual,
               coalesce(sum(case m.tipo when 'entrada' then m.quantidade when 'saida' then -m.quantidade end), 0) as derivado,
               count(m.id) as n
          from public.produtos p left join public.movimentos_stock m on m.produto_id = p.id
         where p.id in (${ids}) group by p.id)
      select (select count(*) from d where stock_atual <> derivado),
             (select count(*) from public.movimentos_stock where produto_id in (${ids}) and stock_depois < 0),
             (select count(*) from public.movimentos_stock where produto_id in (${ids})
               and stock_depois <> case tipo when 'entrada' then stock_antes + quantidade when 'saida' then stock_antes - quantidade else quantidade end),
             (select sum(n) from d)`).split('|').map(Number)
    // Integridade global (pós-carga, Task 7): artigos de carga sem ajustes têm stock = Σ entradas − Σ saídas
    const [verificados, globaisDiv, globaisNeg] = um(`
      with d as (
        select p.id, p.stock_atual,
               coalesce(sum(case m.tipo when 'entrada' then m.quantidade when 'saida' then -m.quantidade end), 0) as derivado,
               bool_or(m.tipo = 'ajuste') as tem_ajuste
          from public.produtos p left join public.movimentos_stock m on m.produto_id = p.id
         where p.codigo like 'carga-%' or p.nome like 'carga-conc-%' group by p.id)
      select count(*) filter (where not coalesce(tem_ajuste, false)),
             count(*) filter (where not coalesce(tem_ajuste, false) and stock_atual <> derivado),
             (select count(*) from public.produtos where stock_atual < 0)
        from d`).split('|').map(Number)
    const errosInesperados = erros.filter((e) => !e.includes('Stock insuficiente'))
    const bom = divergentes === 0 && negativos === 0 && incoerentes === 0 && nMov === 3 + ok.length &&
      errosInesperados.length === 0 && globaisDiv === 0 && globaisNeg === 0
    resultado(bom, nome, `ops=300 sucessos=${ok.length} recusas_stock=${erros.length - errosInesperados.length} ` +
      `artigos_divergentes=${divergentes}/3 movimentos=${nMov} (esperado ${3 + ok.length}) stock_depois_negativo=${negativos} ` +
      `linhas_incoerentes=${incoerentes} reenvios_rede=${reenviosRede} | global: artigos_sem_ajuste_verificados=${verificados} divergentes=${globaisDiv} stock_negativo=${globaisNeg}` +
      (errosInesperados.length ? ` erros_inesperados: ${resumoErros(errosInesperados)}` : ''))
  },

  async 'autos-numeracao'(nome) {
    const sub = um(`insert into public.subempreiteiros(obra_id, nome, tipo, valor_global, estado)
      values ((select id from public.obras where nome like 'carga-%' and estado = 'ativa' order by nome limit 1),
              '${MARCA} sub', 'global', 100000, 'rascunho') returning id`)
    const devs = await dispositivos([emailPapel('medicoes'), emailPapel('gestor')], 10)
    const hoje = new Date().toISOString().slice(0, 10)
    const { ok, erros } = await emParalelo(50, (i) => devs[i % devs.length].rpc('criar_auto_rpc', {
      p_sub_id: sub, p_data: hoje, p_percentagem: 1, p_valor: 100, p_notas: `${MARCA} auto ${i}`,
    }))
    const nums = ok.map((d) => d?.[0]?.numero).filter((n) => n != null).sort((a, b) => a - b)
    const consecutivos = nums.every((n, i) => n === i + 1)
    const [nBd, distintos, maxBd] = um(`select count(*), count(distinct numero), max(numero) from public.autos_medicao where subempreiteiro_id = '${sub}'`).split('|').map(Number)
    const bom = ok.length === 50 && new Set(nums).size === 50 && consecutivos && nBd === 50 && distintos === 50 && maxBd === 50
    resultado(bom, nome, `sucessos=${ok.length}/50 numeros_unicos=${new Set(nums).size} consecutivos_1..50=${consecutivos} ` +
      `bd: autos=${nBd} distintos=${distintos} max=${maxBd}` + (erros.length ? ` erros: ${resumoErros(erros)}` : ''))
  },

  async 'codigos-sequencia'(nome) {
    const devs = await dispositivos([emailPapel('armazem'), ...(await emailsArmazem(4))], 20)
    const { ok, erros } = await emParalelo(100, (i) => devs[i % devs.length].rpc('criar_produto', {
      p: { nome: `${MARCA} código ${i}`, categoria: 'Outros', unidade: 'un', stock_inicial: 0, stock_minimo: 0, custo_unitario: 0 },
    }))
    const codigos = ok.map((p) => p?.codigo)
    const [nBd, distintosBd, nulos] = um(`select count(*), count(distinct codigo), count(*) filter (where codigo is null or codigo = '')
      from public.produtos where nome like '${MARCA} código %'`).split('|').map(Number)
    const bom = ok.length === 100 && new Set(codigos).size === 100 && !codigos.includes(undefined) && nBd === 100 && distintosBd === 100 && nulos === 0
    resultado(bom, nome, `sucessos=${ok.length}/100 codigos_unicos=${new Set(codigos).size} bd: artigos=${nBd} distintos=${distintosBd} vazios=${nulos} ` +
      `ex: ${codigos.slice(0, 3).join(',')}` + (erros.length ? ` erros: ${resumoErros(erros)}` : ''))
  },

  async 'aprovacao-dupla-abastecimento'(nome) {
    // Fluxo real: o pedido nasce em AGUARDA_AUTORIZACAO e quem aprova chama autorizar_abastecimento
    // (pode_aprovar_combustivel: comb_aprovadores; com a lista vazia, só admin).
    const temAprovadores = Number(um(`select count(*) from public.comb_aprovadores`)) > 0
    let aprovador = emailPapel('admin')
    if (temAprovadores) {
      aprovador = emailPapel('gestor')
      psql(`insert into public.comb_aprovadores(user_id) select id from public.profiles where email = '${aprovador}' on conflict do nothing`)
    }
    const ped = um(`insert into public.comb_abastecimentos_pendentes(veiculo_id, veiculo_nome, funcionario_nome, tipo_fonte, estado, tipo_combustivel, observacoes, solicitante_id)
      select v.id, v.nome, 'Carga Motorista', 'POSTO_RUA', 'AGUARDA_AUTORIZACAO', 'gasoleo', '${MARCA}',
             (select id from public.profiles where email = '${emailPapel('motorista')}')
        from public.comb_veiculos v where v.codigo like 'carga-V%' order by v.codigo limit 1 returning id`)
    const devs = await dispositivos([aprovador], 20)
    const { ok, erros } = await emParalelo(20, (i) => devs[i].rpc('autorizar_abastecimento', { p_id: ped }))
    const [estado, autorizadoPor] = um(`select estado, autorizado_por is not null from public.comb_abastecimentos_pendentes where id = '${ped}'`).split('|')
    const errosInesperados = erros.filter((e) => !e.includes('já processado'))
    const bom = ok.length === 1 && estado === 'AUTORIZADO' && autorizadoPor === 't' && errosInesperados.length === 0
    resultado(bom, nome, `aprovador=${aprovador} sucessos=${ok.length}/20 recusas_ja_processado=${erros.length - errosInesperados.length} estado_final=${estado}` +
      (errosInesperados.length ? ` erros_inesperados: ${resumoErros(errosInesperados)}` : ''))
    // O pedido de teste não fica a ocupar a viatura de carga
    psql(`update public.comb_abastecimentos_pendentes set estado = 'CANCELADO', cancelado_em = now() where id = '${ped}'`)
  },

  async 'emprestimo-duplo-ferramenta'(nome) {
    const fid = um(`insert into public.ferramentas(codigo, nome, categoria, observacoes) values ('${MARCA}', '${MARCA} berbequim', 'outro', '${MARCA}') returning id`)
    const foto = `ferramentas/${fid}/entrega-${TS}.jpg`
    psql(`insert into storage.objects(bucket_id, name) values ('armazem', '${foto}')`)
    const devs = await dispositivos([emailPapel('armazem'), ...(await emailsArmazem(4))], 20)
    const { ok, erros } = await emParalelo(20, (i) => devs[i].rpc('registar_emprestimo_ferramenta', {
      p_ferramenta_id: fid, p_funcionario_nome: `Funcionário ${i}`, p_responsavel_entrega: MARCA,
      p_foto_entrega_path: foto, p_assinatura_entrega: 'data:,assinatura', p_assinatura_responsavel_ent: 'data:,assinatura',
    }))
    const [estado, ativos, total] = um(`select f.estado,
        (select count(*) from public.emprestimos_ferramentas e where e.ferramenta_id = f.id and e.estado = 'ativo'),
        (select count(*) from public.emprestimos_ferramentas e where e.ferramenta_id = f.id)
      from public.ferramentas f where f.id = '${fid}'`).split('|')
    const errosInesperados = erros.filter((e) => !e.includes('em uso por') && !e.includes('não está disponível') && !e.includes('uq_emprestimo_ativo_ferramenta'))
    const bom = ok.length === 1 && estado === 'emprestada' && Number(ativos) === 1 && Number(total) === 1 && errosInesperados.length === 0
    resultado(bom, nome, `sucessos=${ok.length}/20 estado=${estado} emprestimos_ativos=${ativos} emprestimos_total=${total}` +
      (erros.length ? ` recusas: ${resumoErros(erros)}` : ''))
  },

  async 'picagem-duplicada'(nome) {
    // Fluxo real: INSERT direto em picagens (picagensService.registarPicagem). Não há unicidade na BD;
    // a única proteção contra duplicados é do cliente (fila offline com flush único). Regra existente:
    // cada INSERT válido grava uma linha PENDENTE_VALIDACAO; o gestor valida/recusa depois.
    const obra = obraAtiva()
    const colab = um(`insert into public.colaboradores(nome, numero_mecan, cargo, obra_id, ativo, notas)
      values ('${MARCA} colaborador', '${MARCA}', 'Pedreiro', '${obra}', true, '${MARCA}') returning id`)
    const devs = await dispositivos([emailPapel('gestor')], 20)
    const minuto = new Date(); minuto.setSeconds(0, 0)
    const { ok, erros } = await emParalelo(20, (i) => devs[i].from('picagens').insert({
      colaborador_id: colab, obra_id: obra, tipo: 'ENTRADA',
      timestamp_dispositivo: new Date(minuto.getTime() + i * 1000).toISOString(), origem: 'ONLINE',
    }).select('id, resultado').single())
    const [n, pendentes] = um(`select count(*), count(*) filter (where resultado = 'PENDENTE_VALIDACAO') from public.picagens where colaborador_id = '${colab}'`).split('|').map(Number)
    // Coerente com a regra existente = todas aceites, uma linha por pedido, nenhuma perdida nem validada sozinha
    const bom = ok.length === 20 && n === 20 && pendentes === 20 && erros.length === 0
    resultado(bom, nome, `sucessos=${ok.length}/20 linhas=${n} pendentes_validacao=${pendentes} (sem deduplicação na BD: 20 ENTRADAS no mesmo minuto ficam todas gravadas)` +
      (erros.length ? ` erros: ${resumoErros(erros)}` : ''))
  },

  async 'fatura-lancamento-duplo'(nome) {
    // Achado da auditoria: _lancar_fatura_impl lê o estado sem FOR UPDATE; chamadas paralelas podem lançar a mesma fatura N vezes.
    const pid = criarArtigo(`${MARCA} fatura`, 0)
    const fat = um(`insert into public.faturas_fornecedor(numero_fatura, fornecedor, estado, observacoes, classificado_em)
      values ('${MARCA}', 'Fornecedor Carga', 'CLASSIFICADA', '${MARCA}', now()) returning id`)
    psql(`insert into public.linhas_fatura(fatura_id, descricao, quantidade, destino, artigo_id) values ('${fat}', '${MARCA} linha', 10, 'ARMAZEM', '${pid}')`)
    const devs = await dispositivos([emailPapel('gestor')], 20)
    const { ok, erros } = await emParalelo(20, (i) => devs[i].rpc('lancar_fatura', { p_fatura_id: fat, p_responsavel: MARCA }))
    const [stock, nMov, estado] = um(`select p.stock_atual,
        (select count(*) from public.movimentos_stock m where m.produto_id = p.id and m.tipo = 'entrada'),
        (select estado from public.faturas_fornecedor where id = '${fat}')
      from public.produtos p where p.id = '${pid}'`).split('|')
    const bom = ok.length === 1 && Number(stock) === 10 && Number(nMov) === 1 && estado === 'LANCADA'
    resultado(bom, nome, `sucessos=${ok.length}/20 stock_final=${Number(stock)} (esperado 10) entradas=${nMov} (esperado 1) estado=${estado}` +
      (erros.length ? ` recusas: ${resumoErros(erros)}` : ''))
  },
}

if (so && !cenarios[so]) throw new Error(`Cenário desconhecido: ${so}. Disponíveis: ${Object.keys(cenarios).join(', ')}`)
log(`# concorrência ${MARCA} ${API_URL}${so ? ` --so=${so}` : ''}`)
for (const [nome, fn] of Object.entries(cenarios)) {
  if (so && so !== nome) continue
  const t0 = Date.now()
  try {
    await fn(nome)
  } catch (e) {
    resultado(false, nome, `erro: ${e.message}`)
  }
  log(`  (${nome}: ${((Date.now() - t0) / 1000).toFixed(1)} s)`)
}
log(falhas.length ? `# ${falhas.length} FALHA(s): ${falhas.join(', ')}` : '# todos OK')

mkdirSync(DIR_RESULTADOS, { recursive: true })
const ficheiro = join(DIR_RESULTADOS, `concorrencia-${TS}${so ? `-${so}` : ''}.txt`)
writeFileSync(ficheiro, linhas.join('\n') + '\n')
console.log(`resultado gravado em ${ficheiro}`)
process.exitCode = falhas.length ? 1 : 0
