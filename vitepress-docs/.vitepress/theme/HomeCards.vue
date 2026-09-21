<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import RandomPick from './RandomPick.vue'

/**
 * 首页顶部这一行卡片，替代默认主题的 features 行。
 *
 * 默认主题的 VPHomeFeatures 会把 frontmatter.features 整行渲染掉，
 * 没有插槽可以只替换其中一张，所以这一行改由本组件渲染：
 * 前两张静态卡片仍然从 index.md 的 frontmatter（homeCards 键）读取，
 * 第三个格子留给交互式的「随便看看」。
 *
 * 样式对齐 VPFeature（同样的圆角、底色、内边距，以及 768px 起的三列断点），
 * 静态卡片和替换前保持一致。
 */

interface HomeCard {
  title: string
  details?: string
  link: string
  /** 底部的行动文案，对应默认主题 VPFeature 的同名字段 */
  linkText?: string
}

const { frontmatter } = useData()

const cards = computed(() => (frontmatter.value.homeCards ?? []) as HomeCard[])
</script>

<template>
  <div class="home-cards">
    <div class="home-cards__container">
      <div class="home-cards__items">
        <div v-for="card in cards" :key="card.title" class="home-cards__item">
          <a class="home-card" :href="withBase(card.link)">
            <article class="home-card__box">
              <h2 class="home-card__title">{{ card.title }}</h2>
              <p v-if="card.details" class="home-card__details">{{ card.details }}</p>
              <p v-if="card.linkText" class="home-card__link">
                {{ card.linkText }}
                <span class="vpi-arrow-right home-card__link-icon" />
              </p>
            </article>
          </a>
        </div>
        <div class="home-cards__item">
          <RandomPick />
        </div>
      </div>
    </div>
  </div>
</template>
