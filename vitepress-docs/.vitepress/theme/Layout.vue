<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ArticleTags from './ArticleTags.vue'
import FrontmatterAuthors from './FrontmatterAuthors.vue'
import ArticleViews from './ArticleViews.vue'
import TopViews from './TopViews.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <ArticleTags />
      <FrontmatterAuthors />
      <ArticleViews />
    </template>
    <template #home-features-after>
      <TopViews />
    </template>
  </Layout>
</template>
