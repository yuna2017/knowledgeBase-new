<script setup lang="ts">
/**
 * 需求反馈表单。
 *
 * 设计要点（见 docs/feedback-channel-design.md）：
 *
 * 1. **渐进增强，不是「必须有 JS」**。模板里的 `<form method="post" action="/api/feedback">`
 *    是真实存在的：VitePress 会把组件渲染进预渲染的 HTML，所以在 JS 完全没加载成功
 *    （脚本被拦、超时、报错）的情况下，浏览器仍能原生提交这份表单，
 *    服务端返回 303 跳到 /wanted-done。JS 只是把体验变好。
 *    所以**所有字段都无条件渲染**，「要修正哪一篇」不能做成 kind === 'fix' 才显示，
 *    否则无 JS 的读者根本没机会填。
 * 2. **绝不丢输入**。提交失败不 reset 表单；输入过程写草稿到 localStorage，
 *    刷新 / 崩溃 / 误关标签都不丢；失败时给「重试」和「复制内容」两条退路，
 *    复制这条路完全不依赖网络。
 * 3. 蜜罐字段对用户隐藏，脚本会填。服务端只把它标成「可疑」，**不丢**——
 *    浏览器自动填充有可能命中，真用户不该因此白填。
 */
import { onMounted, ref } from 'vue'
import { TURNSTILE_ACTION, TURNSTILE_SITE_KEY } from '../shared/turnstile'

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

const STORAGE_DRAFT = 'kb-feedback-draft-v2'
const STORAGE_PENDING = 'kb-feedback-pending-v2'
const MAX_ATTEMPTS = 3

/** 与 shared/contact.ts 保持一致：提交不上时的最终退路 */
const QQ_GROUP_NUMBER = '978801324'
const QQ_GROUP_URL = 'https://qm.qq.com/q/1DSuxKBV5a'

const formEl = ref<HTMLFormElement | null>(null)
const turnstileEl = ref<HTMLElement | null>(null)
/** 验证组件没加载出来时给一句解释——大陆访问 challenges.cloudflare.com 不一定稳 */
const turnstileStuck = ref(false)

const category = ref('')
const kind = ref('gap')
const want = ref('')
const scene = ref('')
const article = ref('')
const contact = ref('')
const trap = ref('') // 蜜罐

const sending = ref(false)
const message = ref('')
const canFallback = ref(false)

let startedAt = 0

const KIND_LABEL: Record<string, string> = {
  gap: '站里还没有',
  fix: '已有内容需要修正'
}

function collect() {
  const form = formEl.value
  // Turnstile 用隐式渲染时，它自己会往表单里塞一个隐藏 input，直接读出来就行
  const turnstileToken = form
    ? String(new FormData(form).get('cf-turnstile-response') || '')
    : ''
  return {
    category: category.value,
    kind: kind.value,
    want: want.value,
    scene: scene.value,
    article: article.value,
    contact: contact.value,
    fb_trap: trap.value,
    'cf-turnstile-response': turnstileToken,
    elapsed: Date.now() - startedAt
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------ 草稿与待发 */

function saveDraft() {
  try {
    localStorage.setItem(
      STORAGE_DRAFT,
      JSON.stringify({
        category: category.value,
        kind: kind.value,
        want: want.value,
        scene: scene.value,
        article: article.value,
        contact: contact.value
      })
    )
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可
  }
}

function restoreDraft() {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_DRAFT)
  } catch {
    return
  }
  if (!raw) return
  try {
    const saved = JSON.parse(raw)
    if (typeof saved.category === 'string') category.value = saved.category
    if (saved.kind === 'gap' || saved.kind === 'fix') kind.value = saved.kind
    if (typeof saved.want === 'string') want.value = saved.want
    if (typeof saved.scene === 'string') scene.value = saved.scene
    if (typeof saved.article === 'string') article.value = saved.article
    if (typeof saved.contact === 'string') contact.value = saved.contact
  } catch {
    // 草稿坏了就当没有
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_DRAFT)
    localStorage.removeItem(STORAGE_PENDING)
  } catch {
    // 忽略
  }
}

function savePending(payload: unknown) {
  try {
    localStorage.setItem(STORAGE_PENDING, JSON.stringify(payload))
  } catch {
    // 忽略
  }
}

/* ------------------------------------------------------------ 提交 */

/** 单次请求。返回 'ok' / 'error'，error 时带上可读原因。 */
async function postOnce(payload: Record<string, unknown>): Promise<{ ok: boolean; reason: string }> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      // keepalive：用户点完提交就切走或关标签页，请求也能发完
      keepalive: true
    })
    if (res.ok) return { ok: true, reason: '' }
    if (res.status === 429) {
      return { ok: false, reason: '提交太频繁了，请过一会儿再试' }
    }
    const data = await res.json().catch(() => null)
    const detail = data && typeof data.error === 'string' ? data.error : ''
    return { ok: false, reason: detail ? detail + '（' + res.status + '）' : '接口返回 ' + res.status }
  } catch {
    return { ok: false, reason: '请求没有发出去，可能是网络或接口暂时不可用' }
  }
}

async function send(payload: Record<string, unknown>) {
  if (sending.value) return
  sending.value = true
  canFallback.value = false
  message.value = '提交中…'

  let reason = '未知原因'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await postOnce(payload)
    if (result.ok) {
      clearDraft()
      message.value = '提交成功，正在跳转…'
      window.location.assign('/wanted-done')
      return
    }
    reason = result.reason
    // 频率限制重试没有意义，直接退出
    if (reason.indexOf('太频繁') >= 0) break
    if (attempt < MAX_ATTEMPTS) await sleep(600 * attempt)
  }

  sending.value = false
  canFallback.value = true
  savePending(payload)
  message.value =
    '提交失败：' + reason + '。内容已经留在页面上，也存了一份在本机——' +
    '可以点「重试」，或者点「复制内容」粘贴到 QQ 群。'
}

async function onSubmit(event: SubmitEvent) {
  event.preventDefault()
  await send(collect())
}

function retry() {
  void send(collect())
}

/* ------------------------------------------------------------ 复制兜底 */

function buildPlainText() {
  const data = collect()
  const lines = [
    '【YUNA 知识库 · 需求反馈】',
    '分类：' + (data.category || '（未选）'),
    '类型：' + (KIND_LABEL[data.kind] || data.kind),
    '想要什么 / 缺什么：',
    data.want
  ]
  if (data.article.trim()) {
    lines.push('', '要修正的内容：', data.article)
  }
  lines.push('', '什么场景下遇到的：', data.scene, '', '联系方式：' + (data.contact || '（未填）'))
  return lines.join('\n')
}

async function copyToClipboard() {
  const text = buildPlainText()
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      message.value = '已复制。把它粘贴到 QQ 群（群号 ' + QQ_GROUP_NUMBER + '）就可以。'
      return
    }
  } catch {
    // 落到下面的兜底方案
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  document.body.appendChild(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  document.body.removeChild(area)
  message.value = copied
    ? '已复制。把它粘贴到 QQ 群（群号 ' + QQ_GROUP_NUMBER + '）就可以。'
    : '复制失败，请手动选中表单内容再复制。'
}

/* ------------------------------------------------------------ 生命周期 */

/** 上次没发出去的那条：这里自动补发一次，避免用户再也不回来 */
async function flushPending() {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_PENDING)
  } catch {
    return
  }
  if (!raw) return

  // 先移除再发，避免多标签页同时打开时重复提交
  try {
    localStorage.removeItem(STORAGE_PENDING)
  } catch {
    // 忽略
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }

  const result = await postOnce(payload)
  if (result.ok) {
    message.value = '上次有一条没发送成功的反馈，刚才已经自动补发了。'
    return
  }
  savePending(payload)
}

/* ------------------------------------------------------------ 机器人验证 */

/**
 * 加载 Turnstile。没配 site key 就什么都不做——页面不引入任何第三方脚本。
 *
 * 用隐式渲染（脚本自己扫 `.cf-turnstile` 并往表单里塞隐藏 input），
 * 所以这段代码只负责注入脚本和设主题，令牌不用自己接管。
 *
 * 注意这是**尽力而为**：脚本被网络挡掉（大陆访问 challenges.cloudflare.com
 * 不一定稳）时验证组件不会出现，但表单照样能提交——服务端拿不到令牌只会
 * 把它标成可疑，不会拒。所以这里不重试、不阻塞，只给用户一句解释。
 */
function loadTurnstile() {
  if (!TURNSTILE_SITE_KEY) return
  if (document.querySelector('script[data-dsh-turnstile]')) return

  const container = turnstileEl.value
  // 站点自己的深浅色是手动切 class，不是系统偏好，所以显式告诉它用哪套
  if (container) {
    container.setAttribute(
      'data-theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    )
  }

  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  script.async = true
  script.defer = true
  script.setAttribute('data-dsh-turnstile', '1')
  script.addEventListener('error', () => {
    turnstileStuck.value = true
  })
  document.head.appendChild(script)

  // 兜底判断：给足时间还没渲染出 iframe，就当它没加载出来
  window.setTimeout(() => {
    if (!container || !container.querySelector('iframe')) turnstileStuck.value = true
  }, 8000)
}

onMounted(() => {
  startedAt = Date.now()
  restoreDraft()
  loadTurnstile()
  void flushPending()
})
</script>

<template>
  <form
    ref="formEl"
    class="feedback-form"
    method="post"
    action="/api/feedback"
    @submit="onSubmit"
    @input="saveDraft"
    @change="saveDraft"
  >
    <fieldset class="feedback-form__group">
      <legend class="feedback-form__group-title">你想说的是</legend>

      <div class="feedback-form__row">
        <label class="feedback-form__label" for="fb-category">和哪一块有关</label>
        <select id="fb-category" v-model="category" class="feedback-form__control feedback-form__select" name="category" required>
          <option value="" disabled>请选择</option>
          <option v-for="item in CATEGORIES" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>

      <fieldset class="feedback-form__fieldset">
        <legend class="feedback-form__label">类型</legend>
        <div class="feedback-form__radios">
          <label class="feedback-form__radio">
            <input v-model="kind" type="radio" name="kind" value="gap" />
            <span>站里还没有</span>
          </label>
          <label class="feedback-form__radio">
            <input v-model="kind" type="radio" name="kind" value="fix" />
            <span>已有内容要修正</span>
          </label>
        </div>
      </fieldset>

      <div class="feedback-form__row">
        <label class="feedback-form__label" for="fb-want">想要什么 / 缺什么</label>
        <textarea
          id="fb-want"
          v-model="want"
          class="feedback-form__control"
          name="want"
          rows="3"
          maxlength="2000"
          required
          placeholder="一句话说清就行，比如「校园卡丢了怎么补办」"
        />
      </div>

      <div class="feedback-form__row">
        <label class="feedback-form__label" for="fb-scene">
          什么场景下遇到的
          <span class="feedback-form__hint">这一栏最有用，能决定这条反馈能不能落地</span>
        </label>
        <textarea
          id="fb-scene"
          v-model="scene"
          class="feedback-form__control"
          name="scene"
          rows="3"
          maxlength="1000"
          required
          placeholder="比如「饭卡在食堂刷不了，翻遍站里没找到补办流程」"
        />
      </div>

      <div class="feedback-form__row">
        <label class="feedback-form__label" for="fb-article">
          要修正哪一篇
          <span class="feedback-form__hint">选了上面第二项就填这里</span>
        </label>
        <input
          id="fb-article"
          v-model="article"
          class="feedback-form__control"
          name="article"
          type="text"
          maxlength="200"
          placeholder="文章标题或站内地址，比如 /campus-network-vpn"
        />
      </div>
    </fieldset>

    <fieldset class="feedback-form__group">
      <legend class="feedback-form__group-title">方便的话</legend>

      <div class="feedback-form__row">
        <label class="feedback-form__label" for="fb-contact">
          联系方式
          <span class="feedback-form__hint">选填；只用于向你确认细节，不会公开</span>
        </label>
        <input
          id="fb-contact"
          v-model="contact"
          class="feedback-form__control"
          name="contact"
          type="text"
          maxlength="200"
          autocomplete="off"
        />
      </div>
    </fieldset>

    <!-- 蜜罐：对用户隐藏，脚本会填。字段名刻意取成自动填充认不出来的样子 -->
    <div class="feedback-form__trap" aria-hidden="true">
      <input v-model="trap" name="fb_trap" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <!--
      机器人验证。site key 为空时整块不渲染，也就不加载任何第三方脚本；
      用 interaction-only：正常读者根本看不到它，只有被判定可疑的才出现交互。
    -->
    <div v-if="TURNSTILE_SITE_KEY" class="feedback-form__verify">
      <div
        ref="turnstileEl"
        class="cf-turnstile"
        :data-sitekey="TURNSTILE_SITE_KEY"
        :data-action="TURNSTILE_ACTION"
        data-size="flexible"
        data-appearance="interaction-only"
        data-theme="auto"
      />
      <p v-if="turnstileStuck" class="feedback-form__hint feedback-form__hint--block">
        验证组件没能加载出来。<strong>不影响提交</strong>——直接交就行，我们会人工过一遍。
      </p>
    </div>

    <div class="feedback-form__actions">
      <button class="feedback-form__submit" type="submit" :disabled="sending">
        {{ sending ? '提交中…' : '提交反馈' }}
      </button>
      <button v-if="canFallback" class="feedback-form__ghost" type="button" @click="retry">重试</button>
      <button v-if="canFallback" class="feedback-form__ghost" type="button" @click="copyToClipboard">
        复制内容
      </button>
    </div>

    <p class="feedback-form__msg" role="status" aria-live="polite">{{ message }}</p>

    <p v-if="canFallback" class="feedback-form__fallback">
      一直提交不上也不影响：点「复制内容」，把内容粘贴到
      <a :href="QQ_GROUP_URL" target="_blank" rel="noreferrer">QQ 群 {{ QQ_GROUP_NUMBER }}</a> 即可。
    </p>
  </form>
</template>
