<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RECRUITMENT } from '../shared/contact'

const bannerRef = ref<HTMLElement | null>(null)
/** 用户本次会话是否已关闭横幅 */
const dismissed = ref(false)

/**
 * 把横幅实际高度写到 :root 的 --vp-layout-top-height。
 *
 * 导航栏（VPNav）和正文（VPContent）都通过 var(--vp-layout-top-height) 定位，
 * 是横幅的兄弟节点，并非其后代。变量只能向下继承，所以必须写到
 * document.documentElement 这个公共祖先上，导航栏和正文才能读到并整体下移，
 * 否则固定定位的横幅会盖住顶部按钮。
 */
function applyHeight() {
  const height = dismissed.value || !RECRUITMENT.enabled ? 0 : (bannerRef.value?.offsetHeight ?? 0)
  document.documentElement.style.setProperty('--vp-layout-top-height', height + 'px')
}

function dismiss() {
  try {
    sessionStorage.setItem('recruit-banner-dismissed', '1')
  } catch {
    // sessionStorage 不可用（如隐私模式）时静默降级：仅本次关闭，不做持久化
  }
  dismissed.value = true
  applyHeight()
}

onMounted(() => {
  try {
    dismissed.value = sessionStorage.getItem('recruit-banner-dismissed') === '1'
  } catch {
    dismissed.value = false
  }
  applyHeight()
  window.addEventListener('resize', applyHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', applyHeight)
})
</script>

<template>
  <div v-if="!dismissed && RECRUITMENT.enabled" class="layout-top">
    <div ref="bannerRef" class="recruit-banner">
      <a :href="RECRUITMENT.link" target="_blank" rel="noreferrer">{{ RECRUITMENT.text }}</a>
      <button class="recruit-banner__close" aria-label="关闭招新横幅" @click="dismiss">×</button>
    </div>
  </div>
</template>
