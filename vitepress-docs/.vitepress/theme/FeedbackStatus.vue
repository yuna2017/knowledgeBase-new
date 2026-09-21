<script setup lang="ts">
/**
 * 状态页的计数表。
 *
 * 数据是**实时拉取**的（`GET /api/feedback/stats`，只含分类 + 条数 + 状态）。
 * 仓库里那个 JSON 只是兜底：接口不可用时显示它，页面至少不会空着，
 * 也不会让人以为「一条反馈都没有」。
 */
import { onMounted, ref } from 'vue'
import fallback from '../data/feedback-counts.json'

interface CategoryRow {
  category: string
  total: number
  byStatus: Record<string, number>
}

interface Stats {
  total: number
  byCategory: CategoryRow[]
  byKind: { gap: number; fix: number }
  updatedAtText?: string
}

const STATUSES = [
  { key: 'new', label: '未看' },
  { key: 'planned', label: '计划中' },
  { key: 'done', label: '已上线' },
  { key: 'rejected', label: '不采纳' }
]

const stats = ref<Stats>(fallback as Stats)
const live = ref(false)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('/api/feedback/stats', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as Stats
    if (data && Array.isArray(data.byCategory)) {
      stats.value = data
      live.value = true
    }
  } catch {
    // 保持兜底数据，下面会说明这是上一次同步的快照
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="fb-status">
    <p v-if="loading" class="fb-status__note">正在读取最新数据…</p>

    <p v-else-if="!live" class="fb-status__note fb-status__note--stale">
      现在读不到实时数据，下面是上一次同步的快照。
    </p>

    <template v-if="stats.total === 0">
      <p>还没有收到反馈。要不要来做第一个？<a href="/wanted">说一句就行</a>。</p>
    </template>

    <template v-else>
      <p class="fb-status__note">
        共 {{ stats.total }} 条：缺口 {{ stats.byKind.gap }} 条，勘误 {{ stats.byKind.fix }} 条。
      </p>

      <table>
        <thead>
          <tr>
            <th>想补的内容</th>
            <th>条数</th>
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

      <p v-if="live" class="fb-status__note">实时数据，读取于 {{ stats.updatedAtText }}。</p>
    </template>
  </div>
</template>
