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
 * 维护者在这里能做的事：看清每条 → 改分类（分类是聚合的键，选错会让统计错位）
 * → 改状态 → 填「已上线」的标签和链接（会出现在公开状态页）→ 删单条或一键清掉可疑。
 */
import { computed, onMounted, ref } from 'vue'

interface FeedbackItem {
  id: number
  category: string
  kind: 'gap' | 'fix' | string
  want: string
  scene: string
  article: string
  contact: string
  status: string
  resolvedLabel: string
  resolvedUrl: string
  suspicious: boolean
  createdAt: number
  createdAtText: string
}

interface Summary {
  total: number
  suspicious: number
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

const filterCategory = ref('')
const filterKind = ref('')
const filterStatus = ref('')
const filterSuspicious = ref('')
const keyword = ref('')

const categories = computed(() => {
  const set = new Set<string>(CATEGORIES)
  for (const item of items.value) set.add(item.category)
  return [...set]
})

const visible = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (filterSuspicious.value === 'only' && !item.suspicious) return false
    if (filterSuspicious.value === 'hide' && item.suspicious) return false
    if (filterCategory.value && item.category !== filterCategory.value) return false
    if (filterStatus.value && item.status !== filterStatus.value) return false
    if (filterKind.value && item.kind !== filterKind.value) return false
    if (needle) {
      const haystack = (
        item.want + '\n' + item.scene + '\n' + item.article + '\n' + item.contact
      ).toLowerCase()
      if (haystack.indexOf(needle) < 0) return false
    }
    return true
  })
})

async function request(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init && init.headers ? init.headers : {}) },
    ...init
  })
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

async function load() {
  loading.value = true
  message.value = ''
  const { ok, status, data } = await request('/api/feedback/list')
  loading.value = false
  if (ok && data) {
    items.value = data.items || []
    summary.value = data.summary || null
    return
  }
  if (status === 401) {
    authed.value = false
    message.value = '会话已过期，请重新登录。'
    return
  }
  message.value = '读取失败，请稍后重试。'
}

/** 只把改动的字段发上去，避免覆盖别人（或另一个标签页）刚做的改动 */
async function patch(item: FeedbackItem, fields: Record<string, unknown>) {
  const { ok, status, data } = await request('/api/feedback/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, ...fields })
  })
  if (!ok) {
    message.value = '保存失败：' + (data?.error || ('HTTP ' + status))
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

async function setCategory(item: FeedbackItem, category: string) {
  const previous = item.category
  item.category = category
  if (!(await patch(item, { category }))) item.category = previous
  else await load()
}

async function saveResolution(item: FeedbackItem) {
  if (
    await patch(item, {
      resolvedLabel: item.resolvedLabel,
      resolvedUrl: item.resolvedUrl
    })
  ) {
    message.value = item.resolvedUrl
      ? '已保存，会显示在公开状态页上。'
      : '已清空这条的公开链接。'
    await load()
  }
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
  const count = summary.value?.suspicious ?? 0
  if (!count) {
    message.value = '没有可疑条目。'
    return
  }
  if (!window.confirm('一次删掉全部 ' + count + ' 条可疑反馈？删掉之后无法恢复。')) return
  const { ok, data } = await request('/api/feedback/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allSuspicious: true })
  })
  message.value = ok ? '已删除 ' + (data?.deleted ?? count) + ' 条。' : '删除失败。'
  await load()
}

/** 数据归属：随时能把筛出来的这部分导成纯文本带走 */
function buildMarkdown() {
  const lines = [
    '| id | 时间 | 分类 | 类型 | 想要什么 | 场景 | 针对 | 联系方式 | 状态 | 可疑 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ]
  const cell = (value: string) => String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ')
  for (const item of visible.value) {
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
      ' | ' + (item.suspicious ? '是' : '') +
      ' |'
    )
  }
  return lines.join('\n')
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(buildMarkdown())
    message.value = '已复制 ' + visible.value.length + ' 条为 Markdown 表格。'
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
        <strong>待看 {{ summary ? summary.total : items.length }} 条</strong>
        <span v-if="summary">
          缺口 {{ summary.byKind.gap }} · 勘误 {{ summary.byKind.fix }}
        </span>
        <span v-if="summary && summary.suspicious" class="fb-audit__suspect-count">
          可疑 {{ summary.suspicious }}
        </span>
        <span class="fb-audit__spacer" />
        <button class="fb-audit__ghost" type="button" @click="load">刷新</button>
        <button class="fb-audit__ghost" type="button" @click="copyMarkdown">复制 Markdown</button>
        <button
          v-if="summary && summary.suspicious"
          class="fb-audit__ghost fb-audit__ghost--danger"
          type="button"
          @click="removeAllSuspicious"
        >
          删掉全部可疑
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
        <input v-model="keyword" type="search" placeholder="搜索内容 / 联系方式" aria-label="搜索" />
      </div>

      <p v-if="loading" class="fb-audit__hint">读取中…</p>
      <p v-else-if="!visible.length" class="fb-audit__hint">没有符合条件的反馈。</p>

      <ul v-else class="fb-audit__list">
        <li
          v-for="item in visible"
          :key="item.id"
          class="fb-audit__item"
          :class="'fb-audit__item--' + item.status"
        >
          <div class="fb-audit__item-head">
            <span class="fb-audit__id">#{{ item.id }}</span>
            <select
              class="fb-audit__category"
              :value="item.category"
              aria-label="分类"
              @change="setCategory(item, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
            </select>
            <span class="fb-audit__tag" :class="{ 'fb-audit__tag--fix': item.kind === 'fix' }">
              {{ item.kind === 'fix' ? '勘误' : '缺口' }}
            </span>
            <span class="fb-audit__time">{{ item.createdAtText }}</span>
            <span v-if="item.suspicious" class="fb-audit__suspect">可疑</span>
            <span class="fb-audit__spacer" />
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
        </li>
      </ul>
    </template>
  </div>
</template>
