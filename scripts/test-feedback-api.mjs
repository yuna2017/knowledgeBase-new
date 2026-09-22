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

const { onRequestGet, onRequestPost, schemaStatements, bootstrapSchema, CATEGORIES } =
  await import(apiUrl)

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

  assert.equal(fromFile.length, 5, 'schema.sql 里应当有 5 条 feedback 相关 DDL，实际 ' + fromFile.length)
  assert.equal(fromCode.length, 5)

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
    'status', 'resolved_label', 'resolved_url', 'reject_reason', 'suspicious',
    'flag_reason', 'ip_hash', 'created_at', 'updated_at', 'ticket'
  ])
})

/**
 * 上面那条测试是从零建表，永远比不出「线上老库缺列」。
 * 这条专门模拟线上那张早先建好的表：只要它缺 flag_reason / ticket，
 * INSERT 就会 `no such column` —— 表现是**所有提交 500、审计页 500**，
 * 而 ensureSchema 的报错是被吞掉的，症状会藏得很深。
 * （真实踩过：加了 ticket 和 flag_reason 两列，都只改 DDL 没写 ALTER。）
 */
test('老库缺列时会把 ticket / flag_reason 补上，老数据不丢', async () => {
  const legacy = new DatabaseSync(':memory:')
  legacy.exec(
    `CREATE TABLE feedback (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       category   TEXT    NOT NULL,
       kind       TEXT    NOT NULL,
       want       TEXT    NOT NULL,
       scene      TEXT    NOT NULL,
       contact    TEXT,
       status     TEXT    NOT NULL DEFAULT 'new',
       ip_hash    TEXT,
       created_at INTEGER NOT NULL
     )`
  )
  legacy.exec(
    `INSERT INTO feedback (category, kind, want, scene, created_at)
     VALUES ('其他', 'gap', '迁移前的老稿子', '场景', 1)`
  )
  const legacyDb = {
    prepare: (sql) => new Stmt(legacy, sql),
    async batch(statements) {
      const out = []
      for (const statement of statements) out.push(await statement.run())
      return out
    }
  }

  await bootstrapSchema(legacyDb)

  const sorted = (list) => [...list].sort()
  const names = legacy.prepare('PRAGMA table_info(feedback)').all().map((c) => c.name)
  assert.ok(names.includes('flag_reason'), 'flag_reason 没补上：INSERT 会 no such column')
  assert.ok(names.includes('ticket'), 'ticket 没补上：唯一索引本身就会报错')
  assert.deepEqual(
    sorted(names),
    sorted(rows('PRAGMA table_info(feedback)').map((c) => c.name)),
    '补完之后列应当和新库完全一致'
  )
  assert.equal(Number(legacy.prepare('SELECT COUNT(*) AS n FROM feedback').get().n), 1, '老数据不能丢')

  // 补完之后真的能按新列写入 —— 这就是线上那一步 500
  legacy.exec(
    `INSERT INTO feedback
       (ticket, category, kind, want, scene, status, suspicious, flag_reason, ip_hash, created_at, updated_at)
     VALUES ('AAAA-BBBB', '其他', 'gap', 'x', 'y', 'new', 0, 'no_token', 'h', 1, 1)`
  )
  assert.equal(Number(legacy.prepare('SELECT COUNT(*) AS n FROM feedback').get().n), 2)

  // 幂等：isolate 冷启动可能重跑，重跑不该报错
  await bootstrapSchema(legacyDb)
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

test('表单编码提交返回 303 且带着查询码跳 /wanted-done', async () => {
  const body = new URLSearchParams({
    category: '一卡通', kind: 'fix', want: '补办地点变了', scene: '照着文章跑空',
    article: '/campus-card', fb_trap: ''
  })
  const res = await onRequestPost(ctx(new Request(BASE + '/api/feedback', { method: 'POST', body })))
  assert.equal(res.status, 303)
  const location = res.headers.get('Location') || ''
  assert.ok(location.indexOf('/wanted-done?t=') >= 0, '跳转地址是 ' + location)
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

test('分类不可修改：审计页只能看，传上来也拒', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, category: '宿舍' }, { Cookie: cookie }))
  )
  assert.equal(res.status, 400)
  assert.equal(rows('SELECT category FROM feedback WHERE id = ?', id)[0].category, '一卡通')
})

test('分类不可修改，但不影响同一次请求里改状态', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id
  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, status: 'planned' }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
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

test('「不采纳」可以写原因，提交者凭编号能看到', async () => {
  const submitted = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const ticket = (await submitted.json()).ticket
  const id = rows('SELECT id FROM feedback')[0].id

  const res = await onRequestPost(
    ctx(post('/api/feedback/update', {
      id, status: 'rejected', rejectReason: '这个属于院系内部流程，站里写不了'
    }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal(
    rows('SELECT reject_reason FROM feedback WHERE id = ?', id)[0].reject_reason,
    '这个属于院系内部流程，站里写不了'
  )

  const lookup = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket)))
  const data = await lookup.json()
  assert.equal(data.status, 'rejected')
  assert.equal(data.rejectReason, '这个属于院系内部流程，站里写不了')
})

test('没写原因时接口返回空串，兜底文案由页面给（提交者看到的不能是空白）', async () => {
  const submitted = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const ticket = (await submitted.json()).ticket
  const id = rows('SELECT id FROM feedback')[0].id

  await onRequestPost(ctx(post('/api/feedback/update', { id, status: 'rejected' }, { Cookie: cookie })))
  const data = await (await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket)))).json()
  assert.equal(data.status, 'rejected')
  assert.equal(data.rejectReason, '')

  // 审计页也要能拿到这个字段（空串），否则那个输入框绑不上
  const list = await (await onRequestGet(ctx(get('/api/feedback/list', { Cookie: cookie })))).json()
  assert.equal(list.items[0].rejectReason, '')
})

test('不采纳的原因：能从「已上线」这类状态里写、退回别的状态会被清掉、超长会截断', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id

  // 同一次请求里既改状态又写原因
  await onRequestPost(
    ctx(post('/api/feedback/update', { id, status: 'rejected', rejectReason: '没这个必要' }, { Cookie: cookie }))
  )
  assert.equal(rows('SELECT reject_reason FROM feedback WHERE id = ?', id)[0].reject_reason, '没这个必要')

  // 超过 200 字截断，不是 400
  await onRequestPost(
    ctx(post('/api/feedback/update', { id, rejectReason: 'x'.repeat(500) }, { Cookie: cookie }))
  )
  assert.equal(rows('SELECT reject_reason FROM feedback WHERE id = ?', id)[0].reject_reason.length, 200)

  // 退回别的状态：原因清掉，免得提交者看到一条对不上的说明
  await onRequestPost(ctx(post('/api/feedback/update', { id, status: 'planned' }, { Cookie: cookie })))
  const row = rows('SELECT status, reject_reason FROM feedback WHERE id = ?', id)[0]
  assert.equal(row.status, 'planned')
  assert.equal(row.reject_reason, null)

  // 空串等于清掉
  await onRequestPost(ctx(post('/api/feedback/update', { id, status: 'rejected', rejectReason: '先写一句' }, { Cookie: cookie })))
  await onRequestPost(ctx(post('/api/feedback/update', { id, rejectReason: '' }, { Cookie: cookie })))
  assert.equal(rows('SELECT reject_reason FROM feedback WHERE id = ?', id)[0].reject_reason, null)
})

test('「不采纳原因」的输入框在状态切到不采纳时才出现（和已上线那套一样）', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackAudit.vue'),
    'utf8'
  )
  assert.ok(
    form.includes("v-else-if=\"item.status === 'rejected'\""),
    '审计页缺少「不采纳」的输入框'
  )
  assert.ok(form.includes('saveRejectReason'), '缺少保存原因的调用')
  // 提交者那边必须有兜底：没写原因时显示一句人话，而不是空白
  const lookup = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackLookup.vue'),
    'utf8'
  )
  assert.ok(lookup.includes('rejectReason'), '查询页没有显示不采纳原因')
  assert.ok(
    lookup.includes('没有写明原因'),
    '查询页缺少「维护者没写原因」时的兜底文案'
  )
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

test('一键删掉蜜罐与过快，正常条目不受影响', async () => {
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

/* ------------------------------------------------------------------ 审计列表：分页与筛选 */

/** 绕过接口直接塞数据，用来造分页/筛选场景（走接口会被限频挡住） */
let seedRun = 0
function seedRows(total, fields = {}) {
  seedRun += 1
  const batch = String(seedRun).padStart(2, '0')
  const statement = sqlite.prepare(
    `INSERT INTO feedback
       (ticket, category, kind, want, scene, status, suspicious, flag_reason, ip_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (let i = 0; i < total; i += 1) {
    statement.run(
      // ticket 上有唯一索引：同一次测试里 seedRows 可能被调多次，得带上批次号
      'SEED' + batch + '-' + String(i).padStart(3, '0'),
      fields.category ?? '其他',
      fields.kind ?? 'gap',
      (fields.want ?? '内容') + i,
      fields.scene ?? '场景',
      fields.status ?? 'new',
      fields.suspicious ?? 0,
      fields.flagReason ?? null,
      'seed',
      fields.createdAt ?? 1000 + i,
      fields.createdAt ?? 1000 + i
    )
  }
}

async function listAs(query = '') {
  const res = await onRequestGet(ctx(get('/api/feedback/list' + query, { Cookie: cookie })))
  assert.equal(res.status, 200, 'list 应当返回 200，query=' + query)
  return res.json()
}

test('审计列表分页：默认每页 20 条，越界页码夹回最后一页', async () => {
  seedRows(45)

  const first = await listAs()
  assert.equal(first.items.length, 20, '默认每页 20 条 —— 一页塞上千条既卡浏览器也看不清')
  assert.equal(first.page, 1)
  assert.equal(first.per, 20)
  assert.equal(first.pages, 3)
  assert.equal(first.filtered, 45)

  assert.equal((await listAs('?page=3')).items.length, 5)
  assert.equal((await listAs('?page=99')).page, 3, '越界页码夹回最后一页，而不是回空列表')
  assert.equal((await listAs('?page=0')).page, 1)

  // 每页条数只认白名单，乱传就回默认值（防 ?per=100000）
  assert.equal((await listAs('?per=5000')).per, 20)
  assert.equal((await listAs('?per=50')).per, 50)
  assert.equal((await listAs('?per=50')).items.length, 45)

  // 翻页不该出现重复行
  const page1 = (await listAs('?page=1&per=20')).items.map((item) => item.id)
  const page2 = (await listAs('?page=2&per=20')).items.map((item) => item.id)
  assert.equal(new Set([...page1, ...page2]).size, 40)
})

test('分页的排序是稳定的：同一毫秒的两条不会重复出现、也不会漏掉', async () => {
  // created_at 一样时，只按它排序的话 SQLite 给的顺序不保证稳定，
  // OFFSET 分页就会让某条在两个页码里各出现一次，另一条永远看不到
  seedRows(45, { createdAt: 5000 })

  const all = []
  for (const pageNo of [1, 2, 3]) {
    const list = await listAs('?page=' + pageNo + '&per=20')
    all.push(...list.items.map((item) => item.id))
  }
  assert.equal(all.length, 45)
  assert.equal(new Set(all).size, 45, '三个页码拼起来必须正好是全部 45 条，不重不漏')

  // 越界页码是「夹回最后一页」而不是返回空——空列表会被误读成「筛选没结果」
  const over = await listAs('?page=4&per=20')
  assert.equal(over.page, 3)
  assert.equal(over.items.length, 5)
})

test('审计列表的筛选在服务端生效，非法值直接 400', async () => {
  seedRows(30, { category: '宿舍' })
  seedRows(5, { category: '图书馆', kind: 'fix', status: 'done' })

  assert.equal((await listAs('?category=' + encodeURIComponent('图书馆'))).filtered, 5)
  assert.ok(
    (await listAs('?category=' + encodeURIComponent('图书馆'))).items.every(
      (item) => item.category === '图书馆'
    )
  )
  assert.equal((await listAs('?kind=fix')).filtered, 5)
  assert.equal((await listAs('?status=done')).filtered, 5)
  assert.equal(
    (await listAs('?kind=fix&status=done&category=' + encodeURIComponent('图书馆'))).filtered,
    5
  )

  for (const bad of ['?status=nope', '?kind=nope', '?category=nope', '?suspicious=nope']) {
    const res = await onRequestGet(ctx(get('/api/feedback/list' + bad, { Cookie: cookie })))
    assert.equal(res.status, 400, bad + ' 应当被拒，而不是静默返回全表')
  }
})

test('审计列表的搜索词按字面量处理（% 和 _ 不当通配符）', async () => {
  seedRows(3, { want: '百分之百' })
  seedRows(2, { want: '别的' })

  assert.equal((await listAs('?q=' + encodeURIComponent('百分之'))).filtered, 3)
  // 没转义的话，一个 % 会把 5 条全捞出来
  assert.equal((await listAs('?q=' + encodeURIComponent('%'))).filtered, 0)
  assert.equal((await listAs('?q=' + encodeURIComponent('_'))).filtered, 0)
})

test('审计列表的「只看可疑 / 只看正常」', async () => {
  seedRows(4)
  seedRows(2, { suspicious: 1, flagReason: 'no_token' })

  assert.equal((await listAs('?suspicious=only')).filtered, 2)
  assert.equal((await listAs('?suspicious=hide')).filtered, 4)
  assert.equal((await listAs()).filtered, 6)
})

test('summary 是全表统计：不跟着筛选和分页变', async () => {
  seedRows(30, { category: '宿舍' })
  seedRows(3, { suspicious: 1, flagReason: 'no_token' })
  seedRows(2, { suspicious: 1, flagReason: 'trap' })

  const page = await listAs('?category=' + encodeURIComponent('宿舍'))
  assert.equal(page.filtered, 30, '筛选后的条数')
  assert.equal(page.items.length, 20, '但一页只给 20 条')

  const summary = page.summary
  assert.equal(summary.total, 30, '正常条目是全表统计，不跟着筛选变')
  assert.equal(summary.suspicious, 5)
  assert.equal(summary.unverified, 3)
  assert.equal(summary.deletable, 2, '批量删会删掉的是 trap / fast 那 2 条')
  assert.deepEqual(summary.byStatus, { new: 30, planned: 0, done: 0, rejected: 0 })
  assert.equal(summary.byKind.gap, 30)

  // 顶部数字和列表条数不再是同一个东西（以前都在同一批 items 上算，超过上限就对不上）
  assert.notEqual(page.filtered, summary.suspicious + page.items.length)
})

/* ------------------------------------------------------------------ 查询码与提交者自查 */

const TICKET_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/

async function submitAndGetTicket(ip = IP_A) {
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, ip)))
  assert.equal(res.status, 200)
  return (await res.json()).ticket
}

test('提交会返回一个查询码，形如 XXXX-XXXX', async () => {
  const ticket = await submitAndGetTicket()
  assert.match(ticket, TICKET_RE)
})

test('查询码里没有 I/L/O/0/1（截图和手抄最容易认错的几个）', async () => {
  for (let i = 0; i < 20; i += 1) {
    const ticket = await submitAndGetTicket({ 'CF-Connecting-IP': '192.0.2.' + (10 + i) })
    assert.ok(!/[ILO01]/.test(ticket), '出现了易混字符：' + ticket)
  }
})

test('每条查询码都不一样', async () => {
  const seen = new Set()
  for (let i = 0; i < 20; i += 1) {
    seen.add(await submitAndGetTicket({ 'CF-Connecting-IP': '198.18.0.' + (10 + i) }))
  }
  assert.equal(seen.size, 20)
})

test('凭查询码能查到状态，不需要登录', async () => {
  const ticket = await submitAndGetTicket()
  const res = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket)))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.found, true)
  assert.equal(data.ticket, ticket)
  assert.equal(data.status, 'new')
  assert.equal(data.statusLabel, '未看')
  assert.equal(data.category, '一卡通')
  assert.equal(data.kind, 'gap')
})

test('查询码忽略大小写，有没有那一横都行', async () => {
  const ticket = await submitAndGetTicket()
  const variants = [ticket.toLowerCase(), ticket.replace('-', ''), ' ' + ticket + ' ']
  for (const variant of variants) {
    const data = await onRequestGet(
      ctx(get('/api/feedback/lookup?t=' + encodeURIComponent(variant)))
    ).then((r) => r.json())
    assert.equal(data.found, true, '变体没查到：' + variant)
    assert.equal(data.ticket, ticket)
  }
})

test('查询只回显正文前 40 个字', async () => {
  const long = '这是一条很长很长的反馈内容'.repeat(6)
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, want: long }, IP_A)))
  const ticket = rows('SELECT ticket FROM feedback')[0].ticket
  const data = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket))).then((r) => r.json())
  assert.ok(data.wantPreview.length <= 41, '回显了 ' + data.wantPreview.length + ' 个字')
  assert.ok(data.wantPreview.endsWith('…'))
})

test('查询结果里没有联系方式（公开接口不该有）', async () => {
  const ticket = await submitAndGetTicket()
  const raw = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket))).then((r) => r.text())
  assert.ok(raw.indexOf(VALID.contact) < 0, '泄露了联系方式')
  assert.ok(raw.indexOf('contact') < 0, '响应里连字段名都不该有')
})

test('编码格式不对返回 400，不是 500', async () => {
  for (const bad of ['', 'ABC', 'ABCD-EFGH-IJKL']) {
    const res = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + encodeURIComponent(bad))))
    assert.equal(res.status, 400, '输入 ' + JSON.stringify(bad) + ' 的状态是 ' + res.status)
  }
})

test('查不到的查询码返回 found:false，而不是 404', async () => {
  const res = await onRequestGet(ctx(get('/api/feedback/lookup?t=ZZZZ-9999')))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).found, false)
})

test('标成已上线并填了链接后，提交者查得到链接', async () => {
  const ticket = await submitAndGetTicket()
  const id = rows('SELECT id FROM feedback')[0].id
  await onRequestPost(ctx(post('/api/feedback/update', {
    id, status: 'done', resolvedLabel: '校园卡补办流程', resolvedUrl: '/campus-card'
  }, { Cookie: cookie })))

  const data = await onRequestGet(ctx(get('/api/feedback/lookup?t=' + ticket))).then((r) => r.json())
  assert.equal(data.statusLabel, '已上线')
  assert.deepEqual(data.resolved, { label: '校园卡补办流程', url: '/campus-card' })
})

test('审计列表带出查询码，方便和提交者对上号', async () => {
  const ticket = await submitAndGetTicket()
  const data = await onRequestGet(ctx(get('/api/feedback/list', { Cookie: cookie }))).then((r) => r.json())
  assert.equal(data.items[0].ticket, ticket)
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

test('可疑条目即使被标成「已上线」也不会挂到公开页上', async () => {
  // 蜜罐命中 → suspicious = 1
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_A)))
  const id = rows('SELECT id FROM feedback')[0].id

  await onRequestPost(ctx(post('/api/feedback/update', {
    id, status: 'done', resolvedLabel: '看着像真的', resolvedUrl: '/something'
  }, { Cookie: cookie })))

  let stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.deepEqual(stats.published, [], '可疑条目不该出现在公开链接里（统计里也没算它）')
  assert.equal(stats.total, 0)

  // 复核确认是真人写的 → 标记为正常 → 这时才该出现
  await onRequestPost(ctx(post('/api/feedback/update', { id, suspicious: false }, { Cookie: cookie })))
  stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.equal(stats.published.length, 1)
  assert.equal(stats.total, 1)
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

test('没有令牌：照收，但**标成可疑**（客户端闸门之后还没有令牌，说明组件没起来）', async () => {
  const res = await onRequestPost(ctx(post('/api/feedback', VALID, IP_A), TURNSTILE_ENV))
  assert.equal(res.status, 200, '不能因为没令牌就拒')
  assert.equal(count('feedback'), 1, '更不能丢')
  const row = rows('SELECT * FROM feedback')[0]
  assert.equal(Number(row.suspicious), 1)
  assert.equal(row.flag_reason, 'no_token')
})

test('siteverify 连不上：照收、标可疑（原因是验证不可达），不把表单拖死', async () => {
  const restore = stubSiteverify(async () => {
    throw new TypeError('network error')
  })
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(count('feedback'), 1)
    const row = rows('SELECT * FROM feedback')[0]
    assert.equal(Number(row.suspicious), 1)
    assert.equal(row.flag_reason, 'verify_down')
  } finally {
    restore()
  }
})

test('siteverify 超时（AbortError）：照收、标可疑，不拒', async () => {
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

test('siteverify 返回 internal-error：算服务不可用，照收、标可疑', async () => {
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

test('siteverify 返回 5xx：照收、标可疑', async () => {
  const restore = stubSiteverify(async () => new Response('boom', { status: 502 }))
  try {
    const res = await onRequestPost(ctx(post('/api/feedback', TOKEN, IP_A), TURNSTILE_ENV))
    assert.equal(res.status, 200)
    assert.equal(Number(rows('SELECT suspicious FROM feedback')[0].suspicious), 1)
  } finally {
    restore()
  }
})

test('蜜罐的理由不会被「没有令牌」顶掉（trap 优先）', async () => {
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_A), TURNSTILE_ENV))
  assert.equal(rows('SELECT flag_reason FROM feedback')[0].flag_reason, 'trap')
})

test('「删掉蜜罐与过快」不碰未验证的条目', async () => {
  // 一条蜜罐（可批删）、一条没令牌（不可批删）
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, fb_trap: 'x' }, IP_A), TURNSTILE_ENV))
  await onRequestPost(ctx(post('/api/feedback', { ...VALID, want: '真反馈' }, IP_B), TURNSTILE_ENV))
  assert.equal(count('feedback'), 2)

  const res = await onRequestPost(
    ctx(post('/api/feedback/delete', { allSuspicious: true }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  assert.equal((await res.json()).deleted, 1, '只该删掉蜜罐那条')
  const left = rows('SELECT want, flag_reason FROM feedback')
  assert.equal(left.length, 1)
  assert.equal(left[0].flag_reason, 'no_token')
})

test('可以把可疑标记改回正常（复核那条回路）', async () => {
  await onRequestPost(ctx(post('/api/feedback', VALID, IP_A), TURNSTILE_ENV))
  const id = rows('SELECT id FROM feedback')[0].id
  assert.equal(Number(rows('SELECT suspicious FROM feedback WHERE id = ?', id)[0].suspicious), 1)

  const res = await onRequestPost(
    ctx(post('/api/feedback/update', { id, suspicious: false }, { Cookie: cookie }))
  )
  assert.equal(res.status, 200)
  const row = rows('SELECT suspicious, flag_reason FROM feedback WHERE id = ?', id)[0]
  assert.equal(Number(row.suspicious), 0)
  assert.equal(row.flag_reason, null)

  // 去掉标记之后就该计入公开统计了
  const stats = await onRequestGet(ctx(get('/api/feedback/stats'))).then((r) => r.json())
  assert.equal(stats.total, 1)
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

test('提交接口会返回查询码，前端也必须把它带去完成页', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  const api = readFileSync(resolve(repoRoot, 'functions/api/feedback/[[path]].js'), 'utf8')
  assert.ok(api.includes('ticket'), '接口要生成查询码')
  // 只判断 res.ok 就把响应体扔掉的话，用户拿不到编号、查不了自己那条
  assert.ok(form.includes("'/wanted-done?t='"), '前端跳转没带上查询码')
  assert.ok(form.includes('data.ticket'), '前端没从响应体里读查询码')
})

test('闸门在客户端：组件可用就先等令牌，用不了就不等', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  // 只有客户端知道组件加载出来没有，服务端只能看到有没有令牌
  assert.ok(form.includes('waitForTurnstileToken'), '缺少「等令牌」的逻辑')
  assert.ok(form.includes('readTurnstileToken'), '缺少「从表单读令牌」的逻辑')
  assert.ok(form.includes('turnstileUnavailable'), '缺少「组件用不了」的标记')
  // 等不到也一定要放行，不能把人永远挡在门外
  assert.ok(form.includes('TURNSTILE_WAIT_MS'), '缺少等待上限')
  // 判据必须是表单里那个隐藏 input —— 回调不保证触发，iframe 也不保证在哪
  assert.ok(form.includes("'cf-turnstile-response'"), '没读那个隐藏 input')
})

test('等 API 就绪用的是轮询，不是查一次', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  // 踩过的坑：api.js 只是个 302 引导，真正的包是它之后自己拉的，
  // 所以 script 的 load 事件之后 window.turnstile.render 还不一定是函数。
  // 查一次就放弃的话，结果是「脚本请求发出去了、一个挑战请求都没有」。
  assert.ok(form.includes('waitForTurnstileApi'), '缺少「等 API 就绪」的逻辑')
  assert.ok(form.includes('TURNSTILE_API_WAIT_MS'), '缺少等 API 的上限')
})

test('没有用户可见的「组件没加载出来」提示，且主路径是隐式渲染', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  // 那个提示误报过两版（先在容器里找 iframe，后改成回调 + 时长兜底），
  // 而且它帮不上忙：组件加载不出来时表单照样能提交，用户看不到任何异常。
  assert.ok(!form.includes('没能加载出来'), '那个误报的提示又回来了')
  // 显式渲染试过一次，线上一个挑战请求都没有，退回隐式渲染——能用比优雅重要。
  // 看的是脚本地址本身，不是注释里提到过这个词。
  assert.ok(
    !/TURNSTILE_SCRIPT = '[^']*render=explicit/.test(form),
    '主路径不该再用显式渲染'
  )
  assert.ok(form.includes('cf-turnstile'), '隐式渲染需要 .cf-turnstile 这个 class')
  assert.ok(form.includes('data-sitekey'), '隐式渲染需要 data-sitekey')
})

test('令牌是一次性的：待发不留令牌、作废后要换新的、等令牌前先上锁', () => {
  const form = readFileSync(
    resolve(repoRoot, 'vitepress-docs/.vitepress/theme/FeedbackForm.vue'),
    'utf8'
  )
  // 存本地待发时必须去掉令牌：它只能用一次，存了下次也用不了，
  // 服务端会以「令牌无效」直接 400 拒掉，而失败又会再存一遍 —— 那条永远发不出去
  assert.ok(
    form.includes("delete safe['cf-turnstile-response']"),
    'savePending 没有去掉一次性令牌'
  )
  // 服务端说令牌无效时要：清掉表单里那枚废令牌 + reset 组件重新出一枚
  assert.ok(form.includes('function resetTurnstile'), '缺少换新令牌的逻辑')
  assert.ok(
    form.includes("input[name=\"cf-turnstile-response\"]"),
    'resetTurnstile 没有清掉表单里作废的令牌'
  )
  assert.ok(form.includes('api.reset?.(widgetId)'), '显式渲染那条路 reset 要带上 widgetId')
  // SPA 转走时把 widget 摘掉，别在 Turnstile 的注册表里留孤儿
  assert.ok(form.includes('onUnmounted'), '缺少卸载时的清理')
  assert.ok(form.includes('remove?.(widgetId)'), '卸载时没有 remove 掉 widget')
  // 补发时也要再删一次令牌：上一版存下的 pending 里带着一枚早就作废的令牌，
  // 带上它会被 400 拒、失败又被重新存一遍 —— 那条反馈永远发不出去
  const flushAt = form.indexOf('async function flushPending')
  assert.ok(
    form.indexOf("delete payload['cf-turnstile-response']", flushAt) > flushAt,
    'flushPending 没有清掉旧 payload 里的令牌'
  )
  // 等令牌之前就必须上锁，否则那几秒按钮还是可点的，连点会提交两次
  const from = form.indexOf('async function submitWithVerification')
  const lockAt = form.indexOf('sending.value = true', from)
  const waitAt = form.indexOf('await waitForTurnstileToken()', from)
  assert.ok(lockAt > 0, 'submitWithVerification 没有上锁')
  assert.ok(waitAt > 0, 'submitWithVerification 没有等令牌')
  assert.ok(lockAt < waitAt, '上锁必须发生在等令牌之前')
})

test('反馈入口与群号只有一份定义，页面都从 shared/contact.ts 取', () => {
  const read = (file) => readFileSync(resolve(repoRoot, file), 'utf8')
  const contact = read('vitepress-docs/.vitepress/shared/contact.ts')
  assert.ok(contact.includes("number: '978801324'"), '群号应当在 contact.ts 里定义')

  // 这些地方以前各抄了一份群号 / 路径，改一处不会全站生效
  for (const file of [
    'vitepress-docs/.vitepress/theme/FeedbackForm.vue',
    'vitepress-docs/.vitepress/theme/FeedbackLookup.vue',
    'vitepress-docs/.vitepress/theme/FeedbackStatus.vue',
    'vitepress-docs/.vitepress/theme/Layout.vue',
    'vitepress-docs/.vitepress/config.mts'
  ]) {
    const source = read(file)
    assert.ok(!source.includes('978801324'), file + ' 里又抄了一份群号，改成从 shared/contact.ts 取')
    assert.ok(source.includes('shared/contact'), file + ' 没有引用 shared/contact.ts')
  }

  // 导航按钮的文字和路径也不能写死：页脚用的是 FEEDBACK.label / FEEDBACK.path
  const layout = read('vitepress-docs/.vitepress/theme/Layout.vue')
  assert.ok(layout.includes('FEEDBACK.path'), '导航按钮的路径写死了')
  assert.ok(layout.includes('FEEDBACK.label'), '导航按钮的文字写死了')
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
