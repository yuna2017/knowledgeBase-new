/**
 * Cloudflare Pages Function —— 需求反馈（收集 / 鉴权 / 审计）。
 *
 * 与阅读量接口（functions/api/views.js）共用同一个 D1 绑定，变量名 `DB`
 * （数据库 yuna-kb-views，database_id fa3ebf5a-5c7e-4c46-92a8-67f6bd65d2aa）。
 *
 * 路由（全部同源，前缀 /api/feedback）：
 *   POST /api/feedback               提交一条反馈。支持两种编码：
 *                                      application/json                 → 返回 JSON
 *                                      application/x-www-form-urlencoded → 303 跳转（无 JS 兜底）
 *   POST /api/feedback/login         密码换会话 Cookie
 *   POST /api/feedback/logout        清除会话
 *   GET  /api/feedback/stats         公开聚合（分类 + 条数 + 状态 + 已上线链接）
 *   GET  /api/feedback/session       查询当前是否已登录
 *   GET  /api/feedback/list          审计明细（需登录）
 *   POST /api/feedback/update        改状态 / 分类 / 已上线链接（需登录）
 *   POST /api/feedback/delete        删单条，或一次删掉全部可疑条目（需登录）
 *
 * 必须在 Pages 项目设置里配置环境变量 `FEEDBACK_ADMIN_PASSWORD`：
 *   - 没配置时，审计接口一律返回 503，提交接口照常工作（不会把自己的后台锁死，
 *     也不会因为漏配密码而变成一个无鉴权的公开接口）
 *   - 本地开发放在运行 wrangler 的目录（项目根目录）下的 `.dev.vars`（已 gitignore）
 *
 * 两条贯穿全文的原则：
 *
 *   1. **能给人看的，绝不静默丢掉。** 蜜罐命中、填得太快，这两件事都可能误判
 *      （浏览器自动填充会填蜜罐字段；粘贴一段准备好的文字三秒就能交），所以
 *      它们只把条目标成 `suspicious`，不阻止入库。真用户的内容一条都不能丢，
 *      机器人那点垃圾由维护者在审计页一次性批量删掉。
 *   2. **反垃圾不把可用性交出去。** 蜜罐、填写耗时、来源限频三样都是本地可判的。
 *      在此之上接了 Turnstile 机器人验证，但**它只在「令牌明确无效」时才拒**：
 *      拿不到令牌或验证服务连不上，一律照收并标成可疑（见 verifyTurnstile 的表格）。
 *      这样既拿到了验证的强度，又不会重演「Cloudflare 一抖，表单直接不可用」——
 *      而这恰恰是接验证码最容易踩的坑。
 *
 * 设计取舍见 docs/feedback-channel-design.md。
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
const ARTICLE_MAX = 200
const CONTACT_MAX = 200
const LABEL_MAX = 80
const URL_MAX = 300
/** Turnstile 令牌上限（官方给的硬上限） */
const TOKEN_MAX = 2048
/** siteverify 的等待上限，超时就当「验证服务不可用」降级，不能把提交挂死 */
const VERIFY_TIMEOUT_MS = 5000
/** 与前端 data-action 对应，用来确认这个令牌是给这张表单的 */
const TURNSTILE_ACTION = 'feedback'
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** 短于这个时长提交，只标记为可疑，不丢（见文件头第 1 条原则） */
const MIN_FILL_MS = 3000
/**
 * 限频：**按 IP 哈希**，而校园网出口通常是 NAT，成百上千人共用一个公网 IP，
 * 所以额度必须给得宽松——卡的是脚本洪峰，不是学生。
 * 收紧的话先看审计页的数据：COUNT(*) 与 COUNT(DISTINCT ip_hash) 的比值。
 */
const BURST_MAX = 10
const BURST_WINDOW_MS = 10 * 60 * 1000
const DAY_MAX = 60
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

/**
 * ⚠️ 下面这段 DDL 是 `worker/schema.sql` 的手工副本。
 * Pages Functions 里没有文件系统，读不到那个 .sql，只能抄一份。
 *
 * 为了不让两份定义漂移，`scripts/test-feedback-api.mjs` 里有一条断言：
 * 把 worker/schema.sql 建出来的表结构和这里建出来的**逐列比对**，不一致就测试失败。
 * 改任何一份都要同时改另一份，否则 CI 会红。
 */
let schemaReady = null

function schemaStatements(db) {
  return [
    db.prepare(
      `CREATE TABLE IF NOT EXISTS feedback (
         id             INTEGER PRIMARY KEY AUTOINCREMENT,
         category       TEXT    NOT NULL,
         kind           TEXT    NOT NULL,
         want           TEXT    NOT NULL,
         scene          TEXT    NOT NULL,
         article        TEXT,
         contact        TEXT,
         status         TEXT    NOT NULL DEFAULT 'new',
         resolved_label TEXT,
         resolved_url   TEXT,
         suspicious     INTEGER NOT NULL DEFAULT 0,
         ip_hash        TEXT,
         created_at     INTEGER NOT NULL,
         updated_at     INTEGER
       )`
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC)'
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at)'
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS feedback_login_attempts (
         ip           TEXT    PRIMARY KEY,
         fails        INTEGER NOT NULL DEFAULT 0,
         window_start INTEGER NOT NULL
       )`
    )
  ]
}

function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(schemaStatements(env.DB)).catch(() => null)
  }
  return schemaReady
}

/* ------------------------------------------------------------------ Turnstile */

/**
 * 机器人验证。**返回四种状态，其中三种都不丢数据**，这是刻意的：
 *
 * | 状态 | 什么情况 | 怎么办 |
 * | --- | --- | --- |
 * | `off` | 没配 `TURNSTILE_SECRET_KEY` | 不验，走原来的蜜罐 + 耗时 + 限频 |
 * | `ok` | 验证通过 | 正常入库 |
 * | `missing` | 请求里根本没有令牌 | **照收，标可疑**——可能是没跑 JS 的真用户 |
 * | `unreachable` | 请求带令牌但 siteverify 连不上/超时/`internal-error` | **照收，标可疑** |
 * | `invalid` | 带了令牌，Cloudflare 明确说无效（伪造、过期、重放） | **拒**，这是唯一会拒的情况 |
 *
 * 为什么 `missing` 也收：这个站的表单是**渐进增强**的，脚本没跑起来时读者靠原生表单提交，
 * 那时候根本不可能有令牌。把「没有令牌」一律当机器人，就等于把这个退路废掉了。
 * 代价是「不发令牌硬打」的脚本会以可疑条目的形式落库——但它不进公开统计，
 * 维护者在审计页一键就能清掉。**宁可让维护者多点一下，也不要让真用户白填。**
 *
 * 为什么 `unreachable` 不拒：Turnstile 的 siteverify 在 Cloudflare 上，
 * 它抖动的时候正是我们最不希望表单瘫掉的时候。Cloudflare 自己把
 * `internal-error` 标成「重试即可」，那就重试——只不过重试之前先把它收下来。
 */
async function verifyTurnstile(env, request, token) {
  const secret = env.TURNSTILE_SECRET_KEY
  if (typeof secret !== 'string' || secret.length === 0) return { state: 'off' }
  if (!token) return { state: 'missing' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: clientIp(request)
      }),
      signal: controller.signal
    })

    if (!res.ok) return { state: 'unreachable', detail: 'HTTP ' + res.status }

    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      return { state: 'unreachable', detail: 'unparsable body' }
    }

    const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : []

    if (data.success === true) {
      // 令牌是给指定 action 签的；不匹配说明是别的表单的令牌被拿来重放
      if (data.action && data.action !== TURNSTILE_ACTION) {
        return { state: 'invalid', detail: 'action mismatch: ' + data.action }
      }
      return { state: 'ok', hostname: String(data.hostname || '') }
    }

    // internal-error 是 Cloudflare 自己的问题，不是用户的，按不可用处理
    if (codes.includes('internal-error')) {
      return { state: 'unreachable', detail: 'internal-error' }
    }
    return { state: 'invalid', detail: codes.join(',') || 'rejected' }
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? 'timeout' : String(error)
    return { state: 'unreachable', detail: reason }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ 提交 */

function clean(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').trim().slice(0, max)
}

/**
 * 只接受站内相对地址或 https 链接。
 * 这是要写进公开状态页 href 的东西，不能让 `javascript:` 之类混进去。
 */
function cleanUrl(value) {
  const raw = clean(value, URL_MAX)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw
  return ''
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

  /*
   * 以下两种情况只标记可疑、不丢弃：
   *   - 蜜罐被填：浏览器自动填充有可能命中，真用户不该因此丢稿
   *   - 填得太快：粘贴一段准备好的文字，三秒交上去很正常
   * 标记之后由维护者在审计页判断，并有一键「删掉全部可疑」。
   */
  let suspicious = 0
  const trap = clean(fields.fb_trap, 100)
  if (trap) {
    suspicious = 1
    console.warn('[feedback] 蜜罐字段被填，标记为可疑但不丢弃')
  }
  const elapsed = Number(fields.elapsed)
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS) {
    suspicious = 1
    console.warn('[feedback] 提交耗时 ' + elapsed + 'ms，标记为可疑但不丢弃')
  }

  // 机器人验证（见 verifyTurnstile 的表格）：只有「令牌明确无效」才拒
  const token = clean(fields['cf-turnstile-response'], TOKEN_MAX)
  const verdict = await verifyTurnstile(env, request, token)
  if (verdict.state === 'invalid') {
    console.warn('[feedback] Turnstile 判定令牌无效：' + verdict.detail)
    return fail(400, 'turnstile rejected the token', '/wanted?error=verify')
  }
  if (verdict.state === 'missing' || verdict.state === 'unreachable') {
    suspicious = 1
    console.warn(
      '[feedback] Turnstile ' + verdict.state +
      '（' + verdict.detail + '），标记为可疑但不丢弃'
    )
  }

  const category = clean(fields.category, 32)
  const kind = clean(fields.kind, 8)
  const want = clean(fields.want, WANT_MAX)
  const scene = clean(fields.scene, SCENE_MAX)
  // 「缺口」不带「针对哪一篇」：用户可能先选了修正、填了、又改回缺口，
  // 前端那个字段是靠 CSS 跟着单选框显隐的，值还在模型里，所以这里兜一道。
  const article = kind === 'fix' ? clean(fields.article, ARTICLE_MAX) : ''
  const contact = clean(fields.contact, CONTACT_MAX)

  if (!CATEGORIES.includes(category)) return fail(400, 'invalid category', '/wanted?error=1')
  if (!KINDS.has(kind)) return fail(400, 'invalid kind', '/wanted?error=1')
  if (!want) return fail(400, 'empty want', '/wanted?error=1')
  if (!scene) return fail(400, 'empty scene', '/wanted?error=1')

  const hash = await ipHash(env, request)
  const now = Date.now()

  try {
    await ensureSchema(env)

    const burst = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?'
    )
      .bind(hash, now - BURST_WINDOW_MS)
      .first()
    if (burst && Number(burst.n) >= BURST_MAX) {
      return fail(429, 'too many submissions in a short time', '/wanted?error=rate')
    }

    const daily = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?'
    )
      .bind(hash, now - 24 * 3600 * 1000)
      .first()
    if (daily && Number(daily.n) >= DAY_MAX) {
      return fail(429, 'too many submissions today', '/wanted?error=rate')
    }

    await env.DB.prepare(
      `INSERT INTO feedback
         (category, kind, want, scene, article, contact, status,
          suspicious, ip_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`
    )
      .bind(
        category, kind, want, scene, article || null, contact || null,
        suspicious, hash, now, now
      )
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
 * 只返回「分类 + 条数 + 状态」，外加维护者自己填的「已上线」标签和链接——
 * 三者都不含用户写的原文和联系方式。可疑条目一律不计入。
 */
function summarize(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const category = String(row.category)
    if (!grouped.has(category)) grouped.set(category, { category, total: 0, byStatus: {} })
    const bucket = grouped.get(category)
    const count = Number(row.n) || 0
    bucket.total += count
    bucket.byStatus[String(row.status)] = count
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total)
}

async function handleStats(env) {
  await ensureSchema(env)

  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM feedback WHERE suspicious = 0'
  ).first()
  const kinds = await env.DB.prepare(
    'SELECT kind, COUNT(*) AS n FROM feedback WHERE suspicious = 0 GROUP BY kind'
  ).all()
  const { results } = await env.DB.prepare(
    `SELECT category, status, COUNT(*) AS n FROM feedback
      WHERE suspicious = 0 GROUP BY category, status`
  ).all()
  const published = await env.DB.prepare(
    `SELECT category, resolved_label, resolved_url FROM feedback
      WHERE status = 'done' AND resolved_url IS NOT NULL AND resolved_url != ''
      ORDER BY updated_at DESC LIMIT 50`
  ).all()

  const byKind = { gap: 0, fix: 0 }
  for (const row of kinds.results || []) {
    if (row.kind === 'gap' || row.kind === 'fix') byKind[row.kind] = Number(row.n) || 0
  }

  return json(
    {
      total: totals ? Number(totals.total) || 0 : 0,
      byCategory: summarize(results || []),
      byKind,
      published: (published.results || []).map((row) => ({
        category: String(row.category),
        label: String(row.resolved_label || row.category),
        url: String(row.resolved_url)
      })),
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
    `SELECT id, category, kind, want, scene, article, contact, status,
            resolved_label, resolved_url, suspicious, created_at, updated_at
       FROM feedback ORDER BY suspicious ASC, created_at DESC LIMIT ?`
  )
    .bind(LIST_MAX)
    .all()

  const items = (results || []).map((row) => ({
    id: row.id,
    category: row.category,
    kind: row.kind,
    want: row.want,
    scene: row.scene,
    article: row.article || '',
    contact: row.contact || '',
    status: row.status,
    resolvedLabel: row.resolved_label || '',
    resolvedUrl: row.resolved_url || '',
    suspicious: Number(row.suspicious) === 1,
    createdAt: Number(row.created_at),
    createdAtText: utc8Stamp(Number(row.created_at)),
    day: utc8Day(new Date(Number(row.created_at)))
  }))

  const kindRows = await env.DB.prepare(
    'SELECT kind, COUNT(*) AS n FROM feedback WHERE suspicious = 0 GROUP BY kind'
  ).all()
  const statusRows = await env.DB.prepare(
    'SELECT category, status, COUNT(*) AS n FROM feedback WHERE suspicious = 0 GROUP BY category, status'
  ).all()

  const byKind = { gap: 0, fix: 0 }
  for (const row of kindRows.results || []) {
    if (row.kind === 'gap' || row.kind === 'fix') byKind[row.kind] = Number(row.n) || 0
  }

  return json(
    {
      items,
      summary: {
        total: items.filter((item) => !item.suspicious).length,
        suspicious: items.filter((item) => item.suspicious).length,
        byCategory: summarize(statusRows.results || []),
        byKind
      }
    },
    200
  )
}

/** 改状态 / 分类 / 已上线链接。所有字段都可选，只改传上来的那些。 */
async function handleUpdate(context) {
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

  const sets = []
  const values = []

  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) return json({ error: 'invalid status' }, 400)
    sets.push('status = ?')
    values.push(body.status)
    // 从「已上线」退回别的状态时，把链接一并清掉，免得公开页留着一条过期链接
    if (body.status !== 'done') {
      sets.push('resolved_label = NULL', 'resolved_url = NULL')
    }
  }
  if (body.category !== undefined) {
    const category = clean(body.category, 32)
    if (!CATEGORIES.includes(category)) return json({ error: 'invalid category' }, 400)
    sets.push('category = ?')
    values.push(category)
  }
  if (body.resolvedLabel !== undefined) {
    sets.push('resolved_label = ?')
    values.push(clean(body.resolvedLabel, LABEL_MAX) || null)
  }
  if (body.resolvedUrl !== undefined) {
    const url = cleanUrl(body.resolvedUrl)
    if (body.resolvedUrl && !url) {
      return json({ error: 'invalid url：只接受站内 / 开头的路径或 https 链接' }, 400)
    }
    sets.push('resolved_url = ?')
    values.push(url || null)
  }

  if (!sets.length) return json({ error: 'nothing to update' }, 400)

  sets.push('updated_at = ?')
  values.push(Date.now(), id)

  await ensureSchema(env)
  await env.DB.prepare(
    'UPDATE feedback SET ' + sets.join(', ') + ' WHERE id = ?'
  )
    .bind(...values)
    .run()
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

  await ensureSchema(env)

  // 一次性清掉全部可疑条目：蜜罐和耗时误判的代价由此兜住
  if (body && body.allSuspicious === true) {
    const result = await env.DB.prepare('DELETE FROM feedback WHERE suspicious = 1').run()
    return json({ ok: true, deleted: Number(result.meta?.changes ?? 0) }, 200)
  }

  const id = Number(body && body.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid id' }, 400)
  await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run()
  return json({ ok: true }, 200)
}

/* ------------------------------------------------------------------ 路由 */

function resolveAction(url) {
  const path = url.pathname.replace(/\/+$/, '')
  if (path === '/api/feedback') return 'submit'
  const match = path.match(
    /^\/api\/feedback\/(login|logout|session|list|stats|update|delete)$/
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
  if (action === 'update') return guard(() => handleUpdate(context))
  if (action === 'delete') return guard(() => handleDelete(context))
  return json({ error: 'not found' }, 404)
}

/** 供测试脚本比对「这里和 worker/schema.sql 是不是同一份定义」 */
export { schemaStatements, CATEGORIES, STATUSES }
