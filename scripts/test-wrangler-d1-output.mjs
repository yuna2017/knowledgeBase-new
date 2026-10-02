import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseD1Output } from './wrangler-d1-output.mjs'

const query = { success: true, results: [{ name: 'feedback', text: '内容里的 [括号] 和 {对象}' }], meta: { duration: 1 } }
const imported = {
  results: [{ 'Total queries executed': 3, 'Rows read': 0, 'Rows written': 1, 'Database size (MB)': '0.02' }],
  success: true, finalBookmark: 'test-bookmark', meta: { duration: 2 }
}

test('parses local/query JSON and the remote import summary', () => {
  for (const entry of [query, imported]) {
    assert.deepEqual(parseD1Output(JSON.stringify([entry], null, 2)), [entry])
    assert.deepEqual(parseD1Output(JSON.stringify(entry)), [entry])
  }
})

test('accepts real remote file progress before JSON, including ANSI and CRLF', () => {
  const progress = '\uFEFF\u001b[90m├ Checking if file needs uploading\u001b[0m\r\n' +
    '├ 🌎 Uploading migration.sql\r\n└ 🌎 Uploading complete.\r\n'
  assert.deepEqual(parseD1Output(progress + JSON.stringify([imported], null, 2).replaceAll('\n', '\r\n')), [imported])
  assert.deepEqual(parseD1Output('[INFO] progress\n' + JSON.stringify([query])), [query])
})

test('rejects a failed result anywhere in the batch', () => {
  for (const failure of [
    { success: false, results: [] },
    { success: false, errors: [{ message: 'SQL failed' }] },
    { error: 'authentication failed' },
    { success: true, results: [], errors: [{ message: 'SQL failed' }] }
  ]) {
    assert.throws(() => parseD1Output('├ Checking\n' + JSON.stringify([query, failure])), /D1 rejected/)
  }
})

test('rejects empty, malformed and unsupported results instead of marking a migration successful', () => {
  for (const output of ['', '├ Checking', '[]', '{}', 'null', '[{"results":[]}]', '[{"success":true}]', '[[]]']) {
    assert.throws(() => parseD1Output(output), /D1.*result/)
  }
})

test('never salvages a nested success from a truncated or failed JSON document', () => {
  const nested = JSON.stringify(query)
  for (const output of [
    '├ Checking\n[\n' + nested,
    '├ Checking\n[\n  ' + nested + ',\n',
    '├ Checking\n' + JSON.stringify([query]) + '\n' + JSON.stringify([{ success: false, results: [] }]),
    '├ Checking\n' + JSON.stringify([query]) + '\nUnexpected trailing output'
  ]) {
    assert.throws(() => parseD1Output(output), /incomplete or invalid/)
  }
})
