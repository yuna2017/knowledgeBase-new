#!/usr/bin/env node
/**
 * 需求反馈接口的回归测试。
 *
 * 为什么要留着它：`functions/api/feedback/[[path]].js` 里有鉴权（HMAC 会话）、
 * 限频、蜜罐判定这些**错了不会报错、只会静默放行或静默丢数据**的逻辑。
 * 之前这些用例是临时写完就删的，等于没有任何回归保护。
 *
 * 用 Node 自带的 `node:sqlite` 垫一个假 D1，直接调 Pages Function 的
 * onRequestGet / onRequestPost，不依赖 Cloudflare。
 *
 * 需要 Node ≥ 22.5（node:sqlite）。CI 里单独跑一个 Node 24 的 job，
 * 构建仍然留在 Node 20，互不影响。
 *
 * 跑法：npm run test:feedback
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const apiUrl = pathToFileURL(
  resolve(repoRoot, 'functions/api/feedback/[[path]].js')
).href

const { onRequestGet, onRequestPost, schemaStatements, CATEGORIES } = await import(apiUrl)

/* ------------------------------------------------------------------ 假 D1 */

const sqlite = new DatabaseSync(':memory:')

class Stmt {
  constructor(db, sql, params = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }
  bind(...params) {
    return new Stmt(this.db, this.sql, params)
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: Number(result.changes ?? 0) } }
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) }
  }
}

const DB = {
  prepare: (sql) => new Stmt(sqlite, sql),
  async batch(statements) {
    const out = []
    for (const statement of statements) out.push(await statement.run())
    return out
  }
}

const PASSWORD = 'avery-long-random-passphrase-for-tests'
const env = { DB, FEEDBACK_ADMIN_PASSWORD: PASSWORD }

/*
 * 先把表建上。等价于线上第一次请求时 ensureSchema() 做的事——
 * 它在一个 isolate 里只跑一次，所以这里也只在测试开始前建一次。
 * 传个「原样返回 SQL」的桩就能拿到 DDL 原文。
 */
for (const sql of schemaStatements({ prepare: (sql) => sql })) {
  sqlite.exec(sql)
}

/* ------------------------------------------------------------------ 请求工具 */

const BASE = 'https://docs.example.com'
const IP_A = { 'CF-Connecting-IP': '203.0.113.7' }
const IP_B = { 'CF-Connecting-IP': '203.0.113.8' }

function post(path, body, headers = {}) {
  return new Request(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}
function get(path, headers = {}) {
  return new Request(BASE + path, { headers })
}
const ctx = (request, extraEnv = {}) => ({ request, env: { ...env, ...extraEnv } })

const VALID = {
  category: '一卡通',
  kind: 'gap',
  want: '校园卡丢了怎么补办',
  scene: '饭卡刷不了，站内没找到流程',
  article: '',
  contact: 'qq123',
  elapsed: 9999
}

function rows(sql, ...params) {
  return sqlite.prepare(sql).all(...params)
}
function count(table) {
  return Number(sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n)
}

let cookie = null

beforeEach(async () => {
  sqlite.exec('DELETE FROM feedback')
  sqlite.exec('DELETE FROM feedback_login_attempts')
  cookie = null
  // 走一遍登录拿到会话，后面需要鉴权的用例复用
  const res = await onRequestPost(ctx(post('/api/feedback/login', { password: PASSWORD }, IP_A)))
  cookie = (res.headers.get('Set-Cookie') || '').split(';')[0]
})

/* ------------------------------------------------------------------ 表结构一致性 */

test('worker/schema.sql 与接口里的 schemaStatements() 是同一份定义', () => {
  const schemaSql = readFileSync(resolve(repoRoot, 'worker/schema.sql'), 'utf8')
  const fromFile = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && /create/i.test(s) && /feedback/i.test(s))

  // schemaStatements 只是把每条 DDL 包进 db.prepare()，传个记录的桩就能拿到原文
  const fromCode = schemaStatements({ prepare: (sql) => sql })

  assert.equal(fromFile.length, 4, 'schema.sql 里应当有 4 条 feedback 相关 DDL，实际 ' + fromFile.length)
  assert.equal(fromCode.length, 4)

  const fileDb = new DatabaseSync(':memory:')
  const codeDb = new DatabaseSync(':memory:')
  for (const sql of fromFile) fileDb.exec(sql)
  for (const sql of fromCode) codeDb.exec(sql)

  for (const table of ['feedback', 'feedback_login_attempts']) {
    const a = fileDb.prepare('PRAGMA table_info(' + table + ')').all()
    const b = codeDb.prepare('PRAGMA table_info(' + table + ')').all()
    const shape = (list) => list.map((c) => c.name + ':' + c.type + ':' + c.notnull + ':' + (c.dflt_value ?? ''))
    assert.deepEqual(
      shape(a),
      shape(b),
      table + ' 两份定义不一致：文件 ' + JSON.stringify(shape(a)) + ' / 代码 ' + JSON.stringify(shape(b))
    )
  }
})

test('feedback 表的列齐全（少一列就说明迁移没跟上）', () => {
  const names = rows('PRAGMA table_info(feedback)').map((c) => c.name)
  assert.deepEqual(names, [
    'id', 'category', 'kind', 'want', 'scene', 'article', 'contact',
    'status', 'resolved_label', 'resolved_url', 'suspicious',
    'ip_hash', 'created_at', 'updated_at'
  ])
})

/* ------------------------------------------------------------------ 提交 */

test('正常提交写入一行，状态是 new，不可疑', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  assert.equal(res.status, 200)
  const row = rows('SELECT * FROM feedback')[0]
  assert.equal(row.want, VALID.want)
  assert.equal(row.status, 'new')
  assert.equal(Number(row.suspicious), 0)
  assert.equal(row.contact, 'qq123')
  assert.ok(Number(row.created_at) > 0)
})

test('蜜罐被填：仍然入库，但标记为可疑（不丢数据）', async () => {
  const res = await onRequestPost(
    ctx(post('/api/feedback', { ...VALID, fb_trap: 'http://spam.example' }, IP_A))
  )
  assert.equal(res.status, 200)
  assert.equal(count('feedback'), 1, '蜜罐命中也不该丢')
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
})

test('填得太快：仍然入库，但标记为可疑（不丢数据）', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback', { ...VALID, elapsed: 120 }, IP_A)))
  assert.equal(res.status, 200)
  assert.equal(count('feedback'), 1, '填得快也不该丢')
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
})

test('没有 elapsed（无 JS 的原生提交）不判可疑', async () => {
  const body = new URLSearchParams({
    category: '校园网', kind: 'gap', want: '宿舍网口坏了', scene: '断网三天'
  })
  const res = await onRequestPost(ctx(new Request(BASE + '/api/feedback', { method: 'POST', body })))
  assert.equal(res.status, 303)
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 0)
})

test('字段校验：空 want / 空 scene / 非法分类 / 非法 kind 都是 400 且不写库', async () => {
  const cases = [
    { ...VALID, want: '' },
    { ...VALID, scene: '' },
    { ...VALID, category: '不存在的分类' },
    { ...VALID, kind: 'nope' }
  ]
  for (const body of cases) {
    const res = await onRequestPost(ctx(post('/api/feedback', body, IP_A)))
    assert.equal(res.status, 400, JSON.stringify(body))
  }
  assert.equal(count('feedback'), 0)
})

test('「缺口」不带「针对哪一篇」，即使请求里塞了也不存', async () => {
  await onRequestPost(ctx(post('/api/feedback', {
    ...VALID, kind: 'gap', article: '/campus-card'
  }, IP_A)))
  assert.equal(rows('SELECT article FROM feedback')[0].article, null)
})

test('「勘误」保留「针对哪一篇」', async () => {
  await onRequestPost(ctx(post('/api/feedback', {
    ...VALID, kind: 'fix', article: '/campus-card'
  }, IP_A)))
  assert.equal(rows('SELECT article FROM feedback')[0].article, '/campus-card')
})

test('表单编码提交返回 303 且跳 /wanted-done', async () => {
  const body = new URLSearchParams({
    category: '一卡通', kind: 'fix', want: '补办地点变了', scene: '照着文章跑空',
    article: '/campus-card', fb_trap: ''
  })
  const res = await onRequestPost(ctx(new Request(BASE + '/api/feedback', { method: 'POST', body })))
  assert.equal(res.status, 303)
  assert.ok((res.headers.get('Location') || '').endsWith('/wanted-done'))
  assert.equal(rows('SELECT article FROM feedback')[0].article, '/campus-card')
})

test('表单编码 + 校验失败跳回 /wanted?error=1', async () => {
  const body = new URLSearchParams({ category: '一卡通', kind: 'gap', want: '', scene: '' })
  const res = await onRequestPost(ctx(new Request(BASE + '/api/feedback', { method: 'POST', body })))
  assert.equal(res.status, 303)
  assert.ok((res.headers.get('Location') || '').indexOf('/wanted?error=1') >= 0)
})

/* ------------------------------------------------------------------ 限频 */

test('短时间内超过 10 条触发限频（429），且不写库', async () => {
  const ip = { 'CF-Connecting-IP': '198.51.100.9' }
  for (let i = 0; i < 10; i += 1) {
    const res = await onRequestPost(ctx(post('/api/feedback', VALID, ip)))
    assert.equal(res.status, 200, '第 ' + (i + 1) + ' 条被拒了')
  }
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, ip)))
  assert.equal(res.status, 429)
  assert.equal(count('feedback'), 10)
})

test('换一个来源不受影响（校园网 NAT 场景下额度按 IP 算）', async () => {
  const ip = { 'CF-Connecting-IP': '198.51.100.10' }
  for (let i = 0; i < 10; i += 1) {
    await onRequestPost(ctx(post('/api/feedback', VALID, ip)))
  }
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, IP_B)))
  assert.equal(res.status, 200)
})

/* ------------------------------------------------------------------ 鉴权 */

test('未登录读明细 / 改名 / 删除都是 401', async () => {
  for (const [path, body] of [
    ['/api/feedback/list', null],
    ['/api/feedback/update', { id: 1, status: 'planned' }],
    ['/api/feedback/delete', { id: 1 }]
  ]) {
    const res = body
      ? await onRequestPost(ctx(post(path, body)))
      : await onRequestGet(ctx(get(path)))
    assert.equal(res.status, 401, path + ' 应当 401，实际 ' + res.status)
  }
})

test('密码正确下发 HttpOnly + Secure + SameSite=Strict + Path 受限的 Cookie', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback/login', { password: PASSWORD }, IP_A)))
  assert.equal(res.status, 200)
  const raw = res.headers.get('Set-Cookie') || ''
  for (const needle of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/feedback']) {
    assert.ok(raw.indexOf(needle) >= 0, 'Cookie 缺少 ' + needle)
  }
})

test('密码错误 401；连续 5 次后锁定，锁定期内即使密码正确也 429', async () => {
  const ip = { 'CF-Connecting-IP': '198.51.100.200' }
  for (let i = 0; i < 5; i += 1) {
    const res = await onRequestPost(ctx(post('/api/feedback/login', { password: 'wrong' }, ip)))
    assert.equal(res.status, 401, '第 ' + (i + 1) + ' 次')
  }
  const locked = await onRequestPost(ctx(post('/api/feedback/login', { password: PASSWORD }, ip)))
  assert.equal(locked.status, 429)
  assert.equal(typeof (await locked.json()).retryAfterMinutes, 'number')
})

test('篡改会话令牌 401', async () => {
  assert.ok(cookie, '前置登录没成功')
  const tampered = cookie.slice(0, -2) + 'xx'
  const res = await onRequestGet(ctx(get('/api/feedback/list', { Cookie: tampered })))
  assert.equal(res.status, 401)
})

test('伪造过期时间但不重签 401', async () => {
  const forged = 'kb_feedback_admin=' + (Date.now() + 9e8) + '.' + 'a'.repeat(43)
  const res = await onRequestGet(ctx(get('/api/feedback/list', { Cookie: forged })))
  assert.equal(res.status, 401)
})

test('没配 FEEDBACK_ADMIN_PASSWORD：审计接口 503，提交照常，且绝不等于无鉴权', async () => {
  const noPassword = { FEEDBACK_ADMIN_PASSWORD: undefined }
  const login = await onRequestPost(ctx(post('/api/feedback/login', { password: 'x' }, IP_A), noPassword))
  assert.equal(login.status, 503)

  const session = await onRequestGet(ctx(get('/api/feedback/session'), noPassword))
  assert.equal((await session.json()).configured, false)

  const list = await onRequestGet(ctx(get('/api/feedback/list'), noPassword))
  assert.equal(list.status, 401, '没配密码时必须是 401，不能放行')

  const submit = await onRequestPost(
    ctx(post('/api/feedback', VALID, { 'CF-Connecting-IP': '192.0.2.55' }), noPassword)
  )
  assert.equal(submit.status, 200)
})

/* ------------------------------------------------------------------ 审计改动 */

test('改状态', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, status: 'planned' }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal(rows('SELECT status FROM feedback WHERE id = ?', id)[0].status, 'planned')
})

test('改分类（聚合的键，选错必须能改回来）', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, category: '宿舍' }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal(rows('SELECT category FROM feedback WHERE id = ?', id)[0].category, '宿舍')
})

test('非法分类被 400 拒绝', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, category: 'x' }, { Cookie: cookie }))
  )
  assert.equal(res.status, 400)
})

test('已上线链接：接受站内路径和 https，拒绝 javascript:', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id

  const bad = await onRequestPost(
    ctx(post('/api/feedback/update', { id, resolvedUrl: 'javascript:alert(1)' }, { Cookie: cookie }))
  )
  assert.equal(bad.status, 400, 'javascript: 必须被拒')

  const good = await onRequestPost(
    ctx(post('/api/feedback/update', {
      id, status: 'done', resolvedLabel: '校园卡补办流程', resolvedUrl: '/campus-card'
    }, { Cookie: cookie }))
  )
  assert.equal(good.status, 200)
  const row = rows('SELECT * FROM feedback WHERE id = ?', id)[0]
  assert.equal(row.resolved_url, '/campus-card')
  assert.equal(row.resolved_label, '校园卡补办流程')
})

test('状态从「已上线」退回时清掉公开链接，避免留过期链接', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  await onRequestPost(ctx(post('/api/feedback/update', {
    id, status: 'done', resolvedLabel: 'X', resolvedUrl: '/x'
  }, { Cookie: cookie })))

  await onRequestPost(ctx(post('/api/feedback/update', { id, status: 'planned' }, { Cookie: cookie })))
  const row = rows('SELECT * FROM feedback WHERE id = ?', id)[0]
  assert.equal(row.status, 'planned')
  assert.equal(row.resolved_url, null)
  assert.equal(row.resolved_label, null)
})

test('删除单条', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/delete', { id }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal(count('feedback'), 0)
})

test('一键删掉全部可疑，正常条目不受影响', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_B)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, elapsed: 10 }, IP_B)))
  assert.equal(count('feedback'), 3)

  const res = await onRequestPost(
    ctx(post('/api/feedback/delete', { allSuspicious: true }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal((await res.json()).deleted, 2)
  assert.equal(count('feedback'), 1)
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 0)
})

test('审计列表带出新增字段，并按「可疑排最后」返回', async () => {
  await onRequestPost(ctx(post('/api/feedback', {
    ...VALID, kind: 'fix', want: '补办地点变了', article: '/campus-card'
  }, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_B)))

  const res = await onRequestGet(ctx(get('/api/feedback/list', { Cookie: cookie })))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.items.length, 2)
  assert.equal(data.items[0].suspicious, false, '正常条目应排在前面')
  assert.equal(data.items[0].article, '/campus-card')
  assert.equal(data.summary.total, 1)
  assert.equal(data.summary.suspicious, 1)
})

/* ------------------------------------------------------------------ 公开统计 */

test('统计接口不需要登录', async () => {
  const res = await onRequestGet(ctx(get('/api/feedback/stats')))
  assert.equal(res.status, 200)
})

test('统计数据不含用户原文和联系方式', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const raw = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.text())
  for (const secret of [VALID.want, VALID.scene, VALID.contact]) {
    assert.ok(raw.indexOf(secret) < 0, '统计接口泄露了：' + secret)
  }
})

test('统计不含可疑条目，但审计列表能看到', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_B)))

  const stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.equal(stats.total, 1, '可疑条目不该计入公开统计')

  const list = await onRequestGet(ctx(get('/api/feedback/list', { Cookie: cookie }))).then((r) => r.json())
  assert.equal(list.items.length, 2, '但审计页要看得到，否则无法清理')
})

test('统计带出「已上线」的标签与链接，且只带填了链接的', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, want: '另一条' }, IP_B)))
  const ids = rows('SELECT id FROM feedback ORDER BY id').map((r) => r.id)

  await onRequestPost(ctx(post('/api/feedback/update', {
    id: ids[0], status: 'done', resolvedLabel: '校园卡补办', resolvedUrl: '/campus-card'
  }, { Cookie: cookie })))
  await onRequestPost(ctx(post('/api/feedback/update', {
    id: ids[1], status: 'done'
  }, { Cookie: cookie })))

  const stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.deepEqual(stats.published, [
    { category: '一卡通', label: '校园卡补办', url: '/campus-card' }
  ])
})

test('统计按分类聚合，状态分列', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, want: '再来一条' }, IP_A)))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, category: '校园网' }, IP_B)))

  const stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.equal(stats.total, 3)
  assert.equal(stats.byCategory[0].category, '一卡通')
  assert.equal(stats.byCategory[0].total, 2)
  assert.equal(stats.byCategory[0].byStatus.new, 2)
})

/* ------------------------------------------------------------------ 机器人验证 */

/**
 * 把 siteverify 的响应换成我们指定的。返回一个还原函数。
 * 只拦 siteverify，别的 fetch 原样放行。
 */
function stubSiteverify(impl) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).indexOf('siteverify') >= 0) return impl(url, init)
    return original(url, init)
  }
  return () => {
    globalThis.fetch = original
  }
}

const siteverifyJson = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const TURNSTILE_ENV = { TURNSTILE_SECRET_KEY: 'test-secret' }
const TOKEN = { ...VALID, 'cf-turnstile-response': 'token-abc' }

test('没配 secret：功能关闭，带不带令牌都正常入库', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  assert.equal(res.status, 200)
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 0)
})

test('验证通过：正常入库，不可疑', async () => {
  const restore = stubSiteverify(async () => siteverifyJson({
    success: true, hostname: 'docs.yuna.team', action: 'feedback'
  }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 0)
  } finally {
    restore()
  }
})

test('令牌无效：这是唯一会拒的情况，且不写库', async () => {
  const restore = stubSiteverify(async () => siteverifyJson({
    success: false, 'error-codes': ['invalid-input-response']
  }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 400)
    assert.equal(count('feedback'), 0)
  } finally {
    restore()
  }
})

test('令牌是别的 action 签的：当成无效拒掉', async () => {
  const restore = stubSiteverify(async () => siteverifyJson({
    success: true, hostname: 'docs.yuna.team', action: 'login'
  }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 400)
    assert.equal(count('feedback'), 0)
  } finally {
    restore()
  }
})

test('没有令牌：照收但标可疑（可能是没跑 JS 的真用户）', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A), TURNSTILE_ENV))
  assert.equal(res.status, 200, '不能因为没令牌就拒')
  assert.equal(count('feedback'), 1, '更不能丢')
  assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
})

test('siteverify 连不上：照收但标可疑，验证服务挂了不能把表单拖死', async () => {
  const restore = stubSiteverify(async () => {
    throw new TypeError('network error')
  })
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(count('feedback'), 1)
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
  } finally {
    restore()
  }
})

test('siteverify 超时（AbortError）：同样降级为可疑而不是拒', async () => {
  const restore = stubSiteverify(async () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  })
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
  } finally {
    restore()
  }
})

test('siteverify 返回 internal-error：算服务不可用，不算令牌无效', async () => {
  const restore = stubSiteverify(async () => siteverifyJson({
    success: false, 'error-codes': ['internal-error']
  }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200, 'internal-error 不该拒用户')
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
  } finally {
    restore()
  }
})

test('siteverify 返回 5xx：同样降级', async () => {
  const restore = stubSiteverify(async () => new Response('boom', { status: 502 }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
  } finally {
    restore()
  }
})

test('原生表单路径 + 令牌无效：跳 /wanted?error=verify', async () => {
  const restore = stubSiteverify(async () => siteverifyJson({
    success: false, 'error-codes': ['timeout-or-duplicate']
  }))
  try {
    const body = new URLSearchParams({
      category: '一卡通', kind: 'gap', want: 'x', scene: 'y',
      'cf-turnstile-response': 'used-token'
    })
    const res = await onRequestPost(ctx(
      new Request(BASE + '/api/feedback', { method: 'POST', body }),
      TURNSTILE_ENV
    ))
    assert.equal(res.status, 303)
    assert.ok((res.headers.get('Location') || '').indexOf('/wanted?error=verify') >= 0)
  } finally {
    restore()
  }
})

test('令牌字段名前后端一致', () => {
  const api = readFileSync(resolve(repoRoot, 'functions/api/feedback/[[path]].js'), 'utf8')
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  // Turnstile 自己塞的隐藏 input 默认就叫这个名字，两边都得用同一个
  assert.ok(api.includes("'cf-turnstile-response'"), '接口没读这个字段')
  assert.ok(form.includes('cf-turnstile-response'), '表单没带上这个字段')
})

test('TURNSTILE_ACTION 前后端一致', () => {
  const api = readFileSync(resolve(repoRoot, 'functions/api/feedback/[[path]].js'), 'utf8')
  const shared = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/shared/turnstile.ts'),
    'utf8'
  )
  const fromApi = api.match(/const TURNSTILE_ACTION = '([^']+)'/)
  const fromShared = shared.match(/export const TURNSTILE_ACTION = '([^']+)'/)
  assert.ok(fromApi && fromShared, '两边都要有 TURNSTILE_ACTION')
  assert.equal(fromShared[1], fromApi[1], 'action 对不上会导致所有令牌被判无效')
})

/* ------------------------------------------------------------------ 路由 */

test('未知路径 404', async () => {
  const res = await onRequestGet(ctx(get('/api/feedback/nope')))
  assert.equal(res.status, 404)
})

test('分类枚举与前端一致（前端那份是手抄的）', () => {
  const source = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  const match = source.match(/const CATEGORIES = \[([\s\S]*?)\]/)
  assert.ok(match, '没在 FeedbackForm.vue 里找到 CATEGORIES')
  const fromClient = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(fromClient, CATEGORIES, '前后端分类枚举不一致')
})
