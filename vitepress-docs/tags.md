---
title: 标签
description: 按主题浏览 YUNA 知识库的全部文档。
# 页面只有一级标题，右侧大纲是空的，关掉后卡片占满宽度
aside: false
outline: false
prev: false
next: false
---

<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as pages } from './tags.data'
import { tagPath } from './.vitepress/theme/tag-utils'

/** 卡片里最多预览几篇文档 */
const PREVIEW_COUNT = 3

const groups = computed(() => {
  const grouped = new Map<string, typeof pages>()

  for (const page of pages) {
    for (const tag of page.tags) {
      if (!grouped.has(tag)) grouped.set(tag, [])
      grouped.get(tag)!.push(page)
    }
  }

  return [...grouped.entries()]
    .map(([tag, docs]) => {
      const sorted = [...docs].sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          left.title.localeCompare(right.title, 'zh-CN')
      )
      return {
        tag,
        count: sorted.length,
        preview: sorted.slice(0, PREVIEW_COUNT),
        rest: Math.max(0, sorted.length - PREVIEW_COUNT)
      }
    })
    .sort(
      (left, right) =>
        right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN')
    )
})

/**
 * 只有一篇文档的标签单独放到末尾的紧凑区。
 * 这类标签占了总数的一大半，混在卡片里会把常用主题挤下去。
 */
const major = computed(() => groups.value.filter((g) => g.count > 1))
const minor = computed(() => groups.value.filter((g) => g.count === 1))

const docCount = computed(() => new Set(pages.map((p) => p.url)).size)
</script>

<div class="tags-head">

# 标签

  <p class="tags-head__meta">
    {{ groups.length }} 个标签，覆盖 {{ docCount }} 篇文档。点击标签查看该主题下的全部内容。
  </p>
</div>

<div class="tags-grid">
  <a
    v-for="group in major"
    :key="group.tag"
    class="tags-card"
    :href="withBase(tagPath(group.tag))"
  >
    <span class="tags-card__head">
      <span class="tags-card__name">{{ group.tag }}</span>
      <span class="tags-card__count">{{ group.count }}</span>
    </span>
    <span class="tags-card__preview">
      <span v-for="doc in group.preview" :key="doc.url" class="tags-card__doc">{{ doc.title }}</span>
      <span v-if="group.rest" class="tags-card__more">还有 {{ group.rest }} 篇</span>
    </span>
  </a>
</div>

<div v-if="minor.length" class="tags-minor">
  <h2 class="tags-minor__title">只有一篇文档的标签</h2>
  <nav class="tag-cloud" aria-label="单篇标签">
    <a
      v-for="group in minor"
      :key="group.tag"
      class="tag-chip"
      :href="withBase(tagPath(group.tag))"
    >
      {{ group.tag }}
    </a>
  </nav>
</div>
