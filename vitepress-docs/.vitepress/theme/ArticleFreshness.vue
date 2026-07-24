<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useData } from 'vitepress'

const STALE_AFTER_DAYS = 180
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const { lang, page, theme } = useData()

const lastUpdated = computed(() => page.value.lastUpdated)
const isoDatetime = computed(() => {
  return lastUpdated.value
    ? new Date(lastUpdated.value).toISOString()
    : ''
})
const label = computed(() => {
  return theme.value.lastUpdated?.text ||
    theme.value.lastUpdatedText ||
    '最后校准时间'
})

const datetime = ref('')
const isStale = ref(false)

onMounted(() => {
  watchEffect(() => {
    const timestamp = lastUpdated.value
    if (!timestamp) {
      datetime.value = ''
      isStale.value = false
      return
    }

    const formatOptions = theme.value.lastUpdated?.formatOptions ?? {
      dateStyle: 'long',
      timeStyle: 'short'
    }
    const locale = formatOptions.forceLocale ? lang.value : undefined

    datetime.value = new Intl.DateTimeFormat(locale, formatOptions).format(
      new Date(timestamp)
    )
    isStale.value = Date.now() - timestamp >
      STALE_AFTER_DAYS * MILLISECONDS_PER_DAY
  })
})
</script>

<template>
  <div v-if="lastUpdated" class="article-freshness">
    <div class="article-freshness__meta">
      <span class="article-freshness__label">{{ label }}</span>
      <time class="article-freshness__time" :datetime="isoDatetime">
        {{ datetime }}
      </time>
    </div>

    <p v-if="isStale" class="article-freshness__warning" role="note">
      <strong>时效性提醒：</strong>
      本页已超过 180 天未校准，内容可能已经变化，请使用前核对官方最新通知或服务页面。
    </p>
  </div>
</template>
