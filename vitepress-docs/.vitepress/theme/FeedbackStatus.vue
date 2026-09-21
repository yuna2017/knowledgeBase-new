<script setup lang="ts">
/**
 * 状态页的计数表。
 *
 * 数据是**实时拉取**的（`GET /api/feedback/stats`）。仓库里那个 JSON 是兜底，
 * 而且**兜底内容直接进预渲染的 HTML**——
 * `loading` 初始值必须是 false，否则 SSR 出来的是「加载中」，浏览器端 JS 没跑起来
 * （被拦、超时、报错）时这一页会永远停在骨架条上。
 * 拉取成功后用实时数据替换，拉取失败就保留兜底并说明这是快照。
 *
 * 另一个容易写错的地方：**兜底数据是空的，不等于「一条反馈都没有」**。
 * 只有真的从接口读到了 total = 0，才敢说「还没有反馈」；读不到的时候
 * 必须说清「不知道」，否则就是在替维护者撒一个会被拆穿的谎。
 */
import { onMounted, ref } from 'vue'
import fallback from '../data/feedback-counts.json'

interface CategoryRow {
  category: string
  total: number
  byStatus: Record<string, number>
}

interface Published {
  category: string
  label: string
  url: string
}

interface Stats {
  total: number
  byCategory: CategoryRow[]
  byKind: { gap: number; fix: number }
  published?: Published[]
  updatedAtText?: string
}

const STATUSES = [
  { key: 'new', label: '未看' },
  { key: 'planned', label: '计划中' },
  { key: 'done', label: '已上线' },
  { key: 'rejected', label: '不采纳' }
]

const stats = ref<Stats>(fallback as Stats)
const published = ref<Published[]>([])
const live = ref(false)
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch('/api/feedback/stats', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as Stats
    if (data && Array.isArray(data.byCategory)) {
      stats.value = data
      published.value = Array.isArray(data.published) ? data.published : []
      live.value = true
    }
  } catch {
    // 保留兜底数据，模板里会说明这是上一次同步的快照
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="fb-status">
    <p v-if="loading" class="fb-status__loading" role="status">正在读取最新数据…</p>

    <p v-else-if="!live" class="fb-status__note fb-status__note--stale">
      现在读不到实时数据，下面是上一次同步的快照，可能已经过期。
    </p>

    <!-- 读不到 + 兜底也是空的：这时「有没有反馈」是未知的，不能当成 0 -->
    <p v-if="!live && stats.total === 0" class="fb-status__unknown">
      这一份快照里还没有记录。当前也连不上接口，所以现在有多少条、进展到哪一步，
      这一页暂时说不准——稍后刷新再看看。
    </p>

    <template v-else-if="stats.total === 0">
      <p>还没有收到反馈。要不要来当第一个？<a href="/wanted">说一句就行</a>。</p>
    </template>

    <template v-else>
      <p class="fb-status__note">
        共 <strong>{{ stats.total }}</strong> 条（按<strong>需求条数</strong>算，不是文章数）：
        缺口 {{ stats.byKind.gap }} 条，勘误 {{ stats.byKind.fix }} 条。
      </p>

      <div class="fb-status__scroll">
        <table>
          <thead>
            <tr>
              <th>想补的内容</th>
              <th>需求条数</th>
              <th v-for="item in STATUSES" :key="item.key">{{ item.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in stats.byCategory" :key="row.category">
              <td>{{ row.category }}</td>
              <td>{{ row.total }}</td>
              <td v-for="item in STATUSES" :key="item.key">
                {{ row.byStatus[item.key] || 0 }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="published.length">
        <h2 class="fb-status__subtitle">已经写出来的</h2>
        <ul class="fb-status__published">
          <li v-for="item in published" :key="item.url">
            <a :href="item.url">{{ item.label }}</a>
            <span class="fb-status__published-tag">{{ item.category }}</span>
          </li>
        </ul>
      </template>

      <p v-if="live" class="fb-status__note">实时数据，读取于 {{ stats.updatedAtText }}。</p>
    </template>
  </div>
</template>
