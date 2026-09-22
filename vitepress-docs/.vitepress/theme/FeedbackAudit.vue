<script setup lang="ts">
/**
 * 反馈审计页。
 *
 * 页面本身是公开的静态 HTML（不含任何反馈数据，也不会被预渲染进数据），
 * **数据全部在客户端凭 HttpOnly 会话 Cookie 拉取**，Cookie 的 Path 限定在
 * /api/feedback 下，普通页面请求根本不会带上它。
 *
 * 鉴权由 functions/api/feedback/[[path]].js 负责：
 * 密码来自环境变量 FEEDBACK_ADMIN_PASSWORD，比较是定长的，
 * 连续失败 5 次锁定 15 分钟。
 *
 * 维护者在这里能做的事：看清每条 → 改状态 → 填「已上线」的标签和链接（会出现在公开
 * 状态页）→ 删单条，或一键清掉「蜜罐 / 过快」那两类；被标可疑的条目可以点
 * 「标记为正常」把它放回公开统计（分类刻意只读，不改）。
 */
import { computed, onMounted, ref, watch } from 'vue'

interface FeedbackItem {
  id: number
  ticket: string
  category: string
  kind: 'gap' | 'fix' | string
  want: string
  scene: string
  article: string
  contact: string
  status: string
  resolvedLabel: string
  resolvedUrl: string
  /** 不采纳的原因（只有 rejected 时可能有值） */
  rejectReason: string
  suspicious: boolean
  flagReason: string
  createdAt: number
  createdAtText: string
}

/**
 * 可疑的原因。**它们不是一回事**，所以要分开显示：
 *   trap / fast             几乎可以确定是脚本，是「删掉蜜罐与过快」批量清的对象
 *   manual                  维护者自己标的
 *   no_token / verify_down  Turnstile 时代留下的历史条目（验证已下线，新条目不会再出现）。
 *                           它们很可能只是当时网络到不了 Cloudflare 的真反馈，
 *                           所以批量删刻意不碰，留在这里逐条看。
 */
const FLAG_LABEL: Record<string, string> = {
  trap: '可疑·蜜罐',
  fast: '可疑·过快',
  no_token: '可疑·未验证',
  verify_down: '可疑·验证不可达',
  manual: '可疑·手动'
}

interface Summary {
  /** 全表「正常」条数（不含可疑） */
  total: number
  /** 全表可疑条数 */
  suspicious: number
  /** 其中「没通过人机验证」的历史条目：no_token / verify_down */
  unverified: number
  /** 其中「蜜罐 / 过快」的：批量删除会删掉的条数 */
  deletable: number
  byStatus: Record<string, number>
  byCategory: Array<{ category: string; total: number; byStatus: Record<string, number> }>
  byKind: { gap: number; fix: number }
}

const CATEGORIES = [
  '校园网', '一卡通', '图书馆', '宿舍', '食堂快递',
  '教务学籍', '校医院', '安全防骗', '技术资源', '其他'
]

const STATUSES = [
  { key: 'new', label: '未看' },
  { key: 'planned', label: '计划中' },
  { key: 'done', label: '已上线' },
  { key: 'rejected', label: '不采纳' }
]
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUSES.map((item) => [item.key, item.label])
)

const authed = ref<boolean | null>(null)
const configured = ref(true)
const password = ref('')
const items = ref<FeedbackItem[]>([])
const summary = ref<Summary | null>(null)
const loading = ref(false)
const busy = ref(false)
const message = ref('')

/** 分页：**服务端分页**，默认每页 20 条。筛选也在服务端，所以翻页/筛选都要重新拉 */
const PER_CHOICES = [20, 50, 100]
const page = ref(1)
const per = ref(PER_CHOICES[0])
const pages = ref(1)
/** 当前筛选条件下共多少条（不是全表；全表在 summary 里） */
const filtered = ref(0)

const filterCategory = ref('')
const filterKind = ref('')
const filterStatus = ref('')
const filterSuspicious = ref('')
const keyword = ref('')

/** 分类下拉的候选：固定枚举 + 库里真出现过的（后者来自全表统计，和分页无关） */
const categories = computed(() => {
  const set = new Set<string>(CATEGORIES)
  for (const row of summary.value?.byCategory || []) set.add(row.category)
  return [...set]
})

const unverifiedCount = computed(() => summary.value?.unverified ?? 0)

/**
 * 所有请求都走这里。**绝不抛异常**：网络断掉时 fetch 会 reject，
 * 抛出去会让调用方卡在 loading = true 上（页面永远显示「读取中…」），
 * 所以统一收敛成 `{ ok: false, status: 0 }`。
 */
async function request(url: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init && init.headers ? init.headers : {}) },
      ...init
    })
  } catch {
    return { ok: false, status: 0, data: null as any }
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data: data as any }
}

async function checkSession() {
  const { ok, data } = await request('/api/feedback/session')
  if (!ok || !data) {
    authed.value = false
    message.value = '接口不可用。本地开发时请用 wrangler pages dev 运行，才能带上 Functions。'
    return
  }
  configured.value = data.configured !== false
  authed.value = data.authed === true
  if (authed.value) await load()
}

async function login() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  const { ok, status, data } = await request('/api/feedback/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password.value })
  })
  busy.value = false
  if (ok) {
    password.value = ''
    authed.value = true
    await load()
    return
  }
  if (status === 0) {
    message.value = '请求发不出去，检查一下网络。'
    return
  }
  if (status === 429) {
    message.value = '失败次数过多，请 ' + (data?.retryAfterMinutes ?? 15) + ' 分钟后再试。'
    return
  }
  if (status === 503) {
    message.value = '服务端没有配置 FEEDBACK_ADMIN_PASSWORD，审计接口已停用。'
    return
  }
  message.value = '密码不正确。'
}

async function logout() {
  await request('/api/feedback/logout', { method: 'POST' })
  items.value = []
  summary.value = null
  authed.value = false
}

/** 当前筛选条件拼成查询串。分页和筛选都在服务端，前端只负责把状态发过去 */
function listQuery(): string {
  const params = new URLSearchParams()
  params.set('page', String(page.value))
  params.set('per', String(per.value))
  if (filterStatus.value) params.set('status', filterStatus.value)
  if (filterCategory.value) params.set('category', filterCategory.value)
  if (filterKind.value) params.set('kind', filterKind.value)
  if (filterSuspicious.value) params.set('suspicious', filterSuspicious.value)
  const q = keyword.value.trim()
  if (q) params.set('q', q)
  return params.toString()
}

/**
 * 拉当前这一页。
 *
 * 页码、每页条数、总数都以**服务端返回的**为准：它会把你请求的越界页码夹回有效范围
 * （典型场景：在最后一页把最后一条删了，或刚改完筛选）。前端自己算容易和数据库对不上。
 */
let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  message.value = ''
  const { ok, status, data } = await request('/api/feedback/list?' + listQuery())
  // 慢的那次请求后回来时不要覆盖新的一页
  if (seq !== loadSeq) return
  loading.value = false
  if (ok && data) {
    items.value = data.items || []
    summary.value = data.summary || null
    pages.value = Number(data.pages) || 1
    filtered.value = Number(data.filtered) || 0
    page.value = Number(data.page) || 1
    if (PER_CHOICES.includes(Number(data.per))) per.value = Number(data.per)
    return
  }
  if (status === 401) {
    authed.value = false
    message.value = '会话已过期，请重新登录。'
    return
  }
  message.value = status === 0 ? '请求发不出去，检查一下网络。' : '读取失败，请稍后重试。'
}

/** 筛选变了就回到第 1 页重拉（筛选在服务端，翻页只是换 OFFSET） */
function reload() {
  page.value = 1
  void load()
}

function goPage(delta: number) {
  const next = Math.min(Math.max(page.value + delta, 1), pages.value)
  if (next === page.value) return
  page.value = next
  void load()
}

let keywordTimer: ReturnType<typeof setTimeout> | null = null
/** 搜索框每敲一个字都拉一次太吵，停下来再拉 */
function onKeywordInput() {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(reload, 350)
}

watch([filterCategory, filterKind, filterStatus, filterSuspicious], reload)

/** 只把改动的字段发上去，避免覆盖别人（或另一个标签页）刚做的改动 */
async function patch(item: FeedbackItem, fields: Record<string, unknown>) {
  const { ok, status, data } = await request('/api/feedback/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, ...fields })
  })
  if (!ok) {
    message.value =
      status === 0
        ? '请求没发出去，这一条没保存上，检查一下网络再试。'
        : '保存失败：' + (data?.error || ('HTTP ' + status))
    await load()
    return false
  }
  return true
}

async function setStatus(item: FeedbackItem, status: string) {
  const previous = item.status
  item.status = status
  if (status !== 'done') {
    item.resolvedLabel = ''
    item.resolvedUrl = ''
  }
  if (!(await patch(item, { status }))) item.status = previous
  else await load()
}

async function saveResolution(item: FeedbackItem) {
  if (
    await patch(item, {
      resolvedLabel: item.resolvedLabel,
      resolvedUrl: item.resolvedUrl
    })
  ) {
    // 顺序不能反：load() 会把 message 清空，所以先说 load 再写这句话
    const text = item.resolvedUrl
      ? '已保存，会显示在公开状态页上。'
      : '已清空这条的公开链接。'
    await load()
    message.value = text
  }
}

/** 「不采纳」的原因：提交者凭编号能看到。留空就清掉，那边会显示兜底说明 */
async function saveRejectReason(item: FeedbackItem) {
  if (!(await patch(item, { rejectReason: item.rejectReason }))) return
  const saved = item.rejectReason.trim().length > 0
  await load()
  message.value = saved
    ? '已保存不采纳的原因，提交者凭编号能看到。'
    : '已清空原因；提交者看到的是兜底说明，不是空白。'
}

async function remove(item: FeedbackItem) {
  if (!window.confirm('删除第 ' + item.id + ' 条？删掉之后无法恢复。')) return
  const { ok } = await request('/api/feedback/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id })
  })
  if (!ok) {
    message.value = '删除失败。'
    return
  }
  await load()
}

async function removeAllSuspicious() {
  const total = summary.value?.suspicious ?? 0
  // 条数取自**全表统计**，不是当前这一页：批量删是全表的动作，
  // 拿当前页去数会严重低估（分页之后每页就那么几条）
  const deletable = summary.value?.deletable ?? 0
  if (!total) {
    message.value = '没有可疑条目。'
    return
  }
  if (!deletable) {
    message.value =
      '现在没有「蜜罐 / 填得太快」的可疑条目。剩下 ' + total +
      ' 条是 Turnstile 时代留下的「未验证 / 验证不可达」，只能逐条复核——' +
      '确认是真人写的那条，点「标记为正常」。'
    return
  }
  if (
    !window.confirm(
      '删掉 ' + deletable + ' 条「蜜罐 / 填得太快」的可疑反馈？删掉之后无法恢复。\n\n' +
      '当前 ' + total + ' 条可疑里有 ' + (total - deletable) + ' 条是历史遗留的「未验证」，' +
      '这里不会动它们——那可能只是当年网络到不了 Cloudflare 的真反馈。'
    )
  ) {
    return
  }
  const { ok, data } = await request('/api/feedback/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allSuspicious: true })
  })
  const text = ok ? '已删除 ' + (data?.deleted ?? 0) + ' 条。' : '删除失败。'
  await load()
  message.value = text
}

/** 复核后认为是真反馈：把可疑标记去掉，它就会计入公开统计 */
async function markClean(item: FeedbackItem) {
  if (!(await patch(item, { suspicious: false }))) return
  await load()
  message.value = '已标记为正常，现在会计入公开统计。'
}

/** 数据归属：把**当前这一页**导成纯文本带走（要全量就用 scripts/feedback-report.mjs） */
function buildMarkdown() {
  const lines = [
    '| id | 时间 | 分类 | 类型 | 想要什么 | 场景 | 针对 | 联系方式 | 状态 | 不采纳原因 | 可疑 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ]
  const cell = (value: string) => String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ')
  for (const item of items.value) {
    lines.push(
      '| ' + item.id +
      ' | ' + item.createdAtText +
      ' | ' + cell(item.category) +
      ' | ' + (item.kind === 'fix' ? '勘误' : '缺口') +
      ' | ' + cell(item.want) +
      ' | ' + cell(item.scene) +
      ' | ' + cell(item.article || '—') +
      ' | ' + cell(item.contact || '—') +
      ' | ' + (STATUS_LABEL[item.status] || item.status) +
      ' | ' + cell(item.rejectReason || '') +
      ' | ' + (item.suspicious ? '是' : '') +
      ' |'
    )
  }
  return lines.join('\n')
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(buildMarkdown())
    message.value = '已复制当前页 ' + items.value.length + ' 条为 Markdown 表格。'
  } catch {
    message.value = '复制失败，请改用本地脚本：node scripts/feedback-report.mjs'
  }
}

onMounted(() => {
  void checkSession()
})
</script>

<template>
  <div class="fb-audit">
    <p v-if="authed === null" class="fb-audit__hint">正在检查登录状态…</p>

    <template v-else-if="!authed">
      <p v-if="!configured" class="fb-audit__error">
        服务端没有配置 <code>FEEDBACK_ADMIN_PASSWORD</code>，审计接口已停用。
        请在 Cloudflare Pages 项目的环境变量里设置它，本地开发放在
        <b>运行 wrangler 的目录</b>下的 <code>.dev.vars</code>。
      </p>
      <form v-else class="fb-audit__login" @submit.prevent="login">
        <label class="fb-audit__login-label" for="fb-admin-password">审计口令</label>
        <input
          id="fb-admin-password"
          v-model="password"
          class="fb-audit__login-input"
          type="password"
          autocomplete="current-password"
          required
        />
        <button class="fb-audit__login-button" type="submit" :disabled="busy">
          {{ busy ? '验证中…' : '进入' }}
        </button>
      </form>
      <p class="fb-audit__msg" role="status" aria-live="polite">{{ message }}</p>
    </template>

    <template v-else>
      <div class="fb-audit__bar">
        <strong>未看 {{ summary ? summary.byStatus.new : 0 }} 条</strong>
        <span v-if="summary">
          正常共 {{ summary.total }} · 缺口 {{ summary.byKind.gap }} · 勘误 {{ summary.byKind.fix }}
        </span>
        <span v-if="summary && summary.suspicious" class="fb-audit__suspect-count">
          可疑 {{ summary.suspicious }}
        </span>
        <span
          v-if="unverifiedCount"
          class="fb-audit__suspect-count"
          title="Turnstile 时代的历史条目：当年没有令牌或验证不可达。不计入公开统计，很可能只是当时网络到不了 Cloudflare 的真反馈，确认后点「标记为正常」"
        >
          其中未验证（历史） {{ unverifiedCount }}
        </span>
        <span class="fb-audit__spacer" />
        <button class="fb-audit__ghost" type="button" @click="load">刷新</button>
        <button class="fb-audit__ghost" type="button" @click="copyMarkdown">复制本页</button>
        <button
          v-if="summary && summary.suspicious"
          class="fb-audit__ghost fb-audit__ghost--danger"
          type="button"
          title="只删「蜜罐」和「填得太快」两类；历史遗留的「未验证」不动"
          @click="removeAllSuspicious"
        >
          删掉蜜罐与过快
        </button>
        <button class="fb-audit__ghost" type="button" @click="logout">退出</button>
      </div>

      <p class="fb-audit__msg" role="status" aria-live="polite">{{ message }}</p>

      <div v-if="summary && summary.byCategory.length" class="fb-audit__scroll">
        <table class="fb-audit__summary">
          <thead>
            <tr>
              <th>分类</th>
              <th>条数</th>
              <th v-for="status in STATUSES" :key="status.key">{{ status.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summary.byCategory" :key="row.category">
              <td>{{ row.category }}</td>
              <td>{{ row.total }}</td>
              <td v-for="status in STATUSES" :key="status.key">
                {{ row.byStatus[status.key] || 0 }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="fb-audit__filters">
        <select v-model="filterCategory" aria-label="按分类筛选">
          <option value="">全部分类</option>
          <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="filterKind" aria-label="按类型筛选">
          <option value="">全部类型</option>
          <option value="gap">缺口</option>
          <option value="fix">勘误</option>
        </select>
        <select v-model="filterStatus" aria-label="按状态筛选">
          <option value="">全部状态</option>
          <option v-for="status in STATUSES" :key="status.key" :value="status.key">
            {{ status.label }}
          </option>
        </select>
        <select v-model="filterSuspicious" aria-label="按可疑状态筛选">
          <option value="">含可疑</option>
          <option value="hide">只看正常</option>
          <option value="only">只看可疑</option>
        </select>
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索内容 / 联系方式"
          aria-label="搜索"
          @input="onKeywordInput"
        />
        <select v-model.number="per" aria-label="每页条数" @change="reload">
          <option v-for="choice in PER_CHOICES" :key="choice" :value="choice">
            每页 {{ choice }} 条
          </option>
        </select>
      </div>

      <!-- 符合当前筛选的条数；页码在下面的翻页条上 -->
      <p class="fb-audit__hint fb-audit__count">共 {{ filtered }} 条符合条件</p>

      <!--
        翻页时**不把列表清空**：一清空页面高度就跳一下，鼠标跟着乱跑。
        列表原地变淡 + 翻页条显示「读取中…」，位置不动的观感更稳。
      -->
      <p v-if="!items.length" class="fb-audit__hint">
        {{ loading ? '读取中…' : '没有符合条件的反馈。' }}
      </p>

      <ul v-else class="fb-audit__list" :class="{ 'fb-audit__list--loading': loading }">
        <li
          v-for="item in items"
          :key="item.id"
          class="fb-audit__item"
          :class="'fb-audit__item--' + item.status"
        >
          <div class="fb-audit__item-head">
            <!-- 左边一律是「只显示」：这里展示的是提交时选的东西，不该能改 -->
            <span class="fb-audit__id">#{{ item.id }}</span>
            <span class="fb-audit__tag fb-audit__tag--category">{{ item.category }}</span>
            <span class="fb-audit__tag" :class="{ 'fb-audit__tag--fix': item.kind === 'fix' }">
              {{ item.kind === 'fix' ? '勘误' : '缺口' }}
            </span>
            <span class="fb-audit__time">{{ item.createdAtText }}</span>
            <span v-if="item.ticket" class="fb-audit__ticket">{{ item.ticket }}</span>
            <span v-if="item.suspicious" class="fb-audit__suspect">
              {{ FLAG_LABEL[item.flagReason] || '可疑' }}
            </span>
            <span class="fb-audit__spacer" />
            <button
              v-if="item.suspicious"
              class="fb-audit__ghost"
              type="button"
              title="确认是真实反馈：去掉可疑标记，它就会计入公开统计"
              @click="markClean(item)"
            >
              标记为正常
            </button>
            <select
              class="fb-audit__status"
              :class="'fb-audit__status--' + item.status"
              :value="item.status"
              aria-label="处理状态"
              @change="setStatus(item, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="status in STATUSES" :key="status.key" :value="status.key">
                {{ status.label }}
              </option>
            </select>
            <button class="fb-audit__ghost" type="button" @click="remove(item)">删除</button>
          </div>

          <p class="fb-audit__want">{{ item.want }}</p>
          <p class="fb-audit__scene">{{ item.scene }}</p>
          <p v-if="item.article" class="fb-audit__article">针对：{{ item.article }}</p>
          <p v-if="item.contact" class="fb-audit__contact">联系方式：{{ item.contact }}</p>

          <div v-if="item.status === 'done'" class="fb-audit__resolve">
            <input
              v-model="item.resolvedLabel"
              type="text"
              maxlength="80"
              placeholder="给读者看的短标签，比如「校园卡补办流程」"
              aria-label="已上线标签"
            />
            <input
              v-model="item.resolvedUrl"
              type="text"
              maxlength="300"
              placeholder="站内地址或 https 链接，比如 /campus-card"
              aria-label="已上线链接"
            />
            <button class="fb-audit__ghost" type="button" @click="saveResolution(item)">
              保存公开链接
            </button>
          </div>

          <!--
            「不采纳」和「已上线」一样需要一个交代：为什么不做。
            提交者凭编号能看到这段字（见 FeedbackLookup.vue）；
            留空不算错，那边会显示一句兜底说明，不会是一片空白。
          -->
          <div v-else-if="item.status === 'rejected'" class="fb-audit__resolve fb-audit__resolve--reject">
            <input
              v-model="item.rejectReason"
              type="text"
              maxlength="200"
              placeholder="为什么不采纳，比如「属于院系内部流程，站里写不了」"
              aria-label="不采纳原因"
            />
            <button class="fb-audit__ghost" type="button" @click="saveRejectReason(item)">
              保存原因
            </button>
            <span class="fb-audit__resolve-note">
              留空也可以：提交者会看到「维护者没有写明原因」，并附一个 QQ 群入口，不会是一片空白。
            </span>
          </div>
        </li>
      </ul>

      <!--
        翻页。只在超过一页时出现；每页条数在筛选栏里选。
        分页在服务端（LIMIT / OFFSET），所以这里不缓存「下一页」的数据 ——
        删掉一条之后页码和总数都会变，每次都重新拉当前页最省心。
      -->
      <div v-if="pages > 1" class="fb-audit__pager">
        <button
          class="fb-audit__ghost"
          type="button"
          :disabled="loading || page <= 1"
          @click="goPage(-1)"
        >
          上一页
        </button>
        <span class="fb-audit__pager-info">
          {{ loading ? '读取中…' : '第 ' + page + ' / ' + pages + ' 页（共 ' + filtered + ' 条）' }}
        </span>
        <button
          class="fb-audit__ghost"
          type="button"
          :disabled="loading || page >= pages"
          @click="goPage(1)"
        >
          下一页
        </button>
      </div>
    </template>
  </div>
</template>
