import { createHash } from 'node:crypto'
import baseline from './001-adopt-schema.mjs'
import idempotency from './002-feedback-idempotency.mjs'

export const MIGRATIONS = [baseline, idempotency]
const TABLE = 'kb_schema_migrations'
const quote = (value) => "'" + value.replace(/'/g, "''") + "'"
const checksum = (migration) => createHash('sha256').update(migration.signature).digest('hex')

/** Runs only from explicit setup/deploy commands, never from a request handler. */
export async function migrateDatabase(db, { check = false, log = () => {} } = {}) {
  const exists = await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${TABLE}'`)
  const applied = exists.length ? await db.query(`SELECT id, checksum FROM ${TABLE} ORDER BY id`) : []
  for (const row of applied) {
    const migration = MIGRATIONS.find((item) => item.id === row.id)
    if (!migration) throw new Error(`Database has unknown migration ${row.id}; refusing to run older code`)
    if (row.checksum !== checksum(migration)) throw new Error(`Migration ${row.id} was changed after application; add a new migration`)
  }
  const pending = MIGRATIONS.filter((item) => !applied.some((row) => row.id === item.id))
  if (check) {
    if (pending.length) throw new Error('Pending database migrations: ' + pending.map((item) => item.id).join(', '))
    return []
  }
  if (!pending.length) return []
  await db.execute([
    `CREATE TABLE IF NOT EXISTS ${TABLE} (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`
  ])
  for (const migration of pending) {
    // Plans inspect existing columns, so interrupted upgrades can be retried safely.
    // The marker is last; a failed upgrade must never claim to be complete.
    const statements = await migration.plan(db)
    await db.execute([
      ...statements,
      `INSERT INTO ${TABLE} (id, checksum, applied_at) VALUES (${quote(migration.id)}, ${quote(checksum(migration))}, datetime('now'))`
    ])
    log('Applied ' + migration.id)
  }
  return pending.map((migration) => migration.id)
}
