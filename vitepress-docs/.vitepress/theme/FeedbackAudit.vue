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
 */
import { computed, onMounted, ref } from 'vue'

interface FeedbackItem {
  id: number
  category: string
  kind: 'gap' | 'fix' | string
  want: string
  scene: string
  contact: string
  status: string
  createdAt: number
  createdAtText: string
  day: string
}

interface CategorySummary {
  category: string
  total: number
  byStatus: Record<string, number>
}

interface Summary {
  total: number
  byCategory: CategorySummary[]
  byKind: { gap: number; fix: number }
}

const STATUS_LABEL: Record<string, string> = {
  new: '未看',
  planned: '计划中',
  done: '已上线',
  rejected: '不采纳'
}
const STATUS_ORDER = ['new', 'planned', 'done', 'rejected']

const authed = ref<boolean | null>(null)
const configured = ref(true)
const password = ref('')
const items = ref<FeedbackItem[]>([])
const summary = ref<Summary | null>(null)
const loading = ref(false)
const busy = ref(false)
const message = ref('')

const filterCategory = ref('')
const filterStatus = ref('')
const filterKind = ref('')
const keyword = ref('')

const categories = computed(() => {
  const set = new Set<string>()
  for (const item of items.value) set.add(item.category)
  return [...set].sort()
})

const visible = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (filterCategory.value && item.category !== filterCategory.value) return false
    if (filterStatus.value && item.status !== filterStatus.value) return false
    if (filterKind.value && item.kind !== filterKind.value) return false
    if (needle) {
      const haystack = (item.want + '\n' + item.scene + '\n' + item.contact).toLowerCase()
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
  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
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
    const wait = data && data.retryAfterMinutes ? data.retryAfterMinutes : 15
    message.value = '失败次数过多，请 ' + wait + ' 分钟后再试。'
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

async function setStatus(item: FeedbackItem, status: string) {
  const previous = item.status
  item.status = status
  const { ok } = await request('/api/feedback/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, status })
  })
  if (!ok) {
    item.status = previous
    message.value = '状态保存失败。'
    return
  }
  await load()
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

/** 数据归属：随时能把全部反馈导成纯文本带走 */
function buildMarkdown() {
  const lines = [
    '| id | 时间 | 分类 | 类型 | 想要什么 | 场景 | 联系方式 | 状态 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ]
  for (const item of visible.value) {
    const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
    lines.push(
      '| ' + item.id +
      ' | ' + item.createdAtText +
      ' | ' + cell(item.category) +
      ' | ' + (item.kind === 'fix' ? '勘误' : '缺口') +
      ' | ' + cell(item.want) +
      ' | ' + cell(item.scene) +
      ' | ' + cell(item.contact || '—') +
      ' | ' + (STATUS_LABEL[item.status] || item.status) +
      ' |'
    )
  }
  return lines.join('\n')
}

async function copyMarkdown() {
  const text = buildMarkdown()
  try {
    await navigator.clipboard.writeText(text)
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
        <strong>共 {{ summary ? summary.total : items.length }} 条</strong>
        <span v-if="summary">
          缺口 {{ summary.byKind.gap }} · 勘误 {{ summary.byKind.fix }}
        </span>
        <span class="fb-audit__spacer" />
        <button class="fb-audit__ghost" type="button" @click="load">刷新</button>
        <button class="fb-audit__ghost" type="button" @click="copyMarkdown">复制 Markdown</button>
        <button class="fb-audit__ghost" type="button" @click="logout">退出</button>
      </div>

      <p class="fb-audit__msg" role="status" aria-live="polite">{{ message }}</p>

      <table v-if="summary && summary.byCategory.length" class="fb-audit__summary">
        <thead>
          <tr>
            <th>分类</th>
            <th>总数</th>
            <th v-for="status in STATUS_ORDER" :key="status">{{ STATUS_LABEL[status] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.byCategory" :key="row.category">
            <td>{{ row.category }}</td>
            <td>{{ row.total }}</td>
            <td v-for="status in STATUS_ORDER" :key="status">{{ row.byStatus[status] || 0 }}</td>
          </tr>
        </tbody>
      </table>

      <div class="fb-audit__filters">
        <select v-model="filterCategory">
          <option value="">全部分类</option>
          <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="filterKind">
          <option value="">全部类型</option>
          <option value="gap">缺口</option>
          <option value="fix">勘误</option>
        </select>
        <select v-model="filterStatus">
          <option value="">全部状态</option>
          <option v-for="status in STATUS_ORDER" :key="status" :value="status">
            {{ STATUS_LABEL[status] }}
          </option>
        </select>
        <input v-model="keyword" type="search" placeholder="搜索内容 / 联系方式" />
      </div>

      <p v-if="loading" class="fb-audit__hint">读取中…</p>
      <p v-else-if="!visible.length" class="fb-audit__hint">还没有反馈。</p>

      <ul v-else class="fb-audit__list">
        <li v-for="item in visible" :key="item.id" class="fb-audit__item">
          <div class="fb-audit__item-head">
            <span class="fb-audit__id">#{{ item.id }}</span>
            <span class="fb-audit__tag">{{ item.category }}</span>
            <span class="fb-audit__tag" :class="{ 'fb-audit__tag--fix': item.kind === 'fix' }">
              {{ item.kind === 'fix' ? '勘误' : '缺口' }}
            </span>
            <span class="fb-audit__time">{{ item.createdAtText }}</span>
            <span class="fb-audit__spacer" />
            <select
              class="fb-audit__status"
              :value="item.status"
              @change="setStatus(item, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="status in STATUS_ORDER" :key="status" :value="status">
                {{ STATUS_LABEL[status] }}
              </option>
            </select>
            <button class="fb-audit__ghost" type="button" @click="remove(item)">删除</button>
          </div>
          <p class="fb-audit__want">{{ item.want }}</p>
          <p class="fb-audit__scene">{{ item.scene }}</p>
          <p v-if="item.contact" class="fb-audit__contact">联系方式：{{ item.contact }}</p>
        </li>
      </ul>
    </template>
  </div>
</template>
