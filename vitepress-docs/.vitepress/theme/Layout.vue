<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ArticleTags from './ArticleTags.vue'
import FrontmatterAuthors from './FrontmatterAuthors.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <ArticleTags />
      <FrontmatterAuthors />
    </template>
  </Layout>
</template>
