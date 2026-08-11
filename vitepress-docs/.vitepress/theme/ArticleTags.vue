<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { tagPath } from './tag-utils'

const { frontmatter } = useData()

const tags = computed(() => {
  const value = frontmatter.value.tags
  const list = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(list.map((tag) => String(tag).trim()).filter(Boolean))]
})

// 直接进该标签自己的页面，不再是跳到 /tags 页内的锚点
function tagHref(tag: string) {
  return withBase(tagPath(tag))
}
</script>

<template>
  <nav v-if="tags.length" class="article-tags" aria-label="文章标签">
    <span class="article-tags__label">标签</span>
    <a
      v-for="tag in tags"
      :key="tag"
      class="tag-chip"
      :href="tagHref(tag)"
    >
      {{ tag }}
    </a>
  </nav>
</template>

