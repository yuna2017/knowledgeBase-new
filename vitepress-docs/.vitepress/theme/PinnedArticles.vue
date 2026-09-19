<script setup lang="ts">
import { withBase } from 'vitepress'
import { data as pinned } from '../../pinned.data'
</script>

<template>
  <section v-if="pinned.length" class="pinned-articles">
    <h2 class="pinned-articles__title">置顶推荐</h2>
    <p class="pinned-articles__hint">以下内容始终排在首页，方便新同学快速上手。</p>
    <ul class="pinned-articles__list">
      <li v-for="item in pinned" :key="item.url">
        <a :href="withBase(item.url)" class="pinned-articles__card">
          <span class="pinned-articles__title-text">{{ item.title }}</span>
          <span v-if="item.description" class="pinned-articles__desc">{{ item.description }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
