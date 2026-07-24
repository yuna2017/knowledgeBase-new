<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const views = ref<number | null>(null)

const api = import.meta.env.VITE_VIEWS_API
let requestId = 0
let activeController: AbortController | null = null
let stopRouteWatch: (() => void) | undefined

async function loadViews(path: string) {
  if (!api) return

  const currentRequestId = ++requestId
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  views.value = null

  try {
    const res = await fetch(api.replace(/\/$/, '') + '/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: path }),
      signal: controller.signal
    })
    if (!res.ok) return

    const data = await res.json()
    if (
      currentRequestId === requestId &&
      data.page === path &&
      typeof data.views === 'number'
    ) {
      views.value = data.views
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    // 静默降级，不影响页面
  } finally {
    if (currentRequestId === requestId) activeController = null
  }
}

onMounted(() => {
  stopRouteWatch = watch(
    () => route.path,
    (path) => void loadViews(path),
    { immediate: true }
  )
})

onBeforeUnmount(() => {
  stopRouteWatch?.()
  activeController?.abort()
})
</script>

<template>
  <div v-if="views !== null" class="article-views">
    <span class="article-views__label">阅读</span>
    <span class="article-views__count">{{ views.toLocaleString('zh-CN') }}</span>
  </div>
</template>
