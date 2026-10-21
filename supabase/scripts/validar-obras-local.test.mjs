// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as validator from './validar-obras-local.mjs'
const { assertLocalUrl } = validator

const script = fileURLToPath(new URL('./validar-obras-local.mjs', import.meta.url))

test('recusa destinos não locais antes de ler chaves ou fazer pedidos', () => {
  for (const url of ['https://example.invalid', 'http://127.0.0.1.example.invalid', 'http://localhost@remote.invalid', 'http://localhost/?remote=1', 'http://user:secret@localhost', 'http://localhost/api', 'https://localhost']) {
    const r = spawnSync(process.execPath, [script, '--bootstrap'], {
      encoding: 'utf8', env: { ...process.env, API_URL: url, OBRAS_LOCAL_STATUS: 'ficheiro-inexistente' }, timeout: 5000,
    })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Recusado: API_URL/)
    assert.doesNotMatch(r.stderr, /SERVICE_ROLE|Bearer|password|ENOENT/)
  }
})

test('aceita apenas origens loopback HTTP sem ler ambiente nem iniciar rede', () => {
  for (const origin of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
    assert.equal(assertLocalUrl(origin), origin)
    assert.equal(assertLocalUrl(`${origin}/`), origin)
  }
})

const readyDatabase = () => ({
  migration: true, objectGuard: true, photoTriggers: true, storageTrigger: true,
  parentLock: true, mfaGuard: true,
})

test('recusa ledger atualizado quando falta uma guarda real na base de dados', () => {
  for (const guard of ['objectGuard', 'photoTriggers', 'storageTrigger', 'parentLock', 'mfaGuard']) {
    assert.throws(() => validator.assertLocalDatabaseReady({ ...readyDatabase(), [guard]: false }), /Stack local sem/)
  }
})

test('recusa ledger ausente e aceita somente preflight integral', () => {
  assert.throws(() => validator.assertLocalDatabaseReady({ ...readyDatabase(), migration: false }), /migration T2/)
  assert.doesNotThrow(() => validator.assertLocalDatabaseReady(readyDatabase()))
})
