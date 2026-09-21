import type { Theme } from 'vitepress'
import { NolebaseGitChangelogPlugin } from '@nolebase/vitepress-plugin-git-changelog/client'
import { NolebaseInlineLinkPreviewPlugin } from '@nolebase/vitepress-plugin-inline-link-preview/client'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import FeedbackForm from './FeedbackForm.vue'
import FeedbackAudit from './FeedbackAudit.vue'
import FeedbackStatus from './FeedbackStatus.vue'
import FeedbackLookup from './FeedbackLookup.vue'
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
    // 需求反馈：这两个组件要在 Markdown 里直接用（<FeedbackForm /> / <FeedbackAudit />）。
    // 组件是服务端预渲染的，所以即使浏览器端 JS 没跑起来，表单也照样能用原生提交。
    app.component('FeedbackForm', FeedbackForm)
    app.component('FeedbackAudit', FeedbackAudit)
    app.component('FeedbackStatus', FeedbackStatus)
    app.component('FeedbackLookup', FeedbackLookup)
  }
} satisfies Theme
