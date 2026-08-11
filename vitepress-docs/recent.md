---
title: 最近更新
description: 按最后修订时间排列的文档列表，数据来自仓库的 git 提交记录。
# 聚合页不属于文章序列，不显示上一篇/下一篇
prev: false
next: false
---

<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as pages } from './recent.data'

const formatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'long',
  timeZone: 'Asia/Shanghai'
})

/** 按「今天 / 本周 / 本月 / 更早」分组，比一条长列表更容易看出更新节奏 */
const groups = computed(() => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const buckets = new Map<string, typeof pages>([
    ['最近 7 天', []],
    ['最近 30 天', []],
    ['最近半年', []],
    ['更早', []]
  ])

  for (const page of pages) {
    const age = now - new Date(page.date).getTime()
    const key =
      age <= 7 * day ? '最近 7 天'
        : age <= 30 * day ? '最近 30 天'
          : age <= 182 * day ? '最近半年'
            : '更早'
    buckets.get(key)!.push(page)
  }

  return [...buckets.entries()]
    .filter(([, list]) => list.length)
    .map(([label, list]) => ({ label, list }))
})

function formatDate(value: string) {
  return formatter.format(new Date(value))
}
</script>

# 最近更新

列出最近修订过的文档，时间取自仓库里该文件最后一次提交。想看某一篇的完整修订记录，打开文章后翻到页面底部的「页面历史」。

<div v-for="group in groups" :key="group.label" class="recent-group">
  <h2>{{ group.label }}</h2>
  <ul class="recent-list">
    <li v-for="page in group.list" :key="page.url">
      <a :href="withBase(page.url)">{{ page.title }}</a>
      <time class="recent-list__meta" :datetime="page.date">{{ formatDate(page.date) }}</time>
    </li>
  </ul>
</div>
