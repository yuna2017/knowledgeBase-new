<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import ArticleFreshness from './ArticleFreshness.vue'
import ArticleTags from './ArticleTags.vue'
import FrontmatterAuthors from './FrontmatterAuthors.vue'
import ArticleViews from './ArticleViews.vue'
import TopViews from './TopViews.vue'
import PinnedArticles from './PinnedArticles.vue'
import HomeCards from './HomeCards.vue'
import RecruitBanner from './RecruitBanner.vue'
import { useMermaid } from './mermaid'
import { isAggregatePage, isRankableArticle } from './page-kind'
// 导航按钮的文字和路径都从这里取：页脚（config.mts）用的是同一个常量，
// 改一处两处都会动，不会出现「页脚改了、导航还指着旧的」
import { FEEDBACK } from '../shared/contact'

const { Layout } = DefaultTheme
const { page } = useData()

// 把正文里的 ```mermaid 代码块渲染成图（按需加载 mermaid，见 mermaid.ts）
useMermaid()

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
    <template #layout-top>
      <RecruitBanner />
    </template>
    <template #doc-before>
      <template v-if="!isAggregate">
        <ArticleFreshness />
        <ArticleTags />
        <FrontmatterAuthors />
      </template>
      <ArticleViews v-if="isCountable" />
    </template>
    <!-- index.md 改用 homeCards 键，默认主题的 features 行不再渲染，
         这一行连同第三个格子里的「随便看看」由 HomeCards 渲染 -->
    <template #home-features-before>
      <HomeCards />
    </template>
    <template #home-features-after>
      <PinnedArticles />
      <TopViews />
    </template>
    <!--
      「缺什么？告诉我们」单独做成按钮，不再放在「参与维护」下拉里：
      它是读者向站里提要求的动作，跟贡献指南 / 仓库说明 / 内容规范那些
      「维护者看的文档」不是一类东西，埋进下拉基本没人点。

      桌面端放在导航条最右边（这个 slot 紧挨汉堡按钮之前）；
      手机上导航条放不下，改用下面那个 slot 进展开菜单。
    -->
    <template #nav-bar-content-after>
      <a class="nav-wanted" :href="FEEDBACK.path" title="缺什么、哪里写错了，直接说一句">
        <span class="nav-wanted__long">{{ FEEDBACK.label }}</span>
        <span class="nav-wanted__short">反馈</span>
      </a>
    </template>
    <template #nav-screen-content-after>
      <a class="nav-wanted nav-wanted--screen" :href="FEEDBACK.path">{{ FEEDBACK.label }}</a>
    </template>
  </Layout>
</template>
