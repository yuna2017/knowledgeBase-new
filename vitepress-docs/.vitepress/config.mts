import { join } from 'node:path'
import { BiDirectionalLinks } from '@nolebase/markdown-it-bi-directional-links'
import {
  GitChangelog,
  GitChangelogMarkdownSection
} from '@nolebase/vitepress-plugin-git-changelog/vite'
import { InlineLinkPreviewElementTransform } from '@nolebase/vitepress-plugin-inline-link-preview/markdown-it'
import { defineConfig } from 'vitepress'
import { ORGANIZATION, QQ_GROUP } from './shared/contact'
import { extractDescription } from './shared/markdown'

/** 站点正式域名，改域名时只改这一处。用于 canonical、og:url 和 sitemap。 */
const SITE_URL = 'https://docs.yuna.team'

/** 仓库地址，页面历史的「查看完整历史」指向这里。 */
const REPO_URL = 'https://github.com/yuna2017/knowledgeBase-new'

/**
 * 不注入「页面历史」区块的页面。
 * 首页是 home 布局，tags / recent 是聚合页，本身没有修订史可言。
 */
const CHANGELOG_EXCLUDES = ['index.md', 'tags.md', 'recent.md']

/** tags/ 下是动态路由生成的标签页，同样不需要修订史。 */
function isGeneratedPage(id: string): boolean {
  return /[\\/]tags[\\/]/.test(id)
}

/** 社交平台分享缩略图。换成 1200×630 的图后，同步改下面的宽高。 */
const OG_IMAGE = {
  path: '/images/logo.png',
  width: '1274',
  height: '1274',
  alt: 'YUNA KnowledgeBase'
}

/** 把源文件路径转成站点上的绝对地址（cleanUrls 开启，所以不带 .html）。 */
function pageUrl(relativePath: string): string {
  let path = relativePath.replace(/\.md$/, '')
  if (path === 'index') path = ''
  else if (path.endsWith('/index')) path = path.slice(0, -'index'.length)
  return SITE_URL + '/' + path
}

export default defineConfig({
  title: 'YUNA KnowledgeBase',
  description: '面向问题的燕大师生在线生活指南',
  lang: 'zh-CN',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  // 构建时生成 /sitemap.xml，lastUpdated 开启后会带上每页的 lastmod
  sitemap: {
    hostname: SITE_URL
  },

  vite: {
    plugins: [
      // 构建时读 git log，生成每页的修订历史数据。
      // 只用它的「页面历史」区块，作者展示仍由 frontmatter + FrontmatterAuthors.vue
      // 负责，所以不需要配 mapAuthors（页面历史本身不显示作者名）。
      // 依赖完整的提交历史：CI 里 actions/checkout 必须保持 fetch-depth: 0，
      // 浅克隆会让所有页面拿到同一个时间（与 lastUpdated 是同一个坑）。
      GitChangelog({
        repoURL: () => REPO_URL
      }),
      // 把「页面历史」注入到每篇文章末尾，不需要逐页放组件。
      // 贡献者区块关掉：作者展示仍由 frontmatter + FrontmatterAuthors.vue 负责，
      // 两者同时开会在同一页出现两份署名。
      GitChangelogMarkdownSection({
        excludes: CHANGELOG_EXCLUDES,
        // 动态路由生成的标签页，id 是 tags/校园网.md 这种解析后的路径，
        // 用 excludes 的字面名单匹配不到，只能靠这个函数拦
        exclude: (id) => isGeneratedPage(id),
        sections: {
          disableContributors: true
        }
      })
    ],
    optimizeDeps: {
      exclude: [
        '@nolebase/vitepress-plugin-git-changelog/client',
        '@nolebase/vitepress-plugin-inline-link-preview/client'
      ]
    },
    ssr: {
      noExternal: [
        '@nolebase/vitepress-plugin-git-changelog',
        '@nolebase/vitepress-plugin-inline-link-preview',
        '@nolebase/ui'
      ]
    }
  },

  markdown: {
    config(md) {
      // Obsidian 风格的 [[双向链接]]，改名或移动文件时不容易断链
      md.use(BiDirectionalLinks({
        dir: 'vitepress-docs'
      }))
      // 站内链接悬停时弹出目标页面的预览
      md.use(InlineLinkPreviewElementTransform)
    }
  },

  head: [
    ['link', { rel: 'icon', href: '/images/logo.png' }],

    // Google Search Console 所有权验证（网址前缀资源 → HTML 标记）。
    // 验证通过后不要删除这一行，Google 会定期复查，删掉会掉验证。
    ['meta', { name: 'google-site-verification', content: 'oZAeilMP_guBGCKdGDStjnpc0uLpBznYHDSWeM-d_Pk' }],

    // 各页面共用的社交分享标签，随页面变化的部分在下面的 transformPageData 里补
    ['meta', { property: 'og:site_name', content: 'YUNA KnowledgeBase' }],
    ['meta', { property: 'og:locale', content: 'zh_CN' }],
    ['meta', { property: 'og:image', content: SITE_URL + OG_IMAGE.path }],
    ['meta', { property: 'og:image:width', content: OG_IMAGE.width }],
    ['meta', { property: 'og:image:height', content: OG_IMAGE.height }],
    ['meta', { property: 'og:image:alt', content: OG_IMAGE.alt }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: SITE_URL + OG_IMAGE.path }]
  ],

  transformPageData(pageData, { siteConfig }) {
    const isHome = pageData.frontmatter.layout === 'home'
    const url = pageUrl(pageData.relativePath)

    /**
     * 标签页的 <h1> 写的是 {{ $params.name }}，而 VitePress 在解析阶段就把
     * 标题抓走了——那时候 Vue 还没渲染，抓到的是模板字面量。
     * 这里用路由参数覆盖掉，浏览器标签页、分享卡片和站内搜索才拿得到真实标签名。
     */
    const tagName = typeof pageData.params?.name === 'string'
      ? pageData.params.name
      : ''
    if (tagName) {
      pageData.title = tagName
      pageData.frontmatter.title = tagName
    }

    // 与 VitePress 实际渲染的 <title> 保持一致，避免分享卡片和标签页标题对不上
    const pageTitle = pageData.frontmatter.title || pageData.title || ''
    const fullTitle = isHome || !pageTitle
      ? siteConfig.site.title
      : pageTitle + ' | ' + siteConfig.site.title

    const description =
      pageData.frontmatter.description ||
      (tagName
        ? `归入「${tagName}」标签的 ${pageData.params?.count ?? 0} 篇文档。`
        : '') ||
      (isHome ? '' : extractDescription(siteConfig.srcDir, pageData.relativePath)) ||
      siteConfig.site.description

    // 同时驱动 <meta name="description">
    pageData.description = description

    const head = (pageData.frontmatter.head ??= [])
    head.push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: fullTitle }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { name: 'twitter:title', content: fullTitle }],
      ['meta', { name: 'twitter:description', content: description }]
    )
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      {
        text: '校园服务',
        items: [
          { text: '校园网', link: '/campus-network-index' },
          { text: '一网通办', link: '/campus-service-index' },
          { text: '校园正版化', link: '/campus-ms-index' },
          { text: '校园邮箱', link: '/campus-mail-index' }
        ]
      },
      { text: '技术资源', link: '/tech-index' },
      { text: '标签', link: '/tags' },
      { text: '最近更新', link: '/recent' },
      {
        text: '参与维护',
        items: [
          { text: '贡献指南', link: '/CONTRIBUTING' },
          { text: '仓库说明', link: '/README' },
          { text: '内容规范', link: '/CONTEXT' }
        ]
      }
    ],

    sidebar: [
      // 标签与最近更新只放在顶部 nav，不进 sidebar：
      // sidebar 的顺序同时决定「上一篇/下一篇」的串联，聚合页混在里面会让
      // 文章的上一篇指到「最近更新」这种非文章页去
      {
        text: '校园网',
        items: [
          { text: '校园网简介', link: '/campus-network-index' },
          { text: '连接与认证', link: '/campus-network-connect' },
          { text: '常见问题', link: '/campus-network-qa' },
          { text: '学校 WebVPN', link: '/campus-network-vpn' }
        ]
      },
      {
        text: '校园服务',
        items: [
          { text: '一网通办', link: '/campus-service-index' },
          { text: '校园正版化', link: '/campus-ms-index' },
          { text: '校园邮箱', link: '/campus-mail-index' }
        ]
      },
      {
        text: '技术资源',
        collapsed: true,
        items: [
          { text: '技术资源导航', link: '/tech-index' },
          { text: 'GitHub 学生包与教育优惠', link: '/tech-student-pack' },
          { text: 'Cloudflare 免费额度', link: '/tech-cloudflare' },
          { text: '免费云资源', link: '/tech-free-cloud' },
          { text: '免费 AI API 额度', link: '/tech-free-ai' },
          { text: '域名申请与管理', link: '/tech-domain' },
          { text: '文献与科研工具', link: '/tech-research-tools' },
          { text: 'MOOC 与免费学习资源', link: '/tech-mooc' },
          { text: 'Git 与 GitHub 入门', link: '/tech-git-github' },
          { text: 'HTTP/HTTPS 返回码大全', link: '/tech-http-status-codes' },
          { text: '免费与开源替代软件', link: '/tech-oss-alternatives' },
          { text: 'LLM 常用术语', link: '/tech-llm-glossary' },
          { text: 'Vibe Coding 入门', link: '/tech-vibecoding' },
          { text: 'AI 编程工具', link: '/tech-coding-tools' },
          { text: 'Vibe Coding 使用指南', link: '/tech-vibe-coding-guide' },
          { text: 'AI Skill 与 MCP 基础', link: '/tech-skills-mcp' },
          { text: 'MCP 与 Skills 推荐', link: '/mcp-recommendation' },
          { text: 'CC Switch 简介', link: '/tech-cc-switch' },
          { text: 'API 中转站简介', link: '/tech-relay' },
          { text: '自托管入门', link: '/tech-self-hosting' }
        ]
      }
      // 「项目维护」（仓库说明 / 内容规范 / 贡献指南）只放在顶部 nav 的「参与维护」里。
      // 放进 sidebar 会把它们串进文章的上一篇/下一篇，读者看完自托管入门会被带到仓库说明去。
    ],

    outline: [2, 3],
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yuna2017/knowledgeBase-new' }
    ],
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    lastUpdated: {
      text: '最后校准时间',
      formatOptions: {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Asia/Shanghai',
        forceLocale: true
      }
    },
    footer: {
      // 页脚在每一页都会显示，招新信息放这里既全站可见又不打断正文。
      // 群号本身做成链接：点得动，链接失效时数字也还在，可以手动搜索加群。
      message: [
        `加入我们：QQ 群 <a href="${QQ_GROUP.joinUrl}" target="_blank" rel="noreferrer">${QQ_GROUP.number}</a>`,
        '<a href="https://opensource.org/licenses/MIT" target="_blank" rel="noreferrer">MIT Licensed</a>'
      ].join(' · '),
      copyright: `Copyright © 2017-2026 ${ORGANIZATION}`
    }
  }
})
