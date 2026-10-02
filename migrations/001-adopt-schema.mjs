import { readFileSync } from 'node:fs'

// Frozen baseline: keep future changes in a new migration, not in schema.sql.
const baseline = readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8')
const sql = baseline.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')
const statements = sql.split(';').map((value) => value.trim()).filter(Boolean)
const feedbackDefinition = sql.match(/CREATE TABLE IF NOT EXISTS feedback\s*\(([\s\S]*?)\);/i)[1]
const columns = feedbackDefinition.split(',').map((value) => {
  const [, name, type] = value.trim().match(/^(\w+)\s+([\s\S]+)$/)
  return [name, type.trim()]
})

export default {
  id: '001-adopt-schema',
  signature: sql,
  async plan(db) {
    const existing = await db.query('PRAGMA table_info(feedback)')
    const names = new Set(existing.map((column) => column.name))
    if (existing.length && !existing.some((column) => column.name === 'id' && column.pk === 1)) {
      throw new Error('Unsupported feedback table: expected id primary key; no migration was applied')
    }
    const create = statements.filter((statement) => /^CREATE TABLE/i.test(statement))
    const indexes = statements.filter((statement) => /^CREATE (UNIQUE )?INDEX/i.test(statement))
    const additions = existing.length ? columns.filter(([name]) => !names.has(name)).map(([name, type]) => {
      // Historical rows cannot supply a value for newly introduced required fields.
      const compatibleType = /\bDEFAULT\b/i.test(type) ? type : type.replace(/\s+NOT NULL\b/i, '')
      return `ALTER TABLE feedback ADD COLUMN ${name} ${compatibleType}`
    }) : []
    return [...create, ...additions, ...indexes]
  }
}
