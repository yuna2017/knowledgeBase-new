import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { parse } from 'parse5'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localRoot = join(projectRoot, '.wrangler')
const outputRoot = join(projectRoot, 'vitepress-docs/.vitepress/dist')
const require = createRequire(import.meta.url)
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const vitepress = join(dirname(require.resolve('vitepress/package.json')), 'bin/vitepress.js')
const smoke = process.argv.includes('--smoke')
const args = process.argv.slice(2).filter((arg) => arg !== '--smoke')
if (args.length) throw new Error('Usage: node scripts/dev-full.mjs [--smoke]')

function port(value, fallback) {
  const number = value ? Number(value) : fallback
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('Invalid local port: ' + value)
  return number
}

const apiPort = port(process.env.DOCS_API_PORT, 8788)
const webPort = port(process.env.DOCS_WEB_PORT, 5173)
const apiOrigin = `http://127.0.0.1:${apiPort}`
const webOrigin = `http://127.0.0.1:${webPort}`
const localPassword = 'local-feedback-admin'
const smokePassword = 'isolated-smoke-test-password'
const children = new Set()
let smokeDirectory

function cleanupProcesses() {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore'
      })
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch { /* Already exited. */ }
    }
  }
}

process.on('exit', cleanupProcesses)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(signal === 'SIGINT' ? 130 : 143))
}

function start(name, arguments_, environment = {}) {
  const child = spawn(process.execPath, arguments_, {
    cwd: projectRoot,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', ...environment },
    stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32'
  })
  children.add(child)
  child.completion = new Promise((resolveExit) => {
    child.once('error', (error) => resolveExit({ error }))
    child.once('exit', (code, signal) => {
      children.delete(child)
      resolveExit({ code, signal })
    })
  })
  child.label = name
  return child
}

async function run(name, arguments_) {
  const result = await start(name, arguments_).completion
  if (result.error) throw result.error
  if (result.code !== 0) throw new Error(`${name} exited (${result.code ?? result.signal})`)
}

async function requireFreePort(number) {
  await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`端口 ${number} 已被占用；请关闭对应服务或设置 DOCS_API_PORT / DOCS_WEB_PORT。`)))
    server.listen({ host: '127.0.0.1', port: number, exclusive: true }, () => server.close(resolvePort))
  })
}

async function waitForHttp(origin, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(child.label + ' exited before becoming ready')
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) })
      await response.body?.cancel()
      if (response.ok) return
    } catch { /* The server may still be starting. */ }
    await delay(250)
  }
  throw new Error('Timed out waiting for ' + origin)
}

function findForm(html) {
  let form
  function walk(node) {
    const attrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]))
    if (node.tagName === 'form' && attrs.action === '/api/feedback' && attrs.method?.toLowerCase() === 'post') form = node
    for (const child of node.childNodes || []) walk(child)
  }
  walk(parse(html))
  return form
}

async function checkLocal() {
  const request = async (path, options = {}, expected = 200) => {
    const response = await fetch(apiOrigin + path, {
      ...options, signal: AbortSignal.timeout(15_000), redirect: 'manual'
    })
    assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}`)
    return response
  }
  const json = async (path, options, expected) => (await request(path, options, expected)).json()
  const post = (payload) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  })

  assert.match(await (await request('/')).text(), /YUNA/)
  assert.ok(findForm(await (await request('/wanted')).text()), 'SSR must include a native POST feedback form')
  const session = await json('/api/feedback/session')
  assert.deepEqual(session, { authed: false, configured: true })
  await request('/api/feedback/list', {}, 401)
  assert.equal((await json('/api/feedback/stats')).total, 0, 'Smoke must use an empty, isolated local database')

  const page = '/local-smoke-check'
  assert.equal((await json('/api/views?page=' + page)).views, 0)
  assert.equal((await json('/api/views', post({ page }))).views, 1)
  assert.equal((await json('/api/views?page=' + page)).views, 1)
  assert.deepEqual((await json('/api/views/top?limit=3')).items, [{ page, views: 1 }])

  const payload = {
    requestId: randomUUID(), category: '其他', kind: 'gap',
    want: '本地集成检查', scene: '验证本地反馈提交流程', elapsed: 5000
  }
  const first = await json('/api/feedback', post(payload))
  const repeated = await json('/api/feedback', post(payload))
  assert.ok(first.ticket)
  assert.equal(repeated.ticket, first.ticket, 'Idempotent retry must return the same receipt')
  assert.equal((await json('/api/feedback/stats')).total, 1)
  assert.equal((await json('/api/feedback/lookup?t=' + first.ticket)).found, true)
  await request('/api/feedback', post({ ...payload, want: '不同内容' }), 409)

  const login = await request('/api/feedback/login', post({ password: smokePassword }))
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie, 'Admin login must issue a session cookie')
  const list = await json('/api/feedback/list', { headers: { Cookie: cookie } })
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].ticket, first.ticket)

  const native = await request('/api/feedback', {
    method: 'POST', body: new URLSearchParams({ category: '其他', kind: 'gap', want: '原生表单检查', scene: '无 JavaScript 提交' })
  }, 303)
  const destination = new URL(native.headers.get('location') || '', apiOrigin)
  assert.equal(destination.origin, apiOrigin)
  assert.equal(destination.pathname, '/wanted-done')
  assert.ok(destination.searchParams.get('t'))
  console.log('本地集成检查通过：静态页面、SSR 原生提交、审计鉴权、阅读计数和反馈幂等重试。')
}

async function main() {
  await requireFreePort(apiPort)
  if (!smoke) {
    if (apiPort === webPort) throw new Error('DOCS_API_PORT and DOCS_WEB_PORT must differ')
    await requireFreePort(webPort)
  }
  if (!existsSync(join(outputRoot, 'index.html'))) {
    console.log('没有静态构建产物，先构建文档站。')
    await run('documentation checks', [join(projectRoot, 'scripts/check-docs.mjs')])
    await run('VitePress build', [vitepress, 'build', 'vitepress-docs'])
  }
  mkdirSync(localRoot, { recursive: true })
  const persist = smoke
    ? (smokeDirectory = mkdtempSync(join(localRoot, 'local-smoke-')))
    : join(localRoot, 'state')
  console.log('本地 D1：' + relative(projectRoot, persist))
  await run('local D1 migrations', [
    join(projectRoot, 'scripts/migrate-d1.mjs'), '--local', '--config', 'wrangler.toml',
    '--database', 'DB', '--persist-to', persist
  ])

  const arguments_ = [wrangler, 'pages', 'dev', outputRoot,
    '--ip', '127.0.0.1', '--port', String(apiPort), '--inspector-port', '0',
    '--persist-to', persist, '--show-interactive-dev-session=false']
  if (smoke) arguments_.push('--binding', 'FEEDBACK_ADMIN_PASSWORD=' + smokePassword)
  else if (process.env.FEEDBACK_ADMIN_PASSWORD) arguments_.push('--binding', 'FEEDBACK_ADMIN_PASSWORD=' + process.env.FEEDBACK_ADMIN_PASSWORD)
  else if (!existsSync(join(projectRoot, '.dev.vars'))) {
    arguments_.push('--binding', 'FEEDBACK_ADMIN_PASSWORD=' + localPassword)
    console.log('未找到 .dev.vars，使用本地默认审计口令 local-feedback-admin；可复制 .dev.vars.example 后修改。')
  }
  const pages = start('Wrangler Pages', arguments_)
  await waitForHttp(apiOrigin, pages)
  if (smoke) return checkLocal()

  const docs = start('VitePress dev', [vitepress, 'dev', 'vitepress-docs',
    '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    DOCS_API_PROXY: apiOrigin,
    // A developer's production .env must not send local page views remotely.
    VITE_VIEWS_API: ''
  })
  await waitForHttp(webOrigin, docs)
  const proxied = await fetch(webOrigin + '/api/feedback/session', { signal: AbortSignal.timeout(5000) })
  assert.equal(proxied.status, 200, 'VitePress API proxy did not start')
  assert.equal(typeof (await proxied.json()).authed, 'boolean', 'VitePress must proxy /api to local Pages')
  console.log(`完整本地环境：${webOrigin}（热更新） → ${apiOrigin}/api（本地 D1）。按 Ctrl+C 退出。`)
  const result = await Promise.race([pages.completion, docs.completion])
  throw result.error || new Error(`Local service exited (${result.code ?? result.signal})`)
}

try {
  await main()
} catch (error) {
  console.error('本地环境启动或检查失败：' + error.message)
  process.exitCode = 1
} finally {
  cleanupProcesses()
  if (smokeDirectory) {
    const child = relative(localRoot, resolve(smokeDirectory))
    if (!child.startsWith('local-smoke-') || child.includes('..') || isAbsolute(child)) {
      throw new Error('Refusing to remove an unexpected smoke directory')
    }
    rmSync(smokeDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}
