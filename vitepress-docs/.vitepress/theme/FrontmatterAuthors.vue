<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import { authorProfiles, defaultAuthorId } from './authors'

const { frontmatter } = useData()

const authors = computed(() => {
  const value = frontmatter.value.authors
  const rawIds = Array.isArray(value) ? value : value ? [value] : []
  const ids = rawIds
    .map((rawId) => String(rawId ?? '').trim())
    .filter(Boolean)

  if (ids.length === 0) ids.push(defaultAuthorId)

  return ids.map((id) => {
    const profile = authorProfiles[id] || {
      displayName: id,
      github: id
    }

    return {
      id,
      displayName: profile.displayName,
      avatar: 'https://avatars.githubusercontent.com/' + profile.github + '?s=64',
      profileUrl: 'https://github.com/' + profile.github
    }
  })
})
</script>

<template>
  <div v-if="authors.length" class="frontmatter-authors">
    <span class="frontmatter-authors__label">作者</span>
    <a
      v-for="author in authors"
      :key="author.id"
      class="frontmatter-author"
      :href="author.profileUrl"
      target="_blank"
      rel="noreferrer"
    >
      <img
        class="frontmatter-author__avatar"
        :src="author.avatar"
        :alt="author.displayName"
        width="32"
        height="32"
      >
      <span>{{ author.displayName }}</span>
    </a>
  </div>
</template>
