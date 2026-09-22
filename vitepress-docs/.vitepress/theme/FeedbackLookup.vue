<script setup lang="ts">
/**
 * 凭查询码查自己那条反馈的状态。
 *
 * 两个地方共用：
 *   - `/wanted-done`：提交成功后带着 `?t=XXXX-XXXX` 跳过来，自动查一次，
 *     于是「已收到」页面顺便变成了「这是你的编号 + 现在什么状态」。
 *   - `/wanted-status`：放一个输入框，让人随时回来查。
 *
 * 刻意**不显示联系方式**，正文也只回显前 40 个字——够本人认出是自己那条就行。
 * 接口返回什么这里就显示什么，公开页面上不该有更多东西。
 */
import { onMounted, ref } from 'vue'

/** 与 shared/contact.ts 保持一致：想问一句时的去处 */
const QQ_GROUP_NUMBER = '978801324'
const QQ_GROUP_URL = 'https://qm.qq.com/q/1DSuxKBV5a'

interface LookupResult {
  found: boolean
  ticket?: string
  category?: string
  kind?: string
  wantPreview?: string
  status?: string
  statusLabel?: string
  createdAtText?: string
  updatedAtText?: string
  resolved?: { label: string; url: string } | null
  /** 维护者写的不采纳原因；可能是空串（那时显示下面的兜底） */
  rejectReason?: string
}

/** 与接口里的 STATUS_LABEL 一致 */
const STATUS_HINT: Record<string, string> = {
  new: '已经收到，还没排上。',
  planned: '确认会写，已经排进队列。',
  done: '已经写成页面了，下面有链接。',
  rejected: '这条没有被采纳。'
}

/**
 * 「已上线」但维护者还没填链接时，别照着固定文案说「下面有链接」——
 * 状态和链接是分两次保存的，中间有这个窗口，那句话会指向一片空白。
 */
function statusHint(data: LookupResult) {
  if (data.status === 'done' && !data.resolved) {
    return '已经写成页面了，只是维护者还没把链接填上，过一阵再来看看。'
  }
  return STATUS_HINT[data.status || ''] || ''
}

const ticket = ref('')
const result = ref<LookupResult | null>(null)
const invalid = ref(false)
const loading = ref(false)
const failed = ref('')

/** 输入时顺手归一化：大写、去掉非法字符、自动补那一横 */
function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  let raw = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (raw.length > 4) raw = raw.slice(0, 4) + '-' + raw.slice(4)
  ticket.value = raw
  el.value = raw
}

function keyOf(value: string) {
  return value.replace(/[^A-Z0-9]/g, '')
}

async function lookup() {
  const key = keyOf(ticket.value)
  if (key.length !== 8) {
    invalid.value = true
    result.value = null
    return
  }
  invalid.value = false
  loading.value = true
  failed.value = ''
  try {
    const res = await fetch('/api/feedback/lookup?t=' + encodeURIComponent(ticket.value), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as LookupResult
    result.value = data.found ? data : { found: false }
  } catch {
    failed.value = '现在查不了，接口可能暂时不可用。过一会儿再试。'
    result.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 提交成功后跳过来会带上 ?t=，直接查一次
  const fromUrl = new URLSearchParams(window.location.search).get('t')
  if (!fromUrl) return
  const raw = fromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (raw.length !== 8) return
  ticket.value = raw.slice(0, 4) + '-' + raw.slice(4)
  void lookup()
})
</script>

<template>
  <div class="fb-lookup">
    <form class="fb-lookup__form" @submit.prevent="lookup">
      <label class="fb-lookup__label" for="fb-ticket">查询编号</label>
      <input
        id="fb-ticket"
        :value="ticket"
        class="fb-lookup__input"
        type="text"
        inputmode="latin"
        autocomplete="off"
        spellcheck="false"
        maxlength="9"
        placeholder="XXXX-XXXX"
        @input="onInput"
      />
      <button class="fb-lookup__button" type="submit" :disabled="loading">
        {{ loading ? '查询中…' : '查状态' }}
      </button>
    </form>

    <p v-if="invalid" class="fb-lookup__hint">编号是 8 位，形如 <code>K7M2-9Q4P</code>。</p>
    <p v-else-if="failed" class="fb-lookup__hint">{{ failed }}</p>

    <div v-else-if="result && !result.found" class="fb-lookup__hint">
      没找到这个编号。核对一下有没有抄错——字母 <code>I</code>、<code>L</code>、<code>O</code>
      和数字 <code>0</code>、<code>1</code> 不在编号里。
    </div>

    <div v-else-if="result && result.found" class="fb-lookup__result">
      <p class="fb-lookup__line">
        <span class="fb-lookup__status" :class="'fb-lookup__status--' + result.status">
          {{ result.statusLabel }}
        </span>
        <span class="fb-lookup__meta">
          {{ result.category }} · {{ result.kind === 'fix' ? '勘误' : '缺口' }} ·
          {{ result.createdAtText }} 提交
        </span>
      </p>
      <p class="fb-lookup__want">「{{ result.wantPreview }}」</p>
      <p class="fb-lookup__hint">{{ statusHint(result) }}</p>
      <p v-if="result.resolved" class="fb-lookup__resolved">
        已经写好了：<a :href="result.resolved.url">{{ result.resolved.label }}</a>
      </p>
      <!--
        「不采纳」一定要给个交代。维护者写了就照实显示；
        没写就显示这句兜底 —— 空白会让人以为是自己看错了，
        而「你去群里问一句」至少给了一条明确的路。
      -->
      <p v-else-if="result.status === 'rejected'" class="fb-lookup__rejected">
        <template v-if="result.rejectReason">
          不采纳的原因：{{ result.rejectReason }}
        </template>
        <template v-else>
          维护者没有写明原因。想知道为什么、或者觉得应该写，到
          <a :href="QQ_GROUP_URL" target="_blank" rel="noreferrer">QQ 群 {{ QQ_GROUP_NUMBER }}</a>
          说一句最快。
        </template>
      </p>
      <p class="fb-lookup__hint">
        编号 <code>{{ result.ticket }}</code>，可以留着以后再看。想补充点什么，直接
        <a href="/wanted">再提一条</a>就行。
      </p>
    </div>
  </div>
</template>
