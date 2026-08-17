import { join } from 'node:path'
import { BiDirectionalLinks } from '@nolebase/markdown-it-bi-directional-links'
import {
  GitChangelog,
  GitChangelogMarkdownSection
} from '@nolebase/vitepress-plugin-git-changelog/vite'
import { InlineLinkPreviewElementTransform } from '@nolebase/vitepress-plugin-inline-link-preview/markdown-it'
import { defineConfig } from 'vitepress'
import { ORGANIZATION, QQ_GROUP } from './shared/contact'
import { extractDescription, truncate } from './shared/markdown'

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

/**
 * 搜索结果里描述的可用长度。
 *
 * 按中文算，不是照搬英文站常说的 150-160：中文一个字占的宽度约是拉丁字母的
 * 两倍，搜索结果里 80-90 个汉字就把摘要那一行铺满了。所以下限取 80——
 * 低于这个数说不清整页在讲什么，Bing Webmaster Tools 会报「描述过短」；
 * 上限取 130，再长的部分在结果页上本来也看不到。
 */
const DESCRIPTION_MIN = 80
const DESCRIPTION_MAX = 130

/**
 * 标签页的 <meta description>。
 *
 * 早先只写「归入「X」标签的 N 篇文档。」，四十多个标签页除了标签名和数字之外
 * 一模一样，字数也只有十几个——Bing 会同时判成「描述过短」和「描述重复」。
 * 这里把该标签下的文档标题列进去：每页内容天然不同，长度也够，
 * 而且搜索结果里能直接看到这个标签下有什么。
 */
function tagDescription(tagName: string, count: number, docs: unknown): string {
  const list = Array.isArray(docs) ? docs : []
  const titles = list.map((doc) => String(doc?.title ?? '').trim()).filter(Boolean)

  const head = `YUNA 知识库中归入「${tagName}」标签的 ${count} 篇文档`
  if (titles.length === 0) return head + '。'

  // 列到放不下为止，剩下的用「等 N 篇」收尾，避免中途被截断成半个标题
  const listed: string[] = []
  for (const title of titles) {
    const next = [...listed, title].join('、')
    if (head.length + 1 + next.length + 1 > DESCRIPTION_MAX) break
    listed.push(title)
  }
  if (listed.length === 0) return head + '。'

  const rest = titles.length - listed.length
  const text = head + '：' + listed.join('、') +
    (rest > 0 ? ` 等 ${titles.length} 篇。` : '。')

  /*
   * 标签下只有一两篇时，光列标题凑不满长度。这里补上首篇自己的摘要：
   * 它逐个标签都不同，不会像一句固定的收尾语那样，让四十多个标签页
   * 从「模板重复」换成另一种形式的重复。
   */
  if (text.length >= DESCRIPTION_MIN) return text
  const lead = String(list[0]?.description ?? '').trim()
  return lead ? text + truncate(lead, DESCRIPTION_MAX - text.length) : text
}

/**
 * 复刻 VitePress 内部拼 <title> 的规则，用于 og:title 和 twitter:title。
 *
 * 分享卡片的标题必须和浏览器标签页显示的完全一致，所以不能自己简写成
 * 「标题 | 站点名」：VitePress 还要处理 titleTemplate 为字符串、为 false，
 * 以及页面标题恰好等于站点名（此时不再拼后缀）这几种情况——首页和仓库说明
 * 页之前的标题重复，正是最后那条规则造成的。
 */
function renderedTitle(
  siteTitle: string,
  title: string,
  template: string | boolean | undefined
): string {
  if (typeof template === 'string' && template.includes(':title')) {
    return template.replace(/:title/g, title)
  }

  const suffix =
    template === false
      ? ''
      : template === true || template === undefined
        ? ' | ' + siteTitle
        : siteTitle === template
          ? ''
          : ' | ' + template

  // 标题本身就是后缀那部分时，VitePress 不会再拼一遍
  return title === suffix.slice(3) ? title : title + suffix
}

/**
 * 构建过程中收集描述长度不合规的页面，在 buildEnd 里一次性报出来。
 *
 * 放在这里而不是 scripts/check-docs.mjs：只有 transformPageData 拿得到每页
 * 最终真正写进 HTML 的描述，包括动态生成的标签页；在外部脚本里重算一遍
 * 取值规则，迟早会和这里对不上。
 */
const descriptionIssues = new Map<string, string>()

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
     *
     * 加「标签：」前缀是因为有的标签和文章同名（「校园邮箱」「一网通办」），
     * 不加的话聚合页和文章页的 <title> 一模一样，搜索引擎和站内搜索都分不出
     * 哪个是文章、哪个是标签入口。页面上的 <h1> 不受影响，仍然只显示标签名。
     */
    const tagName = typeof pageData.params?.name === 'string'
      ? pageData.params.name
      : ''
    if (tagName) {
      pageData.title = '标签：' + tagName
      pageData.frontmatter.title = pageData.title
    }

    const pageTitle =
      pageData.frontmatter.title || pageData.title || siteConfig.site.title
    const fullTitle = renderedTitle(
      siteConfig.site.title,
      pageTitle,
      pageData.frontmatter.titleTemplate
    )

    const description =
      pageData.frontmatter.description ||
      (tagName
        ? tagDescription(
            tagName,
            Number(pageData.params?.count ?? 0),
            pageData.params?.docs
          )
        : '') ||
      (isHome
        ? ''
        : extractDescription(
            siteConfig.srcDir,
            pageData.relativePath,
            // 自动摘要按同一个上限截断，否则正文首段一长就直接顶穿检查
            DESCRIPTION_MAX
          )) ||
      siteConfig.site.description

    // 同时驱动 <meta name="description">
    pageData.description = description

    if (description.length < DESCRIPTION_MIN) {
      descriptionIssues.set(
        pageData.relativePath,
        '描述只有 ' + description.length + ' 个字符：' + description
      )
    } else if (description.length > DESCRIPTION_MAX) {
      descriptionIssues.set(
        pageData.relativePath,
        '描述有 ' + description.length + ' 个字符，搜索结果里会被截断'
      )
    }

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

  /*
   * 描述长度不合规就让构建失败。
   *
   * 部署和 PR 检查跑的都是 npm run build，所以这一条同时挡住这两条路径：
   * 新加的文档如果首段不适合当摘要，必须补 frontmatter 的 description，
   * 而不是等下一次 Bing 报告出来才发现。
   */
  buildEnd() {
    if (descriptionIssues.size === 0) return

    const lines = [...descriptionIssues]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, reason]) => '- ' + path + '：' + reason)

    throw new Error(
      '有 ' + descriptionIssues.size + ' 个页面的 meta description 长度不合规' +
      '（应为 ' + DESCRIPTION_MIN + '-' + DESCRIPTION_MAX + ' 字符）：\n' +
      lines.join('\n') +
      '\n在页面 frontmatter 里写一行 description 即可覆盖自动摘要。'
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
          { text: '校园邮箱', link: '/campus-mail-index' },
          { text: '常用部门与公众号', link: '/campus-departments-wechat' }
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
          { text: '图吧工具箱', link: '/tech-tubaba-toolbox' },
          { text: '在线实用工具网址', link: '/tech-online-tools' },
          { text: 'LLM 常用术语', link: '/tech-llm-glossary' },
          { text: 'Vibe Coding 入门', link: '/tech-vibecoding' },
          { text: 'AI 编程工具', link: '/tech-coding-tools' },
          { text: 'Vibe Coding 使用指南', link: '/tech-vibe-coding-guide' },
          { text: 'Vibe Coding 实战教程（长篇）', link: '/vibecoding_v1_202605' },
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
