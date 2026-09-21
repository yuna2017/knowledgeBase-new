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
 *   GET  /api/feedback/lookup?t=XXXX  凭查询码查自己那条的状态（公开，不回显联系方式）
 *   GET  /api/feedback/session       查询当前是否已登录
 *   GET  /api/feedback/list          审计明细（需登录；服务端分页 + 筛选，见 handleList）
 *   POST /api/feedback/update        改状态 / 已上线链接 / 可疑标记（需登录；**分类不可改**）
 *   POST /api/feedback/delete        删单条，或一次删掉「蜜罐 / 过快」那两类可疑（需登录）
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
 *      在此之上接了 Turnstile 机器人验证，判断标准就一条——**拿不到有效令牌
 *      就算没通过**：没有令牌（组件没加载出来 / 被网络挡住）与验证服务连不上，
 *      都照收并**带上原因**标成可疑，等维护者复核；只有 Cloudflare 明确说令牌
 *      无效才拒。这样既拿到了验证的强度，又不会重演「Cloudflare 一抖，表单直接
 *      不可用」——而这恰恰是接验证码最容易踩的坑（见 verifyTurnstile 的表格）。
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
const STATUS_LABEL = {
  new: '未看',
  planned: '计划中',
  done: '已上线',
  rejected: '不采纳'
}

/**
 * 查询码。
 *
 * 用它而不是数据库自增 id：id 是连续的，谁都能从 1 数到尾，
 * 把每一条的分类和状态翻出来。查询码是随机的，猜不到。
 *
 * 字母表去掉了 I / L / O / 0 / 1——这几个在截图和手抄时最容易认错。
 */
const TICKET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const TICKET_LEN = 8
/** 查询结果里回显的「你提交的是」，够认出是自己那条就行 */
const WANT_PREVIEW = 40

const WANT_MAX = 2000
const SCENE_MAX = 1000
const ARTICLE_MAX = 200
const CONTACT_MAX = 200
const LABEL_MAX = 80
const URL_MAX = 300
/** 「不采纳」的原因上限。提交者凭编号能看到，所以别写太长 */
const REJECT_MAX = 200
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
/**
 * 审计列表每页多少条。
 * **只认白名单里的值**：不让人用 `?per=100000` 把 D1 和浏览器一起拖死；
 * 默认 20 是「一屏能看完、不用滚很久」的量，维护者是逐条读内容的，不是扫标题。
 */
const LIST_PER_CHOICES = [20, 50, 100]
const LIST_PER_DEFAULT = 20
/** 搜索词上限，防止拿超长 LIKE 扫库 */
const KEYWORD_MAX = 60

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

/** 生成一个查询码，形如 `K7M2-9Q4P` */
function makeTicket() {
  const bytes = new Uint8Array(TICKET_LEN)
  crypto.getRandomValues(bytes)
  let raw = ''
  for (let i = 0; i < TICKET_LEN; i += 1) {
    raw += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length]
  }
  return raw.slice(0, 4) + '-' + raw.slice(4)
}

/** 把用户输入的查询码归一化：忽略大小写、空格和有没有那一横 */
function cleanTicket(value) {
  const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (raw.length !== TICKET_LEN) return ''
  return raw.slice(0, 4) + '-' + raw.slice(4)
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

function feedbackTableSql() {
  return `CREATE TABLE IF NOT EXISTS feedback (
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
         reject_reason  TEXT,
         suspicious     INTEGER NOT NULL DEFAULT 0,
         flag_reason    TEXT,
         ip_hash        TEXT,
         created_at     INTEGER NOT NULL,
         updated_at     INTEGER,
         ticket         TEXT
       )`
}

/** 三条索引。`idx_feedback_ticket` 引用 ticket 列，**只能建在补列之后** */
function feedbackIndexSql() {
  return [
    'CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at)',
    // 查询码唯一。NULL 在 SQLite 里互不相等，所以迁移前的老行留空不会撞。
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_ticket ON feedback (ticket)'
  ]
}

function loginTableSql() {
  return `CREATE TABLE IF NOT EXISTS feedback_login_attempts (
         ip           TEXT    PRIMARY KEY,
         fails        INTEGER NOT NULL DEFAULT 0,
         window_start INTEGER NOT NULL
       )`
}

/** 给测试脚本用的完整定义：5 条 DDL，和 worker/schema.sql 一一对应 */
function schemaStatements(db) {
  return [feedbackTableSql(), loginTableSql(), ...feedbackIndexSql()].map((sql) => db.prepare(sql))
}

/**
 * 老库缺的列。
 *
 * ⚠️ `CREATE TABLE IF NOT EXISTS` 对**已经存在**的表是空操作，**它不会补列**。
 * 线上那张 feedback 表是早先建的，后来陆续加了 `ticket`（查询码）和
 * `flag_reason`（可疑原因）——只改 DDL 不 ALTER 的话，INSERT 会报
 * `no such column: flag_reason`，症状是**所有提交 500、审计页也 500**，
 * 而 ensureSchema 的报错是被吞掉的，排查时根本看不到「建表失败」。
 *
 * 所以启动时按 PRAGMA 逐列比对，缺什么补什么。SQLite 不允许 ADD COLUMN 一个
 * 「NOT NULL 且没有默认值」的列，所以下面每一条要么可空、要么带默认值。
 */
const MIGRATABLE_COLUMNS = [
  ['category', 'TEXT'],
  ['kind', 'TEXT'],
  ['want', 'TEXT'],
  ['scene', 'TEXT'],
  ['article', 'TEXT'],
  ['contact', 'TEXT'],
  ['status', "TEXT NOT NULL DEFAULT 'new'"],
  ['resolved_label', 'TEXT'],
  ['resolved_url', 'TEXT'],
  ['reject_reason', 'TEXT'],
  ['suspicious', 'INTEGER NOT NULL DEFAULT 0'],
  ['flag_reason', 'TEXT'],
  ['ip_hash', 'TEXT'],
  ['created_at', 'INTEGER'],
  ['updated_at', 'INTEGER'],
  ['ticket', 'TEXT']
]

/** 表里现有的列。读不到就返回 null，调用方退回「逐条试着补」 */
async function existingColumns(db) {
  try {
    const { results } = await db.prepare('PRAGMA table_info(feedback)').all()
    return new Set((results || []).map((row) => String(row.name)))
  } catch (error) {
    console.warn('[feedback] 读 PRAGMA table_info 失败，改为逐条尝试补列', error)
    return null
  }
}

async function addColumn(db, name, type) {
  try {
    await db.prepare('ALTER TABLE feedback ADD COLUMN ' + name + ' ' + type).run()
    console.log('[feedback] 迁移：feedback 补上 ' + name + ' 列')
    return true
  } catch (error) {
    // 列已经在了（重复执行、并发）不是问题；别的错误照抛
    const message = String(error && error.message ? error.message : error)
    if (/duplicate column/i.test(message)) return false
    throw error
  }
}

/**
 * 建表 → 补列 → 建索引。**顺序不能换**：老库上先建 ticket 的唯一索引会直接报
 * `no such column: ticket`，把整个初始化拖垮。
 */
async function bootstrapSchema(db) {
  await db.prepare(feedbackTableSql()).run()
  await db.prepare(loginTableSql()).run()

  const existing = await existingColumns(db)
  for (const [name, type] of MIGRATABLE_COLUMNS) {
    if (existing && existing.has(name)) continue
    await addColumn(db, name, type)
  }

  await db.batch(feedbackIndexSql().map((sql) => db.prepare(sql)))
}

/**
 * 一个 isolate 里只跑一次；**失败不缓存**——否则一次偶发的 D1 抖动会让这个
 * isolate 后面每次请求都跳过建表，错误就沉到「查询报表不存在」里去了。
 */
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = bootstrapSchema(env.DB).catch((error) => {
      console.error('[feedback] 建表 / 补列失败，下次请求会重试', error)
      schemaReady = null
    })
  }
  return schemaReady
}

/* ------------------------------------------------------------------ Turnstile */

/**
 * 机器人验证。**规则只有一条：拿到有效令牌才算通过。**
 *
 * | 状态 | 什么情况 | 怎么办 |
 * | --- | --- | --- |
 * | `off` | 没配 `TURNSTILE_SECRET_KEY` | 不验，走原来的蜜罐 + 耗时 + 限频 |
 * | `ok` | 令牌有效 | 正常入库，**不计可疑** |
 * | `missing` | 请求里没有令牌：组件没加载出来 / 被网络挡住 / 脚本压根没跑 | **照收，标可疑 `no_token`** |
 * | `unreachable` | 带了令牌但 siteverify 连不上/超时/`internal-error` | **照收，标可疑 `verify_down`** |
 * | `invalid` | 带了令牌，Cloudflare 明确说无效（伪造、过期、重放） | **拒**，这是唯一会拒的情况 |
 *
 * 为什么 `missing` 也收而不拒：这个站的表单是**渐进增强**的，脚本没跑起来时读者靠
 * 原生表单提交，那时候根本不可能有令牌。把「没有令牌」一律当机器人，就等于把这个
 * 退路废掉了。代价是这批条目会带着原因落进「可疑」——**不进公开统计**，等维护者
 * 在审计页逐条复核，确认是真人写的就点「标记为正常」，它立刻计入统计。
 * **宁可让维护者多点一下，也不要让真用户白填。**
 *
 * 为什么 `unreachable` 不拒：siteverify 在 Cloudflare 上，它抖动的时候正是我们
 * 最不希望表单瘫掉的时候。Cloudflare 自己把 `internal-error` 标成「重试即可」，
 * 那就重试——只不过重试之前先把它收下来。
 *
 * 「删掉蜜罐与过快」那个批量删除**刻意不碰** `no_token` / `verify_down`：
 * 这两类的成因很可能是「这个人的网络到不了 Cloudflare」，里面混着真反馈，
 * 不能跟着脚本垃圾一起清（见 handleDelete）。
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
  const succeed = (ticket) => {
    if (wantsJson) return json({ ok: true, ticket }, 200)
    // 查询码跟着跳转带过去，用户才能在自己那条上看到它
    const target = '/wanted-done?t=' + encodeURIComponent(ticket)
    return Response.redirect(new URL(target, request.url).toString(), 303)
  }

  if (!fields) return fail(400, 'invalid body', '/wanted?error=1')

  /*
   * 四条「可疑」的理由。注意它们**不是一回事**：
   *
   *   trap        蜜罐被填              ┐ 几乎可以确定是脚本，是「删掉蜜罐与过快」
   *   fast        填得太快              ┘ 批量清掉的那两类
   *   no_token    请求里没有令牌        ┐ 大概率是这个人的网络到不了 Cloudflare，
   *   verify_down siteverify 不可达     ┘ 里面混着真反馈，**不能跟着一起批量删**
   *
   * 分开记理由，是为了让维护者既能一键清掉脚本垃圾，又不会连真稿子一起清；
   * 复核时看到某条其实是真人写的，点「标记为正常」它就计入公开统计。
   */
  let suspicious = 0
  let flagReason = ''

  const trap = clean(fields.fb_trap, 100)
  if (trap) {
    suspicious = 1
    flagReason = 'trap'
    console.warn('[feedback] 蜜罐字段被填，标记为可疑但不丢弃')
  }
  const elapsed = Number(fields.elapsed)
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS) {
    suspicious = 1
    if (!flagReason) flagReason = 'fast'
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
    // 照收，但标出来让维护者看一眼——**不拒人**，也**不当成没发生**
    suspicious = 1
    if (!flagReason) flagReason = verdict.state === 'missing' ? 'no_token' : 'verify_down'
    console.warn('[feedback] Turnstile ' + verdict.state + '（' + verdict.detail + '），照收并标记')
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

    const ticket = makeTicket()
    await env.DB.prepare(
      `INSERT INTO feedback
         (ticket, category, kind, want, scene, article, contact, status,
          suspicious, flag_reason, ip_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`
    )
      .bind(
        ticket, category, kind, want, scene, article || null, contact || null,
        suspicious, flagReason || null, hash, now, now
      )
      .run()

    return succeed(ticket)
  } catch (error) {
    console.error('[feedback] 写入失败', error)
    return fail(500, 'storage error', '/wanted?error=1')
  }
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

/* ------------------------------------------------------------------ 提交者自查 */

/**
 * 凭查询码查自己那条的状态，公开。
 *
 * 用随机查询码而不是自增 id，就是为了让这个接口能公开：id 是连续的，
 * 谁都能从 1 数到尾把每条的归属翻出来；查询码猜不到，所以只有拿到码的人能查。
 *
 * 返回里**不回显联系方式**，正文只回显前 40 个字——够本人认出是自己那条，
 * 又不至于让人拿它当内容接口用。
 */
async function handleLookup(request, env) {
  const ticket = cleanTicket(new URL(request.url).searchParams.get('t'))
  if (!ticket) return json({ error: 'invalid ticket' }, 400)

  await ensureSchema(env)
  const row = await env.DB.prepare(
    `SELECT ticket, category, kind, want, status,
            resolved_label, resolved_url, reject_reason, created_at, updated_at
       FROM feedback WHERE ticket = ?`
  )
    .bind(ticket)
    .first()

  if (!row) return json({ found: false, ticket }, 200)

  return json(
    {
      found: true,
      ticket: row.ticket,
      category: row.category,
      kind: row.kind,
      wantPreview:
        String(row.want).length > WANT_PREVIEW
          ? String(row.want).slice(0, WANT_PREVIEW) + '…'
          : String(row.want),
      status: row.status,
      statusLabel: STATUS_LABEL[row.status] || row.status,
      createdAtText: utc8Stamp(Number(row.created_at)),
      updatedAtText: row.updated_at ? utc8Stamp(Number(row.updated_at)) : '',
      resolved: row.resolved_url
        ? { label: row.resolved_label || row.category, url: row.resolved_url }
        : null,
      // 「不采纳」的原因原样返回；「维护者没写」的兜底文案放在页面上
      // （只有那里知道 QQ 群号，见 FeedbackLookup.vue）
      rejectReason: row.reject_reason || ''
    },
    200
  )
}

/* ------------------------------------------------------------------ 审计 */

/**
 * 审计明细：**服务端分页 + 服务端筛选**。
 *
 * 为什么筛选必须在服务端：以前是「一次拉最多 1000 条，前端 filter」。那样有两个毛病——
 * 一页塞上千条内容（每条都是几百字的正文），浏览器先卡；更要命的是超过上限后，
 * `ORDER BY suspicious ASC, created_at DESC` 截掉的恰好是**最老的、最该处理的那批**，
 * 而页面不会有任何提示。现在筛选条件进 SQL，前端只管渲染当前这一页。
 *
 * 参数（都可选）：`page` / `per`（白名单 20·50·100）/ `status` / `category` / `kind` /
 * `suspicious`（only / hide）/ `q`（在 want·scene·article·contact 里模糊搜）。
 *
 * 返回里的 `summary` 是**全表**统计，和筛选无关——顶部那几个数字不该跟着筛选跳。
 */
function likePattern(value) {
  const raw = clean(value, KEYWORD_MAX)
  if (!raw) return ''
  // % 和 _ 是 LIKE 的通配符，用户搜这两个字符时要当字面量
  return '%' + raw.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%'
}

async function handleList(request, env) {
  if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401)

  await ensureSchema(env)

  const url = new URL(request.url)

  const requestedPer = Number(url.searchParams.get('per'))
  const per = LIST_PER_CHOICES.includes(requestedPer) ? requestedPer : LIST_PER_DEFAULT

  const filters = []
  const values = []

  const status = clean(url.searchParams.get('status'), 16)
  if (status) {
    if (!STATUSES.has(status)) return json({ error: 'invalid status' }, 400)
    filters.push('status = ?')
    values.push(status)
  }
  const category = clean(url.searchParams.get('category'), 32)
  if (category) {
    if (!CATEGORIES.includes(category)) return json({ error: 'invalid category' }, 400)
    filters.push('category = ?')
    values.push(category)
  }
  const kind = clean(url.searchParams.get('kind'), 8)
  if (kind) {
    if (!KINDS.has(kind)) return json({ error: 'invalid kind' }, 400)
    filters.push('kind = ?')
    values.push(kind)
  }
  const suspicious = clean(url.searchParams.get('suspicious'), 8)
  if (suspicious === 'only') filters.push('suspicious = 1')
  else if (suspicious === 'hide') filters.push('suspicious = 0')
  else if (suspicious) return json({ error: 'invalid suspicious' }, 400)

  const pattern = likePattern(url.searchParams.get('q'))
  if (pattern) {
    filters.push(
      "(want LIKE ? ESCAPE '\\' OR scene LIKE ? ESCAPE '\\'" +
      " OR article LIKE ? ESCAPE '\\' OR contact LIKE ? ESCAPE '\\')"
    )
    values.push(pattern, pattern, pattern, pattern)
  }

  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : ''

  const counted = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback' + where)
    .bind(...values)
    .first()
  const filtered = counted ? Number(counted.n) || 0 : 0
  const pages = Math.max(1, Math.ceil(filtered / per))

  const requestedPage = Number(url.searchParams.get('page'))
  const rawPage =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.floor(requestedPage) : 1
  // 越界就夹到有效范围（比如刚把最后一页删空），别回一个空列表让人以为是筛选问题
  const page = Math.min(rawPage, pages)

  const { results } = await env.DB.prepare(
    `SELECT id, ticket, category, kind, want, scene, article, contact, status,
            resolved_label, resolved_url, reject_reason, suspicious, flag_reason,
            created_at, updated_at
       FROM feedback` + where +
    ' ORDER BY suspicious ASC, created_at DESC LIMIT ? OFFSET ?'
  )
    .bind(...values, per, (page - 1) * per)
    .all()

  const items = (results || []).map((row) => ({
    id: row.id,
    ticket: row.ticket || '',
    category: row.category,
    kind: row.kind,
    want: row.want,
    scene: row.scene,
    article: row.article || '',
    contact: row.contact || '',
    status: row.status,
    resolvedLabel: row.resolved_label || '',
    resolvedUrl: row.resolved_url || '',
    rejectReason: row.reject_reason || '',
    suspicious: Number(row.suspicious) === 1,
    flagReason: row.flag_reason || '',
    createdAt: Number(row.created_at),
    createdAtText: utc8Stamp(Number(row.created_at)),
    day: utc8Day(new Date(Number(row.created_at)))
  }))

  // 下面几条都是**全表**统计，跟当前筛选/分页无关：
  // 顶部那几个数字是给人判断「还有多少活」的，不该跟着筛选一起跳。
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM feedback WHERE suspicious = 0'
  ).first()
  const flagRows = await env.DB.prepare(
    'SELECT suspicious, flag_reason, COUNT(*) AS n FROM feedback GROUP BY suspicious, flag_reason'
  ).all()
  const kindStatusRows = await env.DB.prepare(
    `SELECT kind, status, COUNT(*) AS n FROM feedback
      WHERE suspicious = 0 GROUP BY kind, status`
  ).all()
  const categoryRows = await env.DB.prepare(
    `SELECT category, status, COUNT(*) AS n FROM feedback
      WHERE suspicious = 0 GROUP BY category, status`
  ).all()

  const byStatus = { new: 0, planned: 0, done: 0, rejected: 0 }
  const byKind = { gap: 0, fix: 0 }
  for (const row of kindStatusRows.results || []) {
    const n = Number(row.n) || 0
    if (row.kind === 'gap' || row.kind === 'fix') byKind[row.kind] += n
    if (Object.prototype.hasOwnProperty.call(byStatus, row.status)) byStatus[row.status] += n
  }

  let suspiciousTotal = 0
  let unverified = 0
  let deletable = 0
  for (const row of flagRows.results || []) {
    if (Number(row.suspicious) !== 1) continue
    const n = Number(row.n) || 0
    suspiciousTotal += n
    if (row.flag_reason === 'no_token' || row.flag_reason === 'verify_down') unverified += n
    // 「删掉蜜罐与过快」实际会删掉的就是这两类
    if (row.flag_reason === 'trap' || row.flag_reason === 'fast') deletable += n
  }

  return json(
    {
      items,
      page,
      per,
      pages,
      filtered,
      summary: {
        total: totals ? Number(totals.n) || 0 : 0,
        suspicious: suspiciousTotal,
        unverified,
        deletable,
        byStatus,
        byCategory: summarize(categoryRows.results || []),
        byKind
      }
    },
    200
  )
}

/** 改状态 / 已上线链接。所有字段都可选，只改传上来的那些。 */
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
    // 「不采纳」退回别的状态时，原因也清掉（同一次请求里给了新原因就听新的）
    if (body.status !== 'rejected' && body.rejectReason === undefined) {
      sets.push('reject_reason = NULL')
    }
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
  /*
   * 「不采纳」的原因。空字符串 = 清掉，此时提交者看到的是页面上的兜底说明
   * （见 FeedbackLookup.vue），不是一片空白。
   * 和「已上线」的标签/链接一样，只由维护者填，提交者凭编号能看到。
   */
  if (body.rejectReason !== undefined) {
    sets.push('reject_reason = ?')
    values.push(clean(body.rejectReason, REJECT_MAX) || null)
  }
  /*
   * 标记为正常 / 可疑。
   * 「标记为正常」是复核那条回路的关键：被标可疑的条目**不进公开统计**，
   * 如果只能删不能改回来，那 Cloudflare 一不可达就得把整批真反馈删掉。
   */
  if (body.suspicious === false) {
    sets.push('suspicious = 0', 'flag_reason = NULL')
  } else if (body.suspicious === true) {
    sets.push("suspicious = 1", "flag_reason = 'manual'")
  }

  /*
   * 刻意**不支持改分类**。
   * 分类是公开统计的聚合键，能让后台随手改的话，「分类」就变成维护者的判断而非
   * 提交者说的东西；而且统计数字会在没人察觉的情况下被改写。
   * 选错了就让它错着——那本身也是一条关于选项设计的信息。
   */
  if (body.category !== undefined) {
    return json({ error: '分类不可修改' }, 400)
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

  /*
   * 一次性清掉「几乎可以确定是脚本」的那些。
   *
   * **刻意只删 trap / fast**，不含 no_token / verify_down：后两者的成因很可能是
   * 「这个人的网络到不了 Cloudflare」，里面混着真实反馈。要是在整片不可达的时候
   * 让这个按钮把它们一次清空，那就是拿一个误报删掉了所有人的稿子。
   * 那两类留在列表里逐条判断，或者点「标记为正常」让它们计入统计。
   */
  if (body && body.allSuspicious === true) {
    const result = await env.DB.prepare(
      "DELETE FROM feedback WHERE suspicious = 1 AND flag_reason IN ('trap', 'fast')"
    ).run()
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
    /^\/api\/feedback\/(login|logout|session|list|stats|lookup|update|delete)$/
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
  if (action === 'lookup') return guard(() => handleLookup(context.request, context.env))
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

/** 供测试脚本比对「这里和 worker/schema.sql 是不是同一份定义」，并单独测补列迁移 */
export { schemaStatements, bootstrapSchema, MIGRATABLE_COLUMNS, CATEGORIES, STATUSES }
