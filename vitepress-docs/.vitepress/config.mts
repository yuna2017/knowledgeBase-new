import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defineConfig } from 'vitepress'

/** 站点正式域名，改域名时只改这一处。用于 canonical、og:url 和 sitemap。 */
const SITE_URL = 'https://docs.yuna.team'

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

/** 去掉行内 Markdown 语法，只留纯文字。 */
function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')    // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/`([^`]*)`/g, '$1')             // 行内代码
    .replace(/[*_~]/g, '')                   // 强调符号
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string): string {
  return text.length > 150 ? text.slice(0, 149).trimEnd() + '…' : text
}

/** 读取 Markdown 源文件，并展开 VitePress 的 <!--@include: xxx--> 引入。 */
function readMarkdown(file: string, depth = 0): string {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return ''
  }

  raw = raw
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')      // frontmatter
    .replace(/<script[\s\S]*?<\/script>/gi, '')          // Vue <script setup>
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/^```[\s\S]*?^```/gm, '')                   // 围栏代码块
  if (depth >= 2) return raw

  // CONTRIBUTING.md 这类页面整篇都是一条 include，不展开就取不到任何描述
  return raw.replace(/<!--\s*@include:\s*(.+?)\s*-->/g, (_match, target: string) => {
    return readMarkdown(resolve(dirname(file), target.split('{')[0].trim()), depth + 1)
  })
}

/**
 * 从 Markdown 正文里取第一段可读文字作为页面描述。
 * 这样不必给每篇文章手写 description，也不会让所有页面共用同一句站点简介。
 * 段落和列表按文档顺序取先出现的那个——不少页面（如 tech-mooc）标题之后直接就是列表。
 * 文章 frontmatter 里显式写了 description 时，以那个为准。
 */
function extractDescription(srcDir: string, relativePath: string): string {
  const body = readMarkdown(join(srcDir, relativePath))

  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.trim()
    // 跳过标题、表格和原始 HTML
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('<')
    ) {
      continue
    }

    let text: string
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(trimmed)) {
      text = trimmed
        .split(/\r?\n/)
        .map((line) => stripInline(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')))
        .filter((line) => line.length >= 4)
        .join('；')
    } else {
      text = stripInline(trimmed.replace(/^>\s?/gm, ''))
    }

    if (text.length >= 10) return truncate(text)
  }

  return ''
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

    // 与 VitePress 实际渲染的 <title> 保持一致，避免分享卡片和标签页标题对不上
    const pageTitle = pageData.frontmatter.title || pageData.title || ''
    const fullTitle = isHome || !pageTitle
      ? siteConfig.site.title
      : pageTitle + ' | ' + siteConfig.site.title

    const description =
      pageData.frontmatter.description ||
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
      {
        text: '文档入口',
        items: [
          { text: '标签', link: '/tags' }
        ]
      },
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
      },
      {
        text: '项目维护',
        collapsed: true,
        items: [
          { text: '仓库说明', link: '/README' },
          { text: '内容术语与维护规范', link: '/CONTEXT' },
          { text: '贡献指南', link: '/CONTRIBUTING' }
        ]
      }
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
      message: 'MIT Licensed',
      copyright: 'Copyright © 2017-2026 燕山大学大学生网络信息协会'
    }
  }
})
