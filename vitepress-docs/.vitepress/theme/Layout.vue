<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ArticleFreshness from './ArticleFreshness.vue'
import ArticleTags from './ArticleTags.vue'
import FrontmatterAuthors from './FrontmatterAuthors.vue'
import ArticleViews from './ArticleViews.vue'
import TopViews from './TopViews.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <ArticleFreshness />
      <ArticleTags />
      <FrontmatterAuthors />
      <ArticleViews />
    </template>
    <template #home-features-after>
      <TopViews />
    </template>
  </Layout>
</template>
