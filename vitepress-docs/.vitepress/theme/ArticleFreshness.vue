<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useData } from 'vitepress'

const STALE_AFTER_DAYS = 180
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const { page } = useData()

const lastUpdated = computed(() => page.value.lastUpdated)

const isStale = ref(false)

onMounted(() => {
  watchEffect(() => {
    const timestamp = lastUpdated.value
    isStale.value = !!timestamp &&
      Date.now() - timestamp > STALE_AFTER_DAYS * MILLISECONDS_PER_DAY
  })
})
</script>

<!--
  这里只保留时效性告警。
  具体的最后修订时间不再在正文顶部重复一遍——页面底部的「页面历史」
  已经给出了时间和完整的修订记录，顶部再放一次只是噪音。
  而「超过半年未校准」是需要读者当场注意的提示，不是可以翻到底部再看的信息。
-->
<template>
  <p v-if="isStale" class="article-freshness__warning" role="note">
    <strong>时效性提醒：</strong>
    本页已超过 {{ STALE_AFTER_DAYS }} 天未校准，内容可能已经变化，请使用前核对官方最新通知或服务页面。
  </p>
</template>
