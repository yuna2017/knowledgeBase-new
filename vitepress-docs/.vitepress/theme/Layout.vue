<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import ArticleFreshness from './ArticleFreshness.vue'
import ArticleTags from './ArticleTags.vue'
import FrontmatterAuthors from './FrontmatterAuthors.vue'
import ArticleViews from './ArticleViews.vue'
import TopViews from './TopViews.vue'
import { isAggregatePage, isRankableArticle } from './page-kind'

const { Layout } = DefaultTheme
const { page } = useData()

/**
 * 标签页、标签子页和「最近更新」都是聚合入口，不是文章：
 * 没有作者、没有新鲜度可言，统计阅读次数也没有意义
 * （而且标签子页是动态路由生成的，计数会把入口流量混进文章数据里）。
 */
const isAggregate = computed(() => isAggregatePage(page.value.relativePath))

/**
 * 只有可进入排行的知识库文章才接入阅读计数：
 * 首页、聚合页和项目维护文档（仓库说明 / 贡献指南 / 内容规范）都不计数。
 */
const isCountable = computed(() => isRankableArticle(page.value.relativePath))
</script>

<template>
  <Layout>
    <template #doc-before>
      <template v-if="!isAggregate">
        <ArticleFreshness />
        <ArticleTags />
        <FrontmatterAuthors />
      </template>
      <ArticleViews v-if="isCountable" />
    </template>
    <template #home-features-after>
      <TopViews />
    </template>
  </Layout>
</template>
