import type { Theme } from 'vitepress'
import { NolebaseGitChangelogPlugin } from '@nolebase/vitepress-plugin-git-changelog/client'
import { NolebaseInlineLinkPreviewPlugin } from '@nolebase/vitepress-plugin-inline-link-preview/client'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import '@nolebase/vitepress-plugin-git-changelog/client/style.css'
import '@nolebase/vitepress-plugin-inline-link-preview/client/style.css'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // 渲染 config.mts 里 GitChangelogMarkdownSection 注入的「页面历史」区块。
    // 文案跟随站点 lang（zh-CN），插件自带中文，无需配置 locales。
    app.use(NolebaseGitChangelogPlugin)
    // 站内链接的悬停预览
    app.use(NolebaseInlineLinkPreviewPlugin)
  }
} satisfies Theme
