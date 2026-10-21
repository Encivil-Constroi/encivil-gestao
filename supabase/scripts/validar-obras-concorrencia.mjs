// Somente o Postgres 17 isolado de homologação; nunca acede à API da empresa.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const container = process.env.OBRAS_SQL_CONTAINER ?? 'encivil-obras-reaudit-sql-20261007'
assert.match(container, /^encivil-obras-[a-z0-9-]+$/, 'Só é permitido um container de homologação de Obras')
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
assert.match(info.Config.Image, /^postgres:17(?:[.-].*)?$/)
assert.equal(info.HostConfig.NetworkMode, 'none')
// A imagem oficial cria um volume anónimo para PGDATA; não aceitar bind mounts nem volumes nomeados.
for (const mount of info.Mounts) {
  assert.equal(mount.Type, 'volume')
  assert.match(mount.Name, /^[a-f0-9]{64}$/)
  assert.equal(mount.Destination, '/var/lib/postgresql/data')
}
assert.equal(Object.keys(info.NetworkSettings.Ports ?? {}).filter(p => info.NetworkSettings.Ports[p]?.length).length, 0)
const psql = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
const sql = s => execFileSync('docker', psql, { input: s, encoding: 'utf8', windowsHide: true }).trim()
assert.equal(sql("SELECT current_setting('server_version_num')::int / 10000"), '17')
assert.equal(sql("SELECT to_regclass('public.auto_linhas') IS NOT NULL"), 't', 'Aplicar primeiro o schema local completo')
if (process.argv.includes('--apply')) {
  const migration = readFileSync(new URL('../migrations/20261008100000_obras_concorrencia_mfa.sql', import.meta.url), 'utf8')
  sql(migration)
  sql(migration)
  console.log('Migration reaplicada duas vezes no container isolado.')
}

class Session {
  constructor(name) {
    this.out = ''; this.err = ''; this.seq = 0; this.pending = null
    this.child = spawn('docker', ['exec', '-e', `PGAPPNAME=${name}`, '-i', container,
      'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-P', 'pager=off'],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child.stdout.on('data', b => { this.out += b.toString(); this.flush() })
    this.child.stderr.on('data', b => { this.err += b.toString() })
    this.child.on('error', e => this.pending?.reject(e))
    this.child.on('exit', code => this.pending?.reject(new Error(`psql terminou: ${code}`)))
  }
  flush() {
    if (!this.pending || !this.out.includes(this.pending.marker)) return
    const pending = this.pending
    this.pending = null
    clearTimeout(pending.timer)
    // stderr e stdout são pipes distintos: consumir ambos antes da asserção.
    delay(20).then(() => pending.resolve({ out: this.out.slice(pending.outStart).split(pending.marker)[0].trim(),
      error: this.err.slice(pending.errStart).trim() }))
  }
  query(s) {
    assert.equal(this.pending, null, 'Uma instrução de cada vez por sessão')
    return new Promise((resolve, reject) => {
      const marker = `done_${randomUUID().replaceAll('-', '')}_${++this.seq}`
      this.pending = { marker, resolve, reject, outStart: this.out.length, errStart: this.err.length,
        timer: setTimeout(() => reject(new Error('Sessão não terminou em 15 s')), 15000) }
      this.child.stdin.write(`${s};\n\\echo ${marker}\n`)
    })
  }
  async ok(s) {
    const r = await this.query(s)
    assert.equal(r.error, '', r.error)
    return r.out
  }
  close() { this.child.stdin.end('ROLLBACK;\n\\q\n') }
}

const uid = randomUUID()
sql(`INSERT INTO auth.users (id, email) VALUES ('${uid}', '${uid}@test.pt');
  UPDATE public.profiles SET role = 'medicoes' WHERE id = '${uid}';`)
let numero = 0
const fixture = () => {
  const obra = randomUUID(), sub = randomUUID(), a = randomUUID(), l = randomUUID(), extra = randomUUID()
  sql(`INSERT INTO public.obras (id, nome, estado) VALUES ('${obra}', 'Concorrência isolada ${++numero}', 'ativa');
    INSERT INTO public.subempreiteiros (id, obra_id, nome, tipo, estado) VALUES ('${sub}', '${obra}', 'Contrato isolado', 'unitario', 'validado');
    INSERT INTO public.autos_medicao (id, subempreiteiro_id, numero, valor_periodo, created_by) VALUES ('${a}', '${sub}', 1, 150, '${uid}');
    INSERT INTO public.auto_linhas (id, auto_id, descricao, unidade, preco_unitario, quantidade, is_extra, justificacao) VALUES
      ('${l}', '${a}', 'Extra A', 'un', 10, 10, true, 'Trabalho adicional'),
      ('${extra}', '${a}', 'Extra B', 'un', 10, 5, true, 'Trabalho adicional');`)
  return { a, l, extra, sub }
}
const operation = (op, f, first) => ({
  UPDATE: `UPDATE public.auto_linhas SET quantidade = ${first ? 9 : 999} WHERE id = '${f.l}'`,
  DELETE: `DELETE FROM public.auto_linhas WHERE id = '${f.extra}'`,
  INSERT: `INSERT INTO public.auto_linhas (auto_id, descricao, unidade, preco_unitario, quantidade, is_extra, justificacao)
    VALUES ('${f.a}', 'Nova', 'un', 10, 2, true, 'Trabalho adicional')`,
})[op]
const begin = s => s.ok(`BEGIN ISOLATION LEVEL READ COMMITTED;
  SET LOCAL statement_timeout = '10s'; SET LOCAL lock_timeout = '8s';
  SELECT set_config('request.jwt.claim.sub', '${uid}', true);
  SELECT set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT set_config('request.jwt.claims', '{"aal":"aal1"}', true);
  SET LOCAL ROLE authenticated`)
const state = a => JSON.parse(sql(`SELECT json_build_object('workflow', workflow, 'valor', valor_periodo,
  'soma', (SELECT coalesce(sum(quantidade * preco_unitario),0) FROM public.auto_linhas WHERE auto_id = am.id))
  FROM public.autos_medicao am WHERE id = '${a}'`))
async function blocked(name, promise) {
  let complete = false
  promise.then(() => { complete = true }, () => { complete = true })
  for (let i = 0; i < 80; i++) {
    if (complete) return false
    if (sql(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = '${name}'
      AND cardinality(pg_blocking_pids(pid)) > 0)`) === 't') return true
    await delay(25)
  }
  throw new Error(`Não foi observada conclusão nem espera de lock: ${name}`)
}
const failures = []
async function scenario(name, fn) {
  const sessionName = `obras_t2_${randomUUID().slice(0, 8)}`
  const a = new Session(`${sessionName}_a`), b = new Session(`${sessionName}_b`)
  try {
    await fn(a, b, sessionName)
    console.log(`PASS ${name}`)
  } catch (e) {
    failures.push(name)
    console.log(`FAIL ${name}: ${e.message}`)
  } finally {
    // Enviar rollback a ambos sem aguardar um deles enquanto o outro segura locks.
    a.close(); b.close()
  }
}

for (const op of ['UPDATE', 'DELETE', 'INSERT']) {
  await scenario(`submissão → ${op}: escrita tardia recusada`, async (a, b, name) => {
    const f = fixture()
    await begin(a); await begin(b)
    await a.ok(`SELECT public.auto_submeter('${f.a}')`)
    const pending = b.query(operation(op, f, false))
    const waited = await blocked(`${name}_b`, pending)
    await a.ok('COMMIT')
    const result = await pending
    if (!result.error) await b.ok('COMMIT')
    else await b.ok('ROLLBACK')
    const final = state(f.a)
    console.log(`  espera=${waited}; workflow=${final.workflow}; valor=${final.valor}; soma=${final.soma}`)
    assert.match(result.error, /já foi submetido/, 'A operação tardia deve falhar pela guarda de workflow')
    assert.equal(waited, true)
    assert.deepEqual(final, { workflow: 'submetido', valor: 150, soma: 150 })
  })
  await scenario(`${op} → submissão: soma final consistente`, async (a, b, name) => {
    const f = fixture(), total = { UPDATE: 140, DELETE: 100, INSERT: 170 }[op]
    await begin(a); await begin(b)
    await b.ok(operation(op, f, true))
    const pending = a.query(`SELECT public.auto_submeter('${f.a}')`)
    assert.equal(await blocked(`${name}_a`, pending), true, 'Submissão deve esperar a transação da linha')
    await b.ok(`UPDATE public.autos_medicao SET valor_periodo = ${total} WHERE id = '${f.a}'; COMMIT`)
    assert.equal((await pending).error, '')
    await a.ok('COMMIT')
    const final = state(f.a)
    assert.deepEqual(final, { workflow: 'submetido', valor: total, soma: total })
    console.log(`  workflow=${final.workflow}; valor=${final.valor}; soma=${final.soma}`)
  })
}

await scenario('mudanças de pai opostas: mesmos locks em ordem, sem deadlock', async (a, b, name) => {
  const f = fixture(), other = randomUUID(), otherLine = randomUUID()
  sql(`INSERT INTO public.autos_medicao (id, subempreiteiro_id, numero, valor_periodo, created_by)
    VALUES ('${other}', '${f.sub}', 2, 100, '${uid}');
    INSERT INTO public.auto_linhas (id, auto_id, descricao, unidade, preco_unitario, quantidade)
    VALUES ('${otherLine}', '${other}', 'Outra', 'un', 10, 10);`)
  const [low, high] = [f.a, other].sort()
  const [lowLine, highLine] = low === f.a ? [f.l, otherLine] : [otherLine, f.l]
  await begin(a); await begin(b)
  await a.ok(`UPDATE public.auto_linhas SET auto_id = '${high}' WHERE id = '${lowLine}'`)
  const pending = b.query(`UPDATE public.auto_linhas SET auto_id = '${low}' WHERE id = '${highLine}'`)
  const waited = await blocked(`${name}_b`, pending)
  // A espera da segunda transação deve ser no pai de menor UUID, mesmo vindo do maior.
  const waitingParent = sql(`SELECT am.id FROM pg_locks lk JOIN public.autos_medicao am ON am.ctid =
    ('(' || lk.page || ',' || lk.tuple || ')')::tid
    WHERE lk.locktype = 'tuple' AND lk.relation = 'public.autos_medicao'::regclass
      AND lk.pid = (SELECT pid FROM pg_stat_activity WHERE application_name = '${name}_b')`)
  await a.ok('COMMIT')
  assert.equal((await pending).error, '')
  await b.ok('COMMIT')
  assert.equal(waited, true, 'Ambos os pais devem ficar bloqueados')
  assert.equal(waitingParent, low, 'A troca deve começar pelo menor UUID')
  assert.equal(sql(`SELECT auto_id FROM public.auto_linhas WHERE id = '${lowLine}'`), high)
  assert.equal(sql(`SELECT auto_id FROM public.auto_linhas WHERE id = '${highLine}'`), low)
})

console.log(`Resultado: ${7 - failures.length}/7 cenários aprovados. Fixtures locais preservadas para inspeção.`)
if (failures.length) process.exitCode = 1
