---
title: 标签
description: 按主题浏览 YUNA 知识库的全部文档，标签字号反映归入的文档数量。
# 聚合页不属于文章序列，不显示上一篇/下一篇
prev: false
next: false
---

<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as pages } from './tags.data'
import { tagPath } from './.vitepress/theme/tag-utils'

/**
 * 按文档数从多到少排列，并按数量分四档控制字号。
 * 旧版把几十个标签平铺成等权重的一片、再在同一页堆下全部文档列表，
 * 既看不出主次也很难扫读；现在这里只做入口，文档列表放在各标签自己的页面。
 */
const cloud = computed(() => {
  const counts = new Map<string, number>()

  for (const page of pages) {
    for (const tag of page.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  const entries = [...counts.entries()]
  const max = Math.max(1, ...entries.map(([, count]) => count))

  return entries
    .sort(
      ([leftTag, leftCount], [rightTag, rightCount]) =>
        rightCount - leftCount || leftTag.localeCompare(rightTag, 'zh-CN')
    )
    .map(([tag, count]) => ({
      tag,
      count,
      level: Math.min(4, Math.ceil((count / max) * 4))
    }))
})
</script>

# 标签

共 {{ cloud.length }} 个标签。字号越大表示归入的文档越多，点击进入该标签的文档列表。

<nav class="tag-cloud" aria-label="全部标签">
  <a
    v-for="item in cloud"
    :key="item.tag"
    class="tag-chip"
    :class="'tag-chip--level-' + item.level"
    :href="withBase(tagPath(item.tag))"
  >
    <span>{{ item.tag }}</span>
    <span class="tag-chip__count">{{ item.count }}</span>
  </a>
</nav>
