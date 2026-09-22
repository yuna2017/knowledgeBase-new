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
 *
 * 2026-09 撤掉了 Turnstile 人机验证：它要连 challenges.cloudflare.com（国内不一定通），
 * 冷启动还得等一两秒，而站点访问量很小，不值当。现在页面上**没有任何第三方脚本**，
 * 挡脚本的只剩蜜罐 + 填写耗时，两样都只标记、不拦人。
 */
import { onMounted, ref } from 'vue'
// 提交不上时的最终退路（群号 + 一键加群）：和页脚、导航读的是同一份
import { QQ_GROUP } from '../shared/contact'

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

const formEl = ref<HTMLFormElement | null>(null)

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
  return {
    category: category.value,
    kind: kind.value,
    want: want.value,
    scene: scene.value,
    article: article.value,
    contact: contact.value,
    fb_trap: trap.value,
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

/**
 * 存一份「还没发出去」的料，下次进页面自动补发。
 *
 * 只存业务字段：里面不该有令牌之类一次性的东西（以前 Turnstile 的令牌要在这里
 * 特意删掉，否则补发会被服务端当重放拒掉、而失败又会再存一遍，那条永远发不出去）。
 */
function savePending(payload: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_PENDING, JSON.stringify(payload))
  } catch {
    // 忽略
  }
}

/* ------------------------------------------------------------ 提交 */

/** 单次请求。返回 'ok' / 'error'，error 时带上可读原因。 */
async function postOnce(payload: Record<string, unknown>): Promise<{
  ok: boolean
  reason: string
  ticket: string
}> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      // keepalive：用户点完提交就切走或关标签页，请求也能发完
      keepalive: true
    })
    if (res.ok) {
      // 查询码在这个响应体里，**不能只判断 ok 就把它扔掉**——
      // 用户拿不到编号就查不了自己那条，这个功能等于没做
      const data = await res.json().catch(() => null)
      const ticket = data && typeof data.ticket === 'string' ? data.ticket : ''
      return { ok: true, reason: '', ticket }
    }
    if (res.status === 429) {
      return { ok: false, reason: '提交太频繁了，请过一会儿再试', ticket: '' }
    }
    const data = await res.json().catch(() => null)
    const detail = data && typeof data.error === 'string' ? data.error : ''
    return {
      ok: false,
      reason: detail ? detail + '（' + res.status + '）' : '接口返回 ' + res.status,
      ticket: ''
    }
  } catch {
    return {
      ok: false,
      reason: '请求没有发出去，可能是网络或接口暂时不可用',
      ticket: ''
    }
  }
}

/** 发请求，失败自动重试几次。`sending` 的开关由 submit() 管 */
async function send(payload: Record<string, unknown>) {
  canFallback.value = false
  message.value = '提交中…'

  let reason = '未知原因'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await postOnce(payload)
    if (result.ok) {
      clearDraft()
      message.value = '提交成功，正在跳转…'
      // 带上查询码，好让完成页直接显示它（服务端原生表单那条路也是这么跳的）
      const target = result.ticket
        ? '/wanted-done?t=' + encodeURIComponent(result.ticket)
        : '/wanted-done'
      window.location.assign(target)
      return
    }
    reason = result.reason
    // 频率限制重试没有意义，直接退出
    if (reason.indexOf('太频繁') >= 0) break
    if (attempt < MAX_ATTEMPTS) await sleep(600 * attempt)
  }

  canFallback.value = true
  savePending(payload)
  message.value =
    '提交失败：' + reason + '。内容已经留在页面上，也存了一份在本机——' +
    '可以点「重试」，或者点「复制内容」粘贴到 QQ 群。'
}

/** 提交。先上锁再发：否则按钮可点的那一瞬间连点会提交两次 */
async function submit() {
  if (sending.value) return
  sending.value = true
  try {
    await send(collect())
  } finally {
    sending.value = false
  }
}

async function onSubmit(event: SubmitEvent) {
  event.preventDefault()
  await submit()
}

function retry() {
  void submit()
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
      message.value = '已复制。把它粘贴到 QQ 群（群号 ' + QQ_GROUP.number + '）就可以。'
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
    ? '已复制。把它粘贴到 QQ 群（群号 ' + QQ_GROUP.number + '）就可以。'
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
    const parsed: unknown = JSON.parse(raw)
    // localStorage 里那坨东西可能是上一版留下的，甚至被人手改过：不是对象就当没有
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    payload = parsed as Record<string, unknown>
  } catch {
    return
  }

  // 老版本（Turnstile 时代）存下的待发里可能还带着一枚当年的一次性令牌。
  // 服务端现在根本不看这个字段，但删掉更干净，免得以后有人照着它写新逻辑。
  delete payload['cf-turnstile-response']
  const result = await postOnce(payload)
  if (result.ok) {
    message.value = '上次有一条没发送成功的反馈，刚才已经自动补发了。'
    return
  }
  savePending(payload)
}

/* ------------------------------------------------------------ 机器人验证 */

/*
 * 这里原来是 Turnstile 人机验证（加载脚本、等 API、等令牌、reset/remove widget），
 * 2026-09 整块删掉了：它要连 challenges.cloudflare.com，国内不一定通，冷启动还
 * 得等一两秒，而站点没什么访问量。现在表单里没有任何第三方脚本。
 *
 * 挡脚本只剩服务端那两样只标记不拦人的：蜜罐字段（trap）+ 填写耗时（fast）。
 * 要重新接验证的话，在 git 历史里找这一版的父提交（见 commit「撤掉 Turnstile」）。
 */

onMounted(() => {
  startedAt = Date.now()
  restoreDraft()
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

      <div class="feedback-form__row feedback-form__article">
        <label class="feedback-form__label" for="fb-article">
          要修正哪一篇
          <span class="feedback-form__hint">标题或站内地址都行</span>
        </label>
        <input
          id="fb-article"
          v-model="article"
          class="feedback-form__control"
          name="article"
          type="text"
          maxlength="200"
          placeholder="比如 /campus-network-vpn 或「校园网 VPN」"
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

    <!-- 这里原来是 Turnstile 的挂载点（.cf-turnstile 那个 div），验证整块撤掉了 -->

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
      <a :href="QQ_GROUP.joinUrl" target="_blank" rel="noreferrer">QQ 群 {{ QQ_GROUP.number }}</a> 即可。
    </p>
  </form>
</template>
