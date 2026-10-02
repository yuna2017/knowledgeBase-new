import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateDatabase } from '../migrations/runner.mjs'
import { onRequestGet, onRequestPost } from '../functions/api/views.js'
import { onRequestGet as top } from '../functions/api/views/top.js'
import legacyWorker from '../worker/src/index.js'
import { utc8Day } from '../shared/views.js'

async function setup() {
  const sqlite = new DatabaseSync(':memory:')
  await migrateDatabase({
    async query(sql) { return sqlite.prepare(sql).all() },
    async execute(statements) { for (const sql of statements) sqlite.exec(sql) }
  })
  const prepare = (sql, params = []) => ({
    sql, params,
    bind(...values) { return prepare(sql, values) },
    async first() { return sqlite.prepare(sql).get(...params) ?? null },
    async all() { return { results: sqlite.prepare(sql).all(...params) } }
  })
  const DB = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  }
  return { sqlite, env: { DB, ALLOWED_ORIGINS: 'https://docs.example.com' } }
}

const request = (path, body, origin) => new Request('https://docs.example.com' + path, {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }
})

test('Pages 与旧 Worker 的写入、读取、Top 使用同一份统计业务', async () => {
  const { sqlite, env } = await setup()
  const first = await onRequestPost({ request: request('/api/views', { page: "/tech-Uri'sFJ" }), env })
  assert.deepEqual(await first.json(), { page: "/tech-Uri'sFJ", views: 1 })
  const second = await legacyWorker.fetch(request('/api/views', { page: "/tech-Uri'sFJ" }, 'https://docs.example.com'), env)
  assert.deepEqual(await second.json(), { page: "/tech-Uri'sFJ", views: 2 })
  assert.equal(second.headers.get('Access-Control-Allow-Origin'), 'https://docs.example.com')
  assert.equal(sqlite.prepare('SELECT views FROM daily_views').get().views, 2)
  const read = await onRequestGet({ request: request('/api/views?page=' + encodeURIComponent("/tech-Uri'sFJ")), env })
  assert.equal((await read.json()).views, 2)
  const pagesTop = await top({ request: request('/api/views/top?limit=20'), env })
  const oldTop = await legacyWorker.fetch(request('/api/views/top?limit=20'), env)
  assert.deepEqual(await pagesTop.json(), await oldTop.json())
  sqlite.close()
})

test('日统计失败时整次写入回滚，不产生累计/日统计漂移', async () => {
  const { sqlite, env } = await setup()
  sqlite.exec('DROP TABLE daily_views')
  const response = await onRequestPost({ request: request('/api/views', { page: '/sample' }), env })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'storage error' })
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM counters').get().n, 0)
  sqlite.close()
})

test('非法路径不写库，Top 参数有界，旧 Worker 预检保持兼容', async () => {
  const { sqlite, env } = await setup()
  for (const page of ['https://bad.example', '/has space', 'x', '/'.repeat(257), null]) {
    const response = await onRequestPost({ request: request('/api/views', { page }), env })
    assert.equal(response.status, 400)
  }
  for (let i = 0; i < 25; i++) sqlite.prepare('INSERT INTO counters VALUES (?, ?)').run('/page-' + i, i)
  for (const [limit, expected] of [['9999', 20], ['invalid', 3], ['-1', 3], ['2', 2]]) {
    const response = await top({ request: request('/api/views/top?limit=' + limit), env })
    assert.equal((await response.json()).items.length, expected)
  }
  const preflight = await legacyWorker.fetch(new Request('https://legacy.example/api/views', {
    method: 'OPTIONS', headers: { Origin: 'https://docs.example.com' }
  }), env)
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://docs.example.com')
  sqlite.close()
})

test('UTC+8 日界限与文档站统计一致', () => {
  assert.equal(utc8Day(new Date('2026-10-01T15:59:59Z')), '2026-10-01')
  assert.equal(utc8Day(new Date('2026-10-01T16:00:00Z')), '2026-10-02')
})
