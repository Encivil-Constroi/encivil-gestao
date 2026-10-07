// @vitest-environment node
// Guardas que partem o CI se uma migration futura abrir um buraco.
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarBanco, como } from './pg-harness.mjs'

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url))
let db
beforeAll(async () => { db = await criarBanco() }, 120_000)

// Funções que anon pode executar, e porquê. Rever cada entrada nova.
// (seguranca.test.mjs tem o mesmo inventário só para as SECURITY DEFINER.)
const ANON_FUNCOES = new Set([
  // SECURITY DEFINER
  'auth_role',              // usada dentro de policies RLS, avaliadas também para anon; devolve NULL sem sessão
  'pode_escrever',          // idem (policies); sem sessão devolve false
  'registar_login_falhado', // o login falhado acontece sem sessão; tetos por email e global (20261008020000)
  'audit_delete',           // função de trigger: não pode ser chamada diretamente
  'handle_new_user',        // função de trigger em auth.users: não pode ser chamada diretamente
  // SECURITY INVOKER — sem privilégios, correm com os direitos do chamador (anon não tem SELECT em nada de public)
  'custos_materiais_por_obra', // SQL de leitura; para anon falha por falta de GRANT nas tabelas
  'produtos_em_alerta',        // SQL de leitura; idem
  '_frota_catalogo_atualizado_em', // função de trigger
  'fn_calcular_prazo_prova',       // função de trigger
  'fn_epi_antes_inserir',          // função de trigger
  'fn_epi_depois_atualizar',       // função de trigger
  'fn_formacao_antes_inserir',     // função de trigger
  'set_updated_at',                // função de trigger
])
// Tabelas/views onde anon tem algum privilégio, e porquê. Hoje: nenhuma
// (a página sem sessão do motorista saiu no abastecimento v2, 20260930010000).
const ANON_TABELAS = new Set([])

describe('guardas da base de dados', () => {
  it('RLS ativa em todas as tabelas de public', async () => {
    const { rows } = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity`)
    expect(rows.map(r => r.relname)).toEqual([])
  })
  it('anon só executa funções da lista permitida', async () => {
    const { rows } = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')`)
    expect(rows.map(r => r.proname).filter(n => !ANON_FUNCOES.has(n)).sort()).toEqual([])
  })
  it('anon só tem privilégios de tabela da lista permitida', async () => {
    const { rows } = await db.query(`SELECT table_name || ':' || privilege_type AS p FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public'`)
    expect(rows.map(r => r.p).filter(p => !ANON_TABELAS.has(p)).sort()).toEqual([])
  })
  it('SECURITY DEFINER sempre com search_path fixo', async () => {
    const { rows } = await db.query(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`)
    expect(rows.map(r => r.f)).toEqual([])
  })
  it('nenhuma policy usa auth.jwt() para o papel', async () => {
    const { rows } = await db.query(`SELECT tablename, policyname FROM pg_policies
      WHERE coalesce(qual,'') ~* 'jwt\\(\\).*role' OR coalesce(with_check,'') ~* 'jwt\\(\\).*role'`)
    expect(rows).toEqual([])
  })
  it('migrations novas têm bloco ROLLBACK e SQL dinâmico só com format()', () => {
    const novas = readdirSync(DIR).filter(f => f.endsWith('.sql') && f >= '20261008000000')
    expect(novas.length).toBeGreaterThan(0)
    for (const f of novas) {
      const sql = readFileSync(DIR + f, 'utf8')
      expect(sql, `${f} sem -- ROLLBACK`).toMatch(/^-- ROLLBACK/m)
      const linhas = sql.split('\n').filter(l => !l.trim().startsWith('--'))
      const perigosas = linhas.filter(l => /\bEXECUTE\s+(?!ON\b|FUNCTION\b|PROCEDURE\b|format\s*\(|'[^'|]*'\s*;)/i.test(l)
        && !/\b(GRANT|REVOKE)\b/i.test(l))
      expect(perigosas, `${f}: EXECUTE dinâmico sem format()`).toEqual([])
    }
  })
})

// Ruling 4: stock só por RPC atómica (registar_movimento), nunca INSERT direto
describe('movimentos_stock só pela RPC', () => {
  const papeis = {}
  let produto
  beforeAll(async () => {
    for (const p of ['admin', 'gestor', 'armazem']) {
      const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`mov-${p}@t.pt`])
      await db.query(`UPDATE public.profiles SET role = $1, nome = $2 WHERE id = $3`, [p, p, rows[0].id])
      papeis[p] = rows[0].id
    }
    produto = (await db.query(`INSERT INTO public.produtos (codigo, nome, categoria, unidade, stock_atual, custo_unitario)
      VALUES ('G-1', 'Cimento', 'cimento', 'saco', 10, 5) RETURNING id`)).rows[0].id
  })
  const comoU = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)
  const stock = async () => Number((await db.query(`SELECT stock_atual FROM public.produtos WHERE id = $1`, [produto])).rows[0].stock_atual)

  it.each(['admin', 'gestor', 'armazem'])('%s não insere diretamente em movimentos_stock', async (p) => {
    await expect(comoU(papeis[p], tx => tx.query(
      `INSERT INTO public.movimentos_stock (produto_id, tipo, quantidade, stock_antes, stock_depois, responsavel)
       VALUES ($1, 'entrada', 1, 10, 11, 'x')`, [produto]))).rejects.toThrow(/permission denied/)
  })
  it('authenticated não tem INSERT/UPDATE/DELETE em movimentos_stock', async () => {
    const { rows } = await db.query(`SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'movimentos_stock' ORDER BY 1`)
    expect(rows.map(r => r.privilege_type)).toEqual(['SELECT'])
  })
  it.each(['armazem', 'gestor'])('registar_movimento como %s continua a funcionar', async (p) => {
    const antes = await stock()
    const { rows } = await comoU(papeis[p], tx => tx.query(
      `SELECT * FROM public.registar_movimento($1, 'entrada', 2, 'Zé')`, [produto]))
    expect(rows[0]).toMatchObject({ tipo: 'entrada' })
    expect(await stock()).toBe(antes + 2)
  })
  it('registar_movimento_armazem (porta do armazém) continua a funcionar', async () => {
    const antes = await stock()
    const { rows } = await comoU(papeis.armazem, tx => tx.query(
      `SELECT * FROM public.registar_movimento_armazem($1, 'COMPRA', 3, 'Zé', NULL, 'Leroy', 'FT 1', NULL, NULL, NULL)`, [produto]))
    expect(rows[0]).toMatchObject({ subtipo: 'COMPRA' })
    expect(await stock()).toBe(antes + 3)
  })
})
