#!/usr/bin/env node
/**
 * 需求反馈报表 —— 本机直接读 D1。
 *
 * 用途有两个：
 *   1. 看明细（审计页能看，但文档站或接口挂了的时候，这个还能用）；
 *   2. `--write` 更新状态页的兜底数据。状态页平时是实时拉 /api/feedback/stats 的，
 *      仓库里那份 JSON 只在拉不到时顶上。
 *
 * 之所以不在 CI 里拉：Cloudflare 抖一下，部署就会跟着红。
 * 本机跑、拉不到就保留上一次的数据，反而更稳。
 *
 * 用法：
 *   node scripts/feedback-report.mjs             计数 + 明细
 *   node scripts/feedback-report.mjs --write     顺便更新兜底 JSON
 *   node scripts/feedback-report.mjs --no-detail 只看计数
 *   node scripts/feedback-report.mjs --json      输出原始 JSON
 *
 * 需要 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 与 functions/api/views.js 头部注释、worker/wrangler.toml 保持一致 */
const DATABASE_ID = 'fa3ebf5a-5c7e-4c46-92a8-67f6bd65d2aa'

const STATUS_LABEL = {
  new: '未看',
  planned: '计划中',
  done: '已上线',
  rejected: '不采纳'
}

/**
 * 可疑的原因，和审计页的 FLAG_LABEL 一致。
 * trap / fast 几乎可以确定是脚本；no_token / verify_down 很可能只是提交者的网络
 * 到不了 Cloudflare —— 里面是真反馈，所以这两类要单独报出来。
 */
const FLAG_LABEL = {
  trap: '可疑·蜜罐',
  fast: '可疑·过快',
  no_token: '可疑·未验证',
  verify_down: '可疑·验证不可达',
  manual: '可疑·手动'
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const countsPath = resolve(projectRoot, 'vitepress-docs/.vitepress/data/feedback-counts.json')

const args = new Set(process.argv.slice(2))

function utc8(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error('缺少环境变量 ' + name + '。请先设置 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。')
    process.exit(1)
  }
  return value
}

async function query(sql, params = []) {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const url =
    'https://api.cloudflare.com/client/v4/accounts/' + accountId +
    '/d1/database/' + DATABASE_ID + '/query'

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
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

function buildStats(totals, kindRows, rows, publishedRows) {
  const grouped = new Map()
  for (const row of rows) {
    const category = String(row.category)
    if (!grouped.has(category)) grouped.set(category, { category, total: 0, byStatus: {} })
    const bucket = grouped.get(category)
    const count = Number(row.n) || 0
    bucket.total += count
    bucket.byStatus[String(row.status)] = count
  }

  const byKind = { gap: 0, fix: 0 }
  for (const row of kindRows) {
    if (row.kind === 'gap' || row.kind === 'fix') byKind[row.kind] = Number(row.n) || 0
  }

  return {
    _comment:
      '状态页的兜底数据，由 scripts/feedback-report.mjs --write 生成，请勿手工编辑。' +
      '页面会实时拉取 /api/feedback/stats，只有拉不到时才显示这份快照。' +
      '注意：这份快照为空 ≠ 一条反馈都没有。',
    total: totals.length ? Number(totals[0].total) || 0 : 0,
    byCategory: [...grouped.values()].sort((a, b) => b.total - a.total),
    byKind,
    published: publishedRows.map((row) => ({
      category: String(row.category),
      label: String(row.resolved_label || row.category),
      url: String(row.resolved_url)
    })),
    updatedAtText: utc8(Date.now())
  }
}

function printDetail(items) {
  if (!items.length) return
  console.log('')
  console.log('明细（' + items.length + ' 条，新的在前；可疑的排在最后）')
  for (const item of items) {
    console.log('')
    console.log(
      '  #' + item.id + '  [' + (STATUS_LABEL[item.status] || item.status) + ']' +
      (Number(item.suspicious) === 1 ? ' [' + (FLAG_LABEL[item.flag_reason] || '可疑') + ']' : '') +
      ' ' + item.category + ' / ' + (item.kind === 'fix' ? '勘误' : '缺口') +
      '  ' + utc8(Number(item.created_at))
    )
    console.log('    想要：' + String(item.want).replace(/\n+/g, ' / '))
    console.log('    场景：' + String(item.scene).replace(/\n+/g, ' / '))
    if (item.article) console.log('    针对：' + item.article)
    if (item.contact) console.log('    联系：' + item.contact)
    if (item.status === 'rejected') {
      console.log('    不采纳：' + (item.reject_reason || '（没写原因，提交者看到的是兜底说明）'))
    }
    if (item.resolved_url) {
      console.log('    已上线：' + (item.resolved_label || '(无标签)') + ' → ' + item.resolved_url)
    }
  }
}

async function main() {
  let totals
  let kindRows
  let rows
  let publishedRows
  let suspicious = 0
  let unverified = 0
  try {
    // 公开统计一律排除可疑条目（蜜罐垃圾 + 没通过验证的），审计明细里才看得到
    totals = await query('SELECT COUNT(*) AS total FROM feedback WHERE suspicious = 0')
    kindRows = await query(
      'SELECT kind, COUNT(*) AS n FROM feedback WHERE suspicious = 0 GROUP BY kind'
    )
    rows = await query(
      'SELECT category, status, COUNT(*) AS n FROM feedback WHERE suspicious = 0 GROUP BY category, status'
    )
    // 和接口 handleStats() 里那条一模一样：公开链接同样排除可疑条目，
    // 否则这份快照和实时数据会不一致（状态页平时读的是接口）
    publishedRows = await query(
      `SELECT category, resolved_label, resolved_url FROM feedback
        WHERE status = 'done' AND suspicious = 0
          AND resolved_url IS NOT NULL AND resolved_url != ''
        ORDER BY updated_at DESC LIMIT 50`
    )
    const sus = await query('SELECT COUNT(*) AS n FROM feedback WHERE suspicious = 1')
    suspicious = Number((sus[0] || {}).n) || 0
    const uv = await query(
      "SELECT COUNT(*) AS n FROM feedback WHERE suspicious = 1 AND flag_reason IN ('no_token', 'verify_down')"
    )
    unverified = Number((uv[0] || {}).n) || 0
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
    if (/no such table/i.test(message)) {
      console.error('D1 里还没有 feedback 表。先通过站点的 /wanted 提交一条，或手工执行 worker/schema.sql。')
      process.exit(1)
    }
    console.error('读取 D1 失败：' + message)
    if (/no such column/i.test(message)) {
      console.error('提示：列缺失说明补列迁移还没跑过。让站点先访问一次 /api/feedback（接口会自动补），或者手工执行 docs/feedback-deploy.md 里的 ALTER TABLE。')
    }
    process.exit(1)
  }

  const stats = buildStats(totals, kindRows, rows, publishedRows)

  if (args.has('--json')) {
    console.log(JSON.stringify(stats, null, 2))
  } else {
    console.log('需求反馈（' + stats.updatedAtText + '，UTC+8）')
    console.log('')
    console.log('  共 ' + stats.total + ' 条：缺口 ' + stats.byKind.gap + '，勘误 ' + stats.byKind.fix)
    for (const row of stats.byCategory) {
      const parts = Object.entries(row.byStatus)
        .map(([status, count]) => (STATUS_LABEL[status] || status) + ' ' + count)
        .join('，')
      console.log('  ' + row.category + '  ' + row.total + ' 条（' + parts + '）')
    }
    if (!stats.total) console.log('  （还没有反馈）')
    if (suspicious) {
      const traps = suspicious - unverified
      console.log('')
      console.log(
        '  另有 ' + suspicious + ' 条可疑，不计入上面的数字：' +
        '蜜罐 / 过快 ' + traps + ' 条，未验证 ' + unverified + ' 条。'
      )
      if (traps) {
        console.log('  蜜罐 / 过快那批确认是垃圾后，去审计页点「删掉蜜罐与过快」。')
      }
      if (unverified) {
        console.log(
          '  ⚠️ 未验证那 ' + unverified + ' 条**先看内容**：很可能只是网络到不了 ' +
          'Cloudflare 的真反馈。确认是真人写的就点「标记为正常」，它会立刻计入统计。'
        )
      }
    }
  }

  if (args.has('--write')) {
    writeFileSync(countsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8')
    console.log('')
    console.log('已写入 ' + countsPath)
  }

  if (!args.has('--json') && !args.has('--no-detail')) {
    printDetail(
      await query(
        `SELECT id, category, kind, want, scene, article, contact, status,
                resolved_label, resolved_url, reject_reason, suspicious, flag_reason, created_at
           FROM feedback ORDER BY suspicious ASC, created_at DESC, id DESC LIMIT 200`
      )
    )
  }
}

await main()
