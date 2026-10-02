import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as contract from '../shared/feedback-contract.js'
import * as submission from '../shared/feedback-submission.js'

// Execute the actual SFC script with browser IO substituted. This covers retry
// and recovery behavior; rendering is covered by the site's build/smoke checks.
const file = new URL('../vitepress-docs/.vitepress/theme/FeedbackForm.vue', import.meta.url)
const { descriptor } = parse(readFileSync(file, 'utf8'))
const compiled = ts.transpileModule(descriptor.scriptSetup.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText

const DRAFT = 'kb-feedback-draft-v2'
const PENDING = 'kb-feedback-pending-v2'
const receipt = 'ABCD-EFGH'
const payload = { category: '一卡通', kind: 'gap', want: '补办校园卡', scene: '卡丢了', article: '', contact: '', elapsed: 9000 }

function harness(fetch, storage = new Map()) {
  const redirects = []
  const context = vm.createContext({
    exports: {},
    require(name) {
      if (name === 'vue') return { ref: (value) => ({ value }), onMounted() {} }
      if (name.endsWith('feedback-contract.js')) return contract
      if (name.endsWith('feedback-submission.js')) return submission
      if (name.endsWith('/shared/contact')) return { QQ_GROUP: { number: 'test', joinUrl: '/' } }
      throw new Error('Unexpected component import ' + name)
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    fetch,
    AbortController,
    // Run retry backoff immediately; request timeout remains inert in this fixture.
    setTimeout(callback, ms) { if (ms < 15000) queueMicrotask(callback); return 1 },
    clearTimeout() {},
    window: { location: { assign: (url) => redirects.push(url) } }
  })
  vm.runInContext(compiled + `\n globalThis.form = {
    submit, flushPending, saveDraft,
    category, kind, want, scene, article, contact, sending, receiptTicket, message
  }`, context)
  const form = context.form
  for (const name of ['category', 'kind', 'want', 'scene', 'article', 'contact']) form[name].value = payload[name]
  return { form, storage, redirects }
}

test('表单先保存待发，再重试同一 ID；拿到完整回执才清草稿跳转', async () => {
  const bodies = []
  const storage = new Map()
  const { form, redirects } = harness(async (_url, options) => {
    const body = JSON.parse(options.body)
    bodies.push(body)
    assert.equal(JSON.parse(storage.get(PENDING)).requestId, body.requestId)
    if (bodies.length === 1) throw new Error('response lost')
    return Response.json({ ok: true, ticket: receipt })
  }, storage)
  form.saveDraft()
  await form.submit()
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].requestId, bodies[1].requestId)
  assert.equal(storage.has(PENDING), false)
  assert.equal(storage.has(DRAFT), false)
  assert.deepEqual(redirects, ['/wanted-done?t=' + receipt])
})

test('200 缺失回执时保留草稿和稳定 ID，手动重试不会建立新提交', async () => {
  const bodies = []
  const { form, storage, redirects } = harness(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return Response.json({ ok: true })
  })
  form.saveDraft()
  await form.submit()
  await form.submit()
  assert.equal(bodies.length, 6)
  assert.equal(new Set(bodies.map((body) => body.requestId)).size, 1)
  assert.equal(storage.has(DRAFT), true)
  assert.equal(storage.has(PENDING), true)
  assert.equal(redirects.length, 0)
  assert.equal(form.sending.value, false)
})

test('刷新后补发保留 ID，成功会显示查询码且不会清除另一份新草稿', async () => {
  const pending = { ...payload, requestId: crypto.randomUUID() }
  const newer = { ...payload, want: '后来另写的一条' }
  const storage = new Map([[PENDING, JSON.stringify(pending)], [DRAFT, JSON.stringify(newer)]])
  const { form, redirects } = harness(async (_url, options) => {
    assert.equal(JSON.parse(options.body).requestId, pending.requestId)
    assert.ok(storage.has(PENDING), 'request must remain persisted while in flight')
    return Response.json({ ok: true, ticket: receipt })
  }, storage)
  await form.flushPending()
  assert.equal(form.receiptTicket.value, receipt)
  assert.ok(form.message.value.includes(receipt))
  assert.equal(storage.has(PENDING), false)
  assert.equal(JSON.parse(storage.get(DRAFT)).want, newer.want)
  assert.equal(redirects.length, 0)
})

test('只有待发没有草稿时恢复字段，补发失败后仍能用原 ID 手动重试', async () => {
  const pending = { ...payload, requestId: crypto.randomUUID() }
  const storage = new Map([[PENDING, JSON.stringify(pending)]])
  const bodies = []
  const { form } = harness(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    if (bodies.length === 1) throw new Error('offline')
    return Response.json({ ok: true, ticket: receipt })
  }, storage)
  form.category.value = form.want.value = form.scene.value = ''
  await form.flushPending()
  assert.equal(form.want.value, pending.want)
  await form.submit()
  assert.equal(bodies[1].requestId, pending.requestId)
})
