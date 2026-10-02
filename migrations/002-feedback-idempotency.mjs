const columns = [['request_id', 'TEXT'], ['request_hash', 'TEXT']]
const index = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_request_id ON feedback (request_id)'

export default {
  id: '002-feedback-idempotency',
  signature: JSON.stringify({ columns, index }),
  async plan(db) {
    const existing = new Set((await db.query('PRAGMA table_info(feedback)')).map((column) => column.name))
    return [
      ...columns.filter(([name]) => !existing.has(name)).map(([name, type]) => `ALTER TABLE feedback ADD COLUMN ${name} ${type}`),
      index
    ]
  }
}
