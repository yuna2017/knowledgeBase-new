/**
 * Cloudflare Pages Function —— 需求反馈（收集 / 鉴权 / 审计）。
 *
 * 与阅读量接口（functions/api/views.js）共用同一个 D1 绑定，变量名 `DB`
 * （数据库 yuna-kb-views，database_id fa3ebf5a-5c7e-4c46-92a8-67f6bd65d2aa）。
 *
 * 路由（全部同源，前缀 /api/feedback）：
 *   POST /api/feedback             提交一条反馈。支持两种编码：
 *                                    application/json               → 返回 JSON
 *                                    application/x-www-form-urlencoded → 303 跳转（无 JS 兜底）
 *   POST /api/feedback/login       密码换会话 Cookie
 *   POST /api/feedback/logout      清除会话
 *   GET  /api/feedback/stats       公开聚合（只有分类 + 条数 + 状态，状态页实时读它）
 *   GET  /api/feedback/session     查询当前是否已登录
 *   GET  /api/feedback/list        审计明细（需登录）
 *   POST /api/feedback/status      改某条的状态（需登录）
 *   POST /api/feedback/delete      删除某条（需登录，用于清理垃圾）
 *
 * 必须在 Pages 项目设置里配置环境变量 `FEEDBACK_ADMIN_PASSWORD`：
 *   - 没配置时，审计接口一律返回 503，提交接口照常工作（不会把自己的后台锁死，
 *     也不会因为漏配密码而变成一个无鉴权的公开接口）
 *   - 本地开发放在**运行 wrangler 的目录**（项目根目录）下的 `.dev.vars`（已 gitignore）
 *
 * 设计取舍见 docs/feedback-channel-design.md：
 *   - 反垃圾用「蜜罐 + 填写耗时 + D1 限频」三件套，刻意不引入 Turnstile——
 *     Turnstile 会给提交路径再加两个 Cloudflare 依赖，而且与要规避的
 *     故障是相关的（Cloudflare 抖动时验证和接口一起挂）。
 *   - 只存 IP 的加盐哈希，不存原始 IP。
 */

const CATEGORIES = [
  '校园网',
  '一卡通',
  '图书馆',
  '宿舍',
  '食堂快递',
  '教务学籍',
  '校医院',
  '安全防骗',
  '技术资源',
  '其他'
]
const KINDS = new Set(['gap', 'fix'])
const STATUSES = new Set(['new', 'planned', 'done', 'rejected'])

const WANT_MAX = 2000
const SCENE_MAX = 1000
const CONTACT_MAX = 200
/** 打开表单到提交短于这个时长，判为脚本（仅在有 JS 提交 elapsed 时生效） */
const MIN_FILL_MS = 3000
/** 同一来源每天最多提交条数 */
const SUBMIT_PER_DAY = 10
/** 登录失败多少次后锁一段时间 */
const LOGIN_FAIL_MAX = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
/** 会话有效期 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const COOKIE_NAME = 'kb_feedback_admin'
/** 审计列表一次最多返回多少条 */
const LIST_MAX = 1000

const encoder = new TextEncoder()

/* ------------------------------------------------------------------ 基础工具 */

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  })
}

/** 当前时间的 UTC+8 日期字符串（YYYY-MM-DD） */
function utc8Day(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** UTC+8 的「YYYY-MM-DD HH:mm」 */
function utc8Stamp(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * 定长比较。字符串长度不同也走完整循环，避免用提前返回泄露长度信息。
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/* ------------------------------------------------------------------ 会话 */

/** 只在配置了密码时可用 */
function adminPassword(env) {
  const value = env.FEEDBACK_ADMIN_PASSWORD
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function hmacKey(env) {
  const password = adminPassword(env)
  if (!password) return null
  return crypto.subtle.importKey(
    'raw',
    encoder.encode('kb-feedback-session-v1:' + password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/**
 * 会话令牌 = 过期时间戳 + HMAC 签名。
 * 用密码派生签名密钥，好处是**只需要配一个环境变量**（少配一个就少一处漏配/泄露）。
 */
async function signExpiry(env, expiry) {
  const key = await hmacKey(env)
  if (!key) return null
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(String(expiry))
  )
  return base64url(new Uint8Array(signature))
}

async function issueToken(env) {
  const expiry = Date.now() + SESSION_TTL_MS
  const signature = await signExpiry(env, expiry)
  return signature ? expiry + '.' + signature : null
}

async function verifyToken(env, token) {
  if (typeof token !== 'string') return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expiry = Number(token.slice(0, dot))
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false
  const expected = await signExpiry(env, expiry)
  return expected !== null && timingSafeEqual(token.slice(dot + 1), expected)
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || ''
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    if (trimmed.slice(0, eq) === name) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

/** Path 限制在接口路径下，普通页面请求不会带上这个 Cookie */
function sessionCookie(token, maxAgeSeconds) {
  return (
    COOKIE_NAME + '=' + encodeURIComponent(token || '') +
    '; Path=/api/feedback; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAgeSeconds
  )
}

async function isAuthed(request, env) {
  if (!adminPassword(env)) return false
  return verifyToken(env, readCookie(request, COOKIE_NAME))
}

/* ------------------------------------------------------------------ 来源与限频 */

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'unknown'
  )
}

async function ipHash(env, request) {
  // 加盐哈希：IP 空间很小，不加盐等于可反查
  const salt = adminPassword(env) || 'kb-feedback'
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode('kb-feedback-ip:' + salt + ':' + clientIp(request))
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/* ------------------------------------------------------------------ 建表 */

let schemaReady = null

/**
 * 表结构同时记在 worker/schema.sql 里；这里按需创建是为了让接口
 * 在 schema.sql 没同步执行时也能工作（与 views.js 的 daily_views 同一思路）。
 */
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS feedback (
           id         INTEGER PRIMARY KEY AUTOINCREMENT,
           category   TEXT    NOT NULL,
           kind       TEXT    NOT NULL,
           want       TEXT    NOT NULL,
           scene      TEXT    NOT NULL,
           contact    TEXT,
           status     TEXT    NOT NULL DEFAULT 'new',
           ip_hash    TEXT,
           created_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC)'
      ),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at)'
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS feedback_login_attempts (
           ip           TEXT    PRIMARY KEY,
           fails        INTEGER NOT NULL DEFAULT 0,
           window_start INTEGER NOT NULL
         )`
      )
    ]).catch(() => null)
  }
  return schemaReady
}

/* ------------------------------------------------------------------ 提交 */

/** 去掉首尾空白并折叠连续空行，避免有人用空白灌满字段 */
function clean(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

async function readFields(request) {
  const contentType = request.headers.get('Content-Type') || ''
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json()
      return { fields: body && typeof body === 'object' ? body : {}, json: true }
    } catch {
      return { fields: null, json: true }
    }
  }
  try {
    const form = await request.formData()
    return { fields: Object.fromEntries(form.entries()), json: false }
  } catch {
    return { fields: null, json: false }
  }
}

async function handleSubmit(context) {
  const { request, env } = context
  const { fields, json: wantsJson } = await readFields(request)

  const fail = (status, error, redirectTo) => {
    if (wantsJson) return json({ error }, status)
    return Response.redirect(new URL(redirectTo, request.url).toString(), 303)
  }
  const succeed = () => {
    if (wantsJson) return json({ ok: true }, 200)
    return Response.redirect(new URL('/wanted-done', request.url).toString(), 303)
  }

  if (!fields) return fail(400, 'invalid body', '/wanted?error=1')

  // 蜜罐：正常用户看不到这个字段。命中也当成功，只是不写库，免得脚本知道被识破。
  if (typeof fields.website === 'string' && fields.website.trim() !== '') {
    return succeed()
  }

  // 填写耗时：只有 JS 路径会带上 elapsed，不带就不检查（原生表单提交没有它）
  const elapsed = Number(fields.elapsed)
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS) {
    return succeed()
  }

  const category = clean(fields.category, 32)
  const kind = clean(fields.kind, 8)
  const want = clean(fields.want, WANT_MAX)
  const scene = clean(fields.scene, SCENE_MAX)
  const contact = clean(fields.contact, CONTACT_MAX)

  if (!CATEGORIES.includes(category)) return fail(400, 'invalid category', '/wanted?error=1')
  if (!KINDS.has(kind)) return fail(400, 'invalid kind', '/wanted?error=1')
  if (!want) return fail(400, 'empty want', '/wanted?error=1')
  if (!scene) return fail(400, 'empty scene', '/wanted?error=1')

  const hash = await ipHash(env, request)

  try {
    await ensureSchema(env)
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?'
    )
      .bind(hash, Date.now() - 24 * 3600 * 1000)
      .first()
    if (recent && Number(recent.n) >= SUBMIT_PER_DAY) {
      return fail(429, 'too many submissions today', '/wanted?error=rate')
    }

    await env.DB.prepare(
      `INSERT INTO feedback (category, kind, want, scene, contact, status, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`
    )
      .bind(category, kind, want, scene, contact || null, hash, Date.now())
      .run()
  } catch (error) {
    console.error('[feedback] 写入失败', error)
    return fail(500, 'storage error', '/wanted?error=1')
  }

  return succeed()
}

/* ------------------------------------------------------------------ 登录 / 会话 */

async function handleLogin(context) {
  const { request, env } = context
  const password = adminPassword(env)
  if (!password) return json({ error: 'admin password not configured' }, 503)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const input = body && typeof body.password === 'string' ? body.password : ''

  await ensureSchema(env)
  const hash = await ipHash(env, request)
  const now = Date.now()

  const record = await env.DB.prepare(
    'SELECT fails, window_start FROM feedback_login_attempts WHERE ip = ?'
  )
    .bind(hash)
    .first()

  if (record && now - Number(record.window_start) < LOGIN_WINDOW_MS) {
    if (Number(record.fails) >= LOGIN_FAIL_MAX) {
      const waitMinutes = Math.ceil(
        (LOGIN_WINDOW_MS - (now - Number(record.window_start))) / 60000
      )
      return json(
        { error: 'too many attempts', retryAfterMinutes: Math.max(waitMinutes, 1) },
        429
      )
    }
  }

  if (!timingSafeEqual(input, password)) {
    const expired = !record || now - Number(record.window_start) >= LOGIN_WINDOW_MS
    await env.DB.prepare(
      `INSERT INTO feedback_login_attempts (ip, fails, window_start) VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET
         fails        = CASE WHEN ? THEN 1 ELSE fails + 1 END,
         window_start = CASE WHEN ? THEN ? ELSE window_start END`
    )
      .bind(hash, now, expired ? 1 : 0, expired ? 1 : 0, now)
      .run()
    return json({ error: 'wrong password' }, 401)
  }

  await env.DB.prepare('DELETE FROM feedback_login_attempts WHERE ip = ?').bind(hash).run()
  const token = await issueToken(env)
  if (!token) return json({ error: 'admin password not configured' }, 503)

  return json({ ok: true }, 200, {
    'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000))
  })
}

function handleLogout() {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

async function handleSession(request, env) {
  return json(
    { authed: await isAuthed(request, env), configured: adminPassword(env) !== null },
    200
  )
}

/* ------------------------------------------------------------------ 公开统计 */

/**
 * 状态页用的聚合数据，公开。
 * 只返回「分类 + 条数 + 状态」，不含任何用户写的文字和联系方式。
 */
async function handleStats(env) {
  await ensureSchema(env)

  const totals = await env.DB.prepare('SELECT COUNT(*) AS total FROM feedback').first()
  const kinds = await env.DB.prepare(
    'SELECT kind, COUNT(*) AS n FROM feedback GROUP BY kind'
  ).all()
  const { results } = await env.DB.prepare(
    'SELECT category, status, COUNT(*) AS n FROM feedback GROUP BY category, status'
  ).all()

  const grouped = new Map()
  for (const row of results || []) {
    const category = String(row.category)
    if (!grouped.has(category)) grouped.set(category, { category, total: 0, byStatus: {} })
    const bucket = grouped.get(category)
    const count = Number(row.n) || 0
    bucket.total += count
    bucket.byStatus[String(row.status)] = count
  }

  const byKind = { gap: 0, fix: 0 }
  for (const row of kinds.results || []) {
    if (row.kind === 'gap' || row.kind === 'fix') byKind[row.kind] = Number(row.n) || 0
  }

  return json(
    {
      total: totals ? Number(totals.total) || 0 : 0,
      byCategory: [...grouped.values()].sort((a, b) => b.total - a.total),
      byKind,
      updatedAt: Date.now(),
      updatedAtText: utc8Stamp(Date.now())
    },
    200
  )
}

/* ------------------------------------------------------------------ 审计 */

async function handleList(request, env) {
  if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401)

  await ensureSchema(env)
  const { results } = await env.DB.prepare(
    `SELECT id, category, kind, want, scene, contact, status, created_at
       FROM feedback ORDER BY created_at DESC LIMIT ?`
  )
    .bind(LIST_MAX)
    .all()

  const items = (results || []).map((row) => ({
    id: row.id,
    category: row.category,
    kind: row.kind,
    want: row.want,
    scene: row.scene,
    contact: row.contact || '',
    status: row.status,
    createdAt: Number(row.created_at),
    createdAtText: utc8Stamp(Number(row.created_at)),
    day: utc8Day(new Date(Number(row.created_at)))
  }))

  // 按分类聚合，就是状态页要的那张表
  const byCategory = {}
  for (const item of items) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { category: item.category, total: 0, byStatus: {} }
    }
    const bucket = byCategory[item.category]
    bucket.total += 1
    bucket.byStatus[item.status] = (bucket.byStatus[item.status] || 0) + 1
  }

  return json(
    {
      items,
      summary: {
        total: items.length,
        byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
        byKind: {
          gap: items.filter((item) => item.kind === 'gap').length,
          fix: items.filter((item) => item.kind === 'fix').length
        }
      }
    },
    200
  )
}

async function handleStatusUpdate(context) {
  const { request, env } = context
  if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const id = Number(body && body.id)
  const status = body && body.status
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid id' }, 400)
  if (!STATUSES.has(status)) return json({ error: 'invalid status' }, 400)

  await ensureSchema(env)
  await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, id).run()
  return json({ ok: true }, 200)
}

async function handleDelete(context) {
  const { request, env } = context
  if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const id = Number(body && body.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid id' }, 400)

  await ensureSchema(env)
  await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run()
  return json({ ok: true }, 200)
}

/* ------------------------------------------------------------------ 路由 */

function resolveAction(url) {
  const path = url.pathname.replace(/\/+$/, '')
  if (path === '/api/feedback') return 'submit'
  const match = path.match(
    /^\/api\/feedback\/(login|logout|session|list|status|delete|stats)$/
  )
  return match ? match[1] : null
}

/**
 * 任何未预期的异常都收敛成 JSON 500：
 * 平台默认的 HTML 错误页会让前端 `res.json()` 抛异常，把真实原因藏成
 * 一句「解析失败」，排查时看不出是 D1 挂了还是代码错了。
 */
async function guard(run) {
  try {
    return await run()
  } catch (error) {
    console.error('[feedback] 未处理异常', error)
    return json({ error: 'internal error' }, 500)
  }
}

export async function onRequestGet(context) {
  const action = resolveAction(new URL(context.request.url))
  if (action === 'stats') return guard(() => handleStats(context.env))
  if (action === 'session') return guard(() => handleSession(context.request, context.env))
  if (action === 'list') return guard(() => handleList(context.request, context.env))
  return json({ error: 'not found' }, 404)
}

export async function onRequestPost(context) {
  const action = resolveAction(new URL(context.request.url))
  if (action === 'submit') return guard(() => handleSubmit(context))
  if (action === 'login') return guard(() => handleLogin(context))
  if (action === 'logout') return guard(async () => handleLogout())
  if (action === 'status') return guard(() => handleStatusUpdate(context))
  if (action === 'delete') return guard(() => handleDelete(context))
  return json({ error: 'not found' }, 404)
}
