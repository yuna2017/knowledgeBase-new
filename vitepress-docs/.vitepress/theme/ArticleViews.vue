<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const views = ref<number | null>(null)

const api = import.meta.env.VITE_VIEWS_API

onMounted(async () => {
  if (!api) return
  try {
    const res = await fetch(api.replace(/\/$/, '') + '/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: route.path })
    })
    if (!res.ok) return
    const data = await res.json()
    if (typeof data.views === 'number') views.value = data.views
  } catch {
    // 静默降级，不影响页面
  }
})
</script>

<template>
  <div v-if="views !== null" class="article-views">
    <span class="article-views__label">阅读</span>
    <span class="article-views__count">{{ views.toLocaleString('zh-CN') }}</span>
  </div>
</template>
