<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { withBase } from 'vitepress'
import { data as pages } from '../../pages.data'

interface TopItem {
  page: string
  views: number
}

const api = import.meta.env.VITE_VIEWS_API
const items = ref<TopItem[]>([])

// 路径 → 标题映射，把 D1 里存的站内路径还原成可读标题
const titleMap = computed(() => {
  const map = new Map<string, string>()
  for (const p of pages) map.set(p.url, p.title)
  return map
})

const ranked = computed(() =>
  items.value.map((item) => ({
    url: item.page,
    views: item.views,
    title: titleMap.value.get(item.page) || item.page
  }))
)

onMounted(async () => {
  if (!api) return
  try {
    const res = await fetch(api.replace(/\/$/, '') + '/api/views/top?limit=3')
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data.items)) items.value = data.items
  } catch {
    // 静默降级，不影响首页
  }
})
</script>

<template>
  <div v-if="ranked.length" class="top-views">
    <h2 class="top-views__title">最高阅读</h2>
    <ol class="top-views__list">
      <li v-for="item in ranked" :key="item.url">
        <a :href="withBase(item.url)">{{ item.title }}</a>
        <span class="top-views__count">{{ item.views.toLocaleString('zh-CN') }}</span>
      </li>
    </ol>
  </div>
</template>
