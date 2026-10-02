import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { MIGRATIONS } from '../migrations/runner.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const migrationScript = join(projectRoot, 'scripts/migrate-d1.mjs')
const networkGuard = join(projectRoot, 'scripts/fixtures/local-http-only.cjs')
const account = '00000000000000000000000000000000'
const databaseId = '00000000-0000-0000-0000-000000000001'
const children = new Set()

function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* Already exited. */ }
  }
}

process.on('exit', () => { for (const child of children) killTree(child) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1))

function run(arguments_, env, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
    })
    children.add(child)
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => killTree(child), 60_000)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      children.delete(child)
      resolveResult({ code, signal, stdout, stderr })
    })
  })
}

function fixtureEnvironment(origin, directory) {
  const env = { ...process.env }
  // Never inherit real Cloudflare credentials, proxy settings or Node preloads.
  for (const key of Object.keys(env)) {
    if (/^(CLOUDFLARE_|CF_|WRANGLER_|NODE_OPTIONS$)|proxy/i.test(key)) delete env[key]
  }
  return {
    ...env,
    CI: 'true', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_API_TOKEN: 'local-fixture-token', CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_API_BASE_URL: origin + '/client/v4',
    WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
    KB_TEST_HTTP_ORIGIN: origin,
    NODE_OPTIONS: `--no-warnings --require "${networkGuard.replaceAll('\\', '/')}"`
  }
}

test('real Wrangler remote --file progress cannot break the migration CLI', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kb-migrate-cli-'))
  const sqlite = new DatabaseSync(':memory:')
  const requests = []
  const uploads = new Map()
  const executedFiles = []
  const failures = []
  let origin
  let imports = 0
  const apiPath = `/client/v4/accounts/${account}/d1/database/${databaseId}`
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.host, new URL(origin).host)
      const url = new URL(request.url, origin)
      requests.push({ method: request.method, path: url.pathname })
      const body = []
      for await (const chunk of request) body.push(chunk)
      const text = Buffer.concat(body).toString('utf8')
      const send = (result) => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ success: true, errors: [], messages: [], result }))
      }
      if (request.method === 'PUT' && url.pathname.startsWith('/upload/')) {
        const etag = createHash('md5').update(text).digest('hex')
        assert.equal(url.pathname, '/upload/' + etag)
        uploads.set(etag, text)
        response.writeHead(200, { ETag: '"' + etag + '"' })
        response.end()
        return
      }
      assert.equal(request.headers.authorization, 'Bearer local-fixture-token')
      assert.equal(request.method, 'POST')
      const input = JSON.parse(text)
      if (url.pathname === apiPath + '/query') {
        const results = sqlite.prepare(input.sql).all()
        send([{ success: true, results, meta: { duration: 0, rows_read: results.length, rows_written: 0 } }])
        return
      }
      assert.equal(url.pathname, apiPath + '/import')
      if (input.action === 'init') {
        send({ upload_url: origin + '/upload/' + input.etag, filename: input.etag })
        return
      }
      assert.equal(input.action, 'ingest')
      assert.equal(input.filename, input.etag)
      assert.ok(uploads.has(input.etag), 'Wrangler must upload the SQL file before ingestion')
      const sql = uploads.get(input.etag)
      sqlite.exec(sql)
      executedFiles.push(sql)
      imports++
      send({
        success: true, status: 'complete', messages: [],
        result: {
          num_queries: 1, final_bookmark: 'fixture-' + imports,
          meta: { duration: 1, rows_read: 0, rows_written: 1, size_after: 4096 }
        }
      })
    } catch (error) {
      failures.push(error)
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ success: false, errors: [{ code: 9999, message: error.message }] }))
    }
  })

  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolveListen)
    })
    origin = 'http://127.0.0.1:' + server.address().port
    const env = fixtureEnvironment(origin, directory)
    const config = join(directory, 'wrangler.toml')
    await writeFile(config, `name = "migration-cli-fixture"
compatibility_date = "2026-01-01"
account_id = "${account}"
[[d1_databases]]
binding = "DB"
database_name = "migration-cli-fixture"
database_id = "${databaseId}"
`)

    const guarded = await run(['-e', `fetch('https://example.invalid/').then(() => process.exit(1)).catch(error => {
      if (!String(error.cause?.message).includes('CLI test blocked a socket')) process.exit(2)
    })`], env, directory)
    assert.equal(guarded.code, 0, guarded.stderr)

    // Prove this installed Wrangler actually mixes its import progress with
    // JSON output, including when --json and CI=true are both supplied.
    const probe = join(directory, 'probe.sql')
    await writeFile(probe, 'CREATE TABLE cli_probe (value TEXT); INSERT INTO cli_probe VALUES (\'uploaded\');')
    const raw = await run([wrangler, 'd1', 'execute', 'DB', '--remote', '--config', config, '--json', '--file', probe], env, directory)
    assert.equal(raw.code, 0, raw.stderr)
    assert.match(raw.stdout, /Checking if file needs uploading/)
    assert.match(raw.stdout, /"success": true/)
    assert.throws(() => JSON.parse(raw.stdout), SyntaxError, 'The old JSON.parse(stdout) implementation must fail on this real output')
    assert.equal(sqlite.prepare('SELECT value FROM cli_probe').get().value, 'uploaded')

    const arguments_ = [migrationScript, '--remote', '--config', config, '--database', 'DB']
    const injection = join(projectRoot, 'scripts/fixtures/fail-wrangler-after-output.cjs')
    const marker = join(directory, 'client-failed-after-commit.txt')
    const interrupted = await run(arguments_, {
      ...env,
      NODE_OPTIONS: env.NODE_OPTIONS + ` --require "${injection.replaceAll('\\', '/')}"`,
      KB_TEST_FAIL_AFTER_BOOKMARK: 'fixture-3',
      KB_TEST_FAILURE_MARKER: marker
    }, directory)
    assert.equal(interrupted.code, 1, interrupted.stdout + '\n' + interrupted.stderr)
    assert.match(interrupted.stderr, /CLI fixture forced non-zero after successful import output/)
    assert.match(await readFile(marker, 'utf8'), /"success": true/)
    const committed = sqlite.prepare('SELECT * FROM kb_schema_migrations ORDER BY id').all()
    assert.deepEqual(committed.map(({ id }) => id), ['001-adopt-schema'])
    assert.doesNotMatch(interrupted.stdout, /Database migration complete/)

    const first = await run(arguments_, env, directory)
    assert.equal(first.code, 0, first.stdout + '\n' + first.stderr)
    assert.match(first.stdout, /Database migration complete/)
    assert.deepEqual(sqlite.prepare('SELECT id FROM kb_schema_migrations ORDER BY id').all().map(({ id }) => id), MIGRATIONS.map(({ id }) => id))
    const columns = sqlite.prepare('PRAGMA table_info(feedback)').all().map(({ name }) => name)
    assert.ok(columns.includes('request_id') && columns.includes('request_hash'))
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_feedback_request_id'").get())
    assert.deepEqual(sqlite.prepare('SELECT * FROM kb_schema_migrations WHERE id = ?').get(committed[0].id), committed[0])
    assert.equal(executedFiles.filter((sql) => sql.includes("'001-adopt-schema'")).length, 1, 'Retry must preserve the committed migration instead of applying it twice')
    const importsAfterMigration = imports
    assert.equal(importsAfterMigration, MIGRATIONS.length + 3, 'Probe, migration table checks and each migration must use remote file upload')

    const check = await run([...arguments_, '--check'], env, directory)
    assert.equal(check.code, 0, check.stdout + '\n' + check.stderr)
    assert.match(check.stdout, /Database schema is current/)
    const repeat = await run(arguments_, env, directory)
    assert.equal(repeat.code, 0, repeat.stdout + '\n' + repeat.stderr)
    assert.match(repeat.stdout, /Database schema is already current/)
    assert.equal(imports, importsAfterMigration, '--check and a second migration must not upload or execute files')
    assert.deepEqual(failures, [])
    assert.ok(requests.some(({ method, path }) => method === 'PUT' && path.startsWith('/upload/')))
  } finally {
    for (const child of children) killTree(child)
    server.closeAllConnections()
    await new Promise((resolveClose) => server.close(resolveClose))
    sqlite.close()
    const localPath = relative(resolve(tmpdir()), resolve(directory))
    if (!localPath.startsWith('kb-migrate-cli-') || localPath.includes('..') || isAbsolute(localPath)) {
      throw new Error('Refusing to remove an unexpected fixture directory')
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
