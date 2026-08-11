---
layout: doc
# 标签页只是入口，右侧大纲几乎是空的，关掉后正文占满宽度
aside: false
outline: false
# 不属于文章序列，不显示上一篇/下一篇
prev: false
next: false
---

<script setup lang="ts">
import { withBase } from 'vitepress'

const formatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai'
})

function formatDate(value: string) {
  return value ? formatter.format(new Date(value)) : ''
}
</script>

<div class="tag-head">
  <p class="tag-head__crumb">
    <a :href="withBase('/tags')">标签</a>
    <span aria-hidden="true">/</span>
    <span>{{ $params.name }}</span>
  </p>

# {{ $params.name }}

  <p class="tag-head__meta">共 {{ $params.count }} 篇文档，按最后修订时间排列</p>
</div>

<div class="tag-grid">
  <a
    v-for="doc in $params.docs"
    :key="doc.url"
    class="tag-card"
    :href="withBase(doc.url)"
  >
    <span class="tag-card__title">{{ doc.title }}</span>
    <p v-if="doc.description" class="tag-card__desc">{{ doc.description }}</p>
    <time v-if="doc.date" class="tag-card__date" :datetime="doc.date">{{ formatDate(doc.date) }}</time>
  </a>
</div>

<div v-if="$params.related.length" class="tag-related">
  <h2 class="tag-related__title">相关标签</h2>
  <p class="tag-related__hint">经常和「{{ $params.name }}」一起出现的主题</p>
  <nav class="tag-cloud" aria-label="相关标签">
    <a
      v-for="item in $params.related"
      :key="item.slug"
      class="tag-chip"
      :href="withBase('/tags/' + item.slug)"
    >
      <span>{{ item.name }}</span>
      <span class="tag-chip__count">{{ item.count }}</span>
    </a>
  </nav>
</div>
