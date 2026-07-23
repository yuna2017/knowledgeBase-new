---
title: 标签
---

<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as pages } from './tags.data'
import { tagId } from './.vitepress/theme/tag-utils'

const groups = computed(() => {
  const grouped = new Map()

  for (const page of pages) {
    for (const tag of page.tags) {
      if (!grouped.has(tag)) grouped.set(tag, [])
      grouped.get(tag).push(page)
    }
  }

  return [...grouped.entries()]
    .map(([tag, taggedPages]) => ({ tag, pages: taggedPages }))
    .sort((left, right) => left.tag.localeCompare(right.tag, 'zh-CN'))
})
</script>

# 标签

点击标签可查看归入该标签的全部文档。一篇文章可以同时属于多个标签。

<nav class="tag-cloud" aria-label="全部标签">
  <a
    v-for="group in groups"
    :key="group.tag"
    class="tag-chip"
    :href="'#' + tagId(group.tag)"
  >
    <span>{{ group.tag }}</span>
    <span class="tag-chip__count">{{ group.pages.length }}</span>
  </a>
</nav>

<section
  v-for="group in groups"
  :id="tagId(group.tag)"
  :key="group.tag"
  class="tag-section"
>
  <h2>{{ group.tag }}</h2>
  <ul class="tag-document-list">
    <li v-for="page in group.pages" :key="page.url">
      <a :href="withBase(page.url)">{{ page.title }}</a>
    </li>
  </ul>
</section>

