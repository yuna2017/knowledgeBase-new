<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { data as pool } from '../../random.data'
import { tagPath } from './tag-utils'

/**
 * 首页卡片行第三个格子：「随便看看」。
 *
 * 抽取用**无放回洗牌**，不是每次独立随机。目标是"每篇都有出头之日"，
 * 这是覆盖率问题：独立随机给不了任何保证，可能连着两次抽到同一篇，
 * 也可能一整轮都抽不到某篇。这里把洗好的顺序存在本地，抽完一轮才重洗，
 * 所以一轮之内池子里的每篇都会出现一次，然后才开始第二轮。
 *
 * 轮次只是内部的记账方式，不在界面上显示：卡片里不出现「第几篇 / 共几篇」，
 * 读者看到的就是"抽到的这一篇"，而不是一个要刷满的进度条。
 * 游标仍然有用——它同时决定按钮文案（抽一篇 / 换一篇）和是否该重洗。
 *
 * 抽卡由点击触发，不在挂载时自动抽：否则每次刷新首页都会推进游标，
 * 读者没看过的篇目会被白白消耗掉。
 *
 * 挑选全部放在客户端：构建期只提供池子（random.data.ts）。
 * 首屏 SSR 阶段还没有牌堆，因此只渲染卡片外壳、内容挂载后填进来，
 * 和 TopViews.vue 一样避免水合不一致。
 */

/** 本地存档键；带版本号，将来换存法可以直接作废旧数据 */
const STORAGE_KEY = 'kb-random-pick-v1'

/** 两次抽取的最短间隔：连点会把 out-in 的揭示动画叠在一起，视觉上会乱 */
const DRAW_INTERVAL_MS = 280

interface Bag {
  /** 本轮洗好的完整顺序（存 url） */
  order: string[]
  /** 已经抽到第几张 */
  cursor: number
}

const mounted = ref(false)
const order = ref<string[]>([])
const cursor = ref(0)
/** 上一次抽取的时间戳，只用于挡住连点 */
let lastDrawAt = 0

const byUrl = computed(() => new Map(pool.map((page) => [page.url, page])))
const current = computed(() =>
  cursor.value > 0 ? byUrl.value.get(order.value[cursor.value - 1]) : undefined
)

/** Fisher–Yates：牌堆在浏览器里洗，构建期不做任何挑选 */
function shuffle(urls: string[]): string[] {
  const result = [...urls]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function read(): Bag | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Bag>
    if (!Array.isArray(parsed.order) || typeof parsed.cursor !== 'number') return null
    return {
      order: parsed.order.map(String),
      cursor: Math.max(0, Math.floor(parsed.cursor))
    }
  } catch {
    // localStorage 不可用（如隐私模式），或存档被改坏：当作没有存档
    return null
  }
}

function write() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: order.value, cursor: cursor.value })
    )
  } catch {
    // 存不下就退化成"每次访问重新洗牌"，不影响抽取本身
  }
}

/**
 * 把存档对齐到当前池子：
 * - 文档被删除时从牌堆里剔除，避免抽到已经不存在、点开是 404 的页面；
 * - 新增文档时追加到牌堆末尾，让它也出现在本轮里，而不是白等一轮。
 */
function reconcile(bag: Bag | null): Bag {
  const known = new Set(pool.map((page) => page.url))
  const kept = (bag?.order ?? []).filter((url) => known.has(url))
  const inBag = new Set(kept)
  const merged = [...kept, ...pool.map((page) => page.url).filter((url) => !inBag.has(url))]

  return { order: merged, cursor: bag ? Math.min(bag.cursor, merged.length) : 0 }
}

function draw() {
  const now = Date.now()
  if (now - lastDrawAt < DRAW_INTERVAL_MS) return
  lastDrawAt = now

  if (cursor.value >= order.value.length) {
    // 一轮抽完，重洗后从头开始——每篇都被看过一次才会重复
    order.value = shuffle(order.value)
    cursor.value = 0
  }
  cursor.value += 1
  write()
}

onMounted(() => {
  const bag = reconcile(read())
  order.value = bag.order
  cursor.value = bag.cursor
  // 这里刻意不自动抽一张：首页每次刷新都推进游标的话，连刷几次就会
  // 白白消耗掉 "本轮 N / 38" 里的名额，进度数字也跟着失真。
  // 抽卡只由点击触发，游标才真正等于"读者翻过几张"。
  // 上一轮抽到的会留在原地，刷新不会换，首页也不至于每次都在变。
  mounted.value = true
})
</script>

<template>
  <article class="home-card home-card--pick">
    <div class="home-card__box">
      <h2 class="home-card__title">随便看看</h2>

      <!-- SSR 阶段不渲染牌面也不渲染引导语，只留下够高的空位，
           避免挂载后内容填进来把卡片顶一下 -->
      <div class="random-pick__stage" aria-live="polite">
        <Transition name="random-pick-reveal" mode="out-in">
          <div v-if="mounted && current" :key="current.url" class="random-pick__doc">
            <a class="random-pick__link" :href="withBase(current.url)">{{ current.title }}</a>
            <p v-if="current.description" class="random-pick__desc">{{ current.description }}</p>
            <div class="random-pick__meta">
              <a
                v-for="tag in current.tags"
                :key="tag"
                class="tag-chip"
                :href="withBase(tagPath(tag))"
              >
                {{ tag }}
              </a>
            </div>
          </div>
          <p v-else-if="mounted" key="idle" class="random-pick__idle">
            还没有翻开过。点右下角抽一篇，看看会翻到什么。
          </p>
        </Transition>
      </div>

      <!-- 校准日期占的是页脚里本来就有的那一行，不额外增加卡片高度 -->
      <div v-if="mounted" class="random-pick__foot">
        <time v-if="current?.date" class="random-pick__date" :datetime="current.date">
          校准 {{ current.date.slice(0, 10) }}
        </time>
        <span v-else class="random-pick__date" />
        <button class="random-pick__button" type="button" @click="draw">
          {{ cursor === 0 ? '抽一篇' : '换一篇' }}
        </button>
      </div>
    </div>
  </article>
</template>
