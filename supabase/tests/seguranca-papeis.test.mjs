// @vitest-environment node
// Todas as decisões de papel passam por public.auth_role() — é lá que o MFA é imposto.
import { describe, it, expect, beforeAll } from 'vitest'
import { criarBanco, como } from './pg-harness.mjs'

let db, admin, gestor, armazem, semPerfil

async function utilizador(role, email) {
  const { rows } = await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email])
  await db.query(`UPDATE public.profiles SET role = $1 WHERE id = $2`, [role, rows[0].id])
  return rows[0].id
}
const u = (uid, fn) => como(db, { papel: 'authenticated', uid }, fn)

beforeAll(async () => {
  db = await criarBanco()
  admin = await utilizador('admin', 'admin@t.pt')
  gestor = await utilizador('gestor', 'gestor@t.pt')
  armazem = await utilizador('armazem', 'armazem@t.pt')
  semPerfil = '00000000-0000-0000-0000-0000000000aa'
}, 120_000)

// Funções que podem ler profiles.role diretamente, e porquê
const PERMITIDAS = new Set([
  'auth_role',       // fonte do papel
  'papel_real',      // papel sem a degradação do MFA (Tarefa 4)
  'handle_new_user', // cria o perfil no registo
])

// Leem o papel dos utilizadores ALVO (quem pode escrever relatórios); o chamador é verificado
// por pode_gerir_obras(), que usa auth_role() — o último teste garante que continua assim.
const ALVO_OBRAS = ['obra_autores_lista', 'obra_definir_autores']

// Regex de Postgres (ARE): \y é a fronteira de palavra (\b seria backspace e nunca casaria).
// Cobre "profiles.role"/"p.role", "FROM profiles … role" e "SELECT role … FROM profiles"
// na mesma instrução (até ao ";"), em várias linhas.
const LE_PAPEL = [
  String.raw`\y(profiles|p)\s*\.\s*role\y`,
  String.raw`\yfrom\s+(public\.)?profiles\y[^;]*\yrole\y`,
  String.raw`\yrole\y[^;]*\yfrom\s+(public\.)?profiles\y`,
].join('|')

describe('decisões de papel só via auth_role()', () => {
  it('nenhuma policy lê profiles.role diretamente', async () => {
    const { rows } = await db.query(
      `SELECT schemaname, tablename, policyname FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
          AND (coalesce(qual,'') ~* $1 OR coalesce(with_check,'') ~* $1)`, [LE_PAPEL])
    expect(rows).toEqual([])
  })

  it('nenhuma função lê profiles.role para decidir permissões (fora da lista permitida)', async () => {
    const { rows } = await db.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosrc ~* $1`, [LE_PAPEL])
    const fora = rows.map(r => r.proname)
      .filter(n => !PERMITIDAS.has(n) && n !== 'promover_role' && !ALVO_OBRAS.includes(n))
    expect(fora).toEqual([])
  })

  it('promover_role verifica o chamador com auth_role()', async () => {
    const { rows } = await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'promover_role'`)
    expect(rows[0].prosrc).toMatch(/auth_role\(\)/)
    expect(rows[0].prosrc).not.toMatch(/\brole\b[^;]*\bfrom\s+(public\.)?profiles\b/i)
  })

  it('funções que leem o papel do alvo verificam o chamador com pode_gerir_obras()', async () => {
    const { rows } = await db.query(
      `SELECT proname, prosrc FROM pg_proc WHERE proname = ANY($1)`, [ALVO_OBRAS])
    expect(rows.map(r => r.proname).sort()).toEqual([...ALVO_OBRAS].sort())
    for (const r of rows) expect(r.prosrc).toMatch(/pode_gerir_obras\(\)/)
    const { rows: [g] } = await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'pode_gerir_obras'`)
    expect(g.prosrc).toMatch(/auth_role\(\)/)
  })
})

// O comportamento das verificações convertidas fica igual ao de antes da migration
describe('verificações convertidas mantêm o comportamento', () => {
  it('configuracoes_empresa: só o admin altera', async () => {
    const upd = uid => u(uid, tx => tx.query(`UPDATE public.configuracoes_empresa SET nome_empresa = nome_empresa`))
    expect((await upd(admin)).affectedRows).toBe(1)
    expect((await upd(gestor)).affectedRows).toBe(0)
    expect((await upd(semPerfil)).affectedRows).toBe(0)
  })

  it('audit_log: só o admin lê', async () => {
    await db.query(`INSERT INTO public.audit_log (actor_id, action) VALUES ($1, 'teste_papeis')`, [admin])
    const ler = uid => u(uid, tx => tx.query(`SELECT 1 FROM public.audit_log WHERE action = 'teste_papeis'`))
    expect((await ler(admin)).rows).toHaveLength(1)
    expect((await ler(gestor)).rows).toHaveLength(0)
    expect((await ler(semPerfil)).rows).toHaveLength(0)
  })

  it('movimentos_stock: insert direto só para admin e gestor', async () => {
    const { rows: [p] } = await db.query(
      `INSERT INTO public.produtos (nome, categoria, unidade) VALUES ('Cimento', 'Materiais', 'saco') RETURNING id`)
    const ins = uid => u(uid, tx => tx.query(
      `INSERT INTO public.movimentos_stock (produto_id, tipo, quantidade, stock_antes, stock_depois, responsavel)
       VALUES ($1, 'entrada', 1, 0, 1, 'Teste')`, [p.id]))
    await expect(ins(admin)).resolves.toBeTruthy()
    await expect(ins(gestor)).resolves.toBeTruthy()
    await expect(ins(armazem)).rejects.toThrow(/row-level security/)
    await expect(ins(semPerfil)).rejects.toThrow(/row-level security/)
  })

  it('arquivar_subempreiteiro: só admin e gestor', async () => {
    const { rows: [o] } = await db.query(`INSERT INTO public.obras (nome) VALUES ('Obra papéis') RETURNING id`)
    const novo = async () => (await db.query(
      `INSERT INTO public.subempreiteiros (obra_id, nome) VALUES ($1, 'Sub') RETURNING id`, [o.id])).rows[0].id
    const arq = (uid, id) => u(uid, tx => tx.query(`SELECT public.arquivar_subempreiteiro($1)`, [id]))
    const s1 = await novo(), s2 = await novo(), s3 = await novo()
    await arq(admin, s1)
    await arq(gestor, s2)
    await expect(arq(armazem, s3)).rejects.toThrow(/Apenas administradores e gestores/)
    await expect(arq(semPerfil, s3)).rejects.toThrow(/Apenas administradores e gestores/)
    const { rows } = await db.query(`SELECT id, ativo FROM public.subempreiteiros WHERE id = ANY($1)`, [[s1, s2, s3]])
    expect(Object.fromEntries(rows.map(r => [r.id, r.ativo]))).toEqual({ [s1]: false, [s2]: false, [s3]: true })
  })

  it('promover_role: só o admin altera papéis; o papel do alvo muda', async () => {
    const alvo = await utilizador('leitura', 'alvo@t.pt')
    const promover = (uid, role) => u(uid, tx => tx.query(`SELECT public.promover_role($1, $2)`, [alvo, role]))
    await expect(promover(gestor, 'admin')).rejects.toThrow(/Autorização negada/)
    await expect(promover(semPerfil, 'admin')).rejects.toThrow(/Autorização negada/)
    await promover(admin, 'armazem')
    const { rows: [p] } = await db.query(`SELECT role FROM public.profiles WHERE id = $1`, [alvo])
    expect(p.role).toBe('armazem')
    await expect(u(admin, tx => tx.query(`SELECT public.promover_role($1, 'gestor')`, [admin])))
      .rejects.toThrow(/despromover a própria conta/)
  })
})
