#!/usr/bin/env node
/**
 * 查「有多少条反馈还没人看」，供 .github/workflows/feedback-notify.yml 用。
 *
 * 动机：这个渠道最容易死在「填了没反应」上——收了东西没人知道，
 * 一周后有人在群里问「我提的那个呢」。所以只要出现「未看」的条目，
 * 就让 GitHub 开一个 issue 把人叫过来；处理干净了自动关掉。
 *
 * 只看 status = 'new' 的**正常**条目（可疑的里绝大多数是蜜罐垃圾，不该每天叫人）。
 *
 * 但「没通过人机验证」的两类（`no_token` / `verify_down`）例外：它们不计入公开统计，
 * 却很可能只是那个人的网络到不了 Cloudflare —— 里面是真反馈。所以单独报一个
 * `unverified` 计数，让 issue 也叫得起来（见 feedback-notify.yml），
 * 否则大陆整片访问不了验证服务时，所有真反馈都会静默消失。
 *
 * 输出写到 $GITHUB_OUTPUT：pending / oldest / suspicious / unverified
 * 本地直接跑也能看（打印到 stdout）。
 *
 * 需要 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。
 */

import { appendFileSync } from 'node:fs'

/** 与 functions/api/views.js 头部注释、worker/wrangler.toml 保持一致 */
const DATABASE_ID = 'fa3ebf5a-5c7e-4c46-92a8-67f6bd65d2aa'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error('缺少环境变量 ' + name)
    process.exit(1)
  }
  return value
}

function utc8Day(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

async function query(sql) {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const url =
    'https://api.cloudflare.com/client/v4/accounts/' + accountId +
    '/d1/database/' + DATABASE_ID + '/query'

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params: [] })
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body || body.success === false) {
    const detail =
      body && Array.isArray(body.errors) && body.errors.length
        ? body.errors.map((error) => error.message).join('; ')
        : 'HTTP ' + res.status
    throw new Error(detail)
  }
  const first = Array.isArray(body.result) ? body.result[0] : null
  return first && Array.isArray(first.results) ? first.results : []
}

async function main() {
  let pending = 0
  let oldest = ''
  let suspicious = 0
  let unverified = 0

  try {
    const rows = await query(
      `SELECT COUNT(*) AS n, MIN(created_at) AS oldest
         FROM feedback WHERE status = 'new' AND suspicious = 0`
    )
    const row = rows[0] || {}
    pending = Number(row.n) || 0
    oldest = row.oldest ? utc8Day(Number(row.oldest)) : ''

    const sus = await query('SELECT COUNT(*) AS n FROM feedback WHERE suspicious = 1')
    suspicious = Number((sus[0] || {}).n) || 0

    // 没通过人机验证的两类：不进公开统计，但很可能是真反馈，得有人去看
    try {
      const uv = await query(
        `SELECT COUNT(*) AS n FROM feedback
          WHERE suspicious = 1 AND flag_reason IN ('no_token', 'verify_down')`
      )
      unverified = Number((uv[0] || {}).n) || 0
    } catch (error) {
      // flag_reason 是接口第一次请求时补上的列；真缺就当 0，别让整个提醒挂掉
      const message = String(error && error.message ? error.message : error)
      if (!/no such column/i.test(message)) throw error
    }
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
    // 表还没建（接口一次都没被访问过）不是故障，当成 0 条
    if (!/no such table/i.test(message)) {
      console.error('读取 D1 失败：' + message)
      process.exit(1)
    }
  }

  const lines = [
    'pending=' + pending,
    'oldest=' + oldest,
    'suspicious=' + suspicious,
    'unverified=' + unverified
  ]
  console.log(lines.join('\n'))

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n', 'utf8')
  }
}

await main()
