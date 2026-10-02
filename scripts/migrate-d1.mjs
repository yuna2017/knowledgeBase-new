#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { migrateDatabase } from '../migrations/runner.mjs'
import { parseD1Output } from './wrangler-d1-output.mjs'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('node scripts/migrate-d1.mjs --local|--remote --config wrangler.toml --database DB [--persist-to .wrangler/state] [--env preview] [--check]')
  process.exit(0)
}
const options = { config: 'wrangler.toml', database: 'DB' }
let mode
let check = false
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--local' || arg === '--remote') {
    if (mode) throw new Error('Choose exactly one of --local / --remote')
    mode = arg
  } else if (arg === '--check') check = true
  else if (['--config', '--database', '--persist-to', '--env'].includes(arg)) {
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg)
    options[arg.slice(2)] = value
  } else throw new Error('Unknown argument: ' + arg)
}
if (!mode) throw new Error('Explicit --local or --remote is required')
if (mode === '--remote' && options['persist-to']) throw new Error('--persist-to applies only to --local')
const require = createRequire(import.meta.url)
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const base = [wrangler, 'd1', 'execute', options.database, mode, '--config', resolve(options.config), '--json']
if (options['persist-to']) base.push('--persist-to', resolve(options['persist-to']))
if (options.env) base.push('--env', options.env)

function run(extra) {
  const output = execFileSync(process.execPath, [...base, ...extra], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    // Wrangler prints the final JSON through its normal logger. Do not inherit
    // error/none, which would suppress the result together with ordinary logs.
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'log' }
  })
  return parseD1Output(output)
}

const db = {
  async query(sql) { return run(['--command', sql]).flatMap((entry) => entry.results || []) },
  async execute(statements) {
    const directory = mkdtempSync(join(tmpdir(), 'kb-d1-migration-'))
    const path = join(directory, 'migration.sql')
    try {
      writeFileSync(path, statements.join(';\n') + ';\n')
      run(['--file', path])
    } finally {
      rmSync(path, { force: true })
      rmdirSync(directory)
    }
  }
}

try {
  const applied = await migrateDatabase(db, { check, log: console.log })
  console.log(check ? 'Database schema is current.' : applied.length ? 'Database migration complete.' : 'Database schema is already current.')
} catch (error) {
  console.error('Database migration failed: ' + error.message)
  if (error.stderr) console.error(String(error.stderr).trim())
  process.exitCode = 1
}
