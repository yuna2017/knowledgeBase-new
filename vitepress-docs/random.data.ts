import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContentLoader } from 'vitepress'
import { loadLastCommits } from './.vitepress/shared/git'
import { extractDescription, truncate } from './.vitepress/shared/markdown'
import { isRankableArticle } from './.vitepress/theme/page-kind'

export interface RandomPickPage {
  title: string
  url: string
  tags: string[]
  /** 摘要，卡片上截两行展示，读者不点进去也能判断要不要看 */
  description: string
  /** 最后修订时间（ISO），取不到 git 记录时为空串 */
  date: string
}

const docsRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(docsRoot, '..')

/**
 * 首页「随便看看」的抽取池。
 *
 * 和「置顶推荐」「最高阅读」不同，这里刻意不在构建期挑选任何一篇：
 * 挑选发生在浏览器里（见 theme/RandomPick.vue 的无放回洗牌），
 * 构建期只负责回答一个问题——哪些页面算知识库文章、可以进池子。
 *
 * 判定复用 page-kind 的 isRankableArticle，所以聚合入口页
 * （/tags、/recent）和维护文档（README / CONTRIBUTING / CONTEXT）
 * 自动排除在外，不会抽出一篇《贡献指南》当成文章推荐给读者。
 *
 * 洗完的牌堆按标题固定排序，让初始顺序在每次构建之间保持稳定
 * （顺序只影响洗牌的起点，不构成任何倾向）。
 */
export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): RandomPickPage[] {
    const lastCommits = loadLastCommits(repoRoot)

    return pages
      .filter((page) => isRankableArticle(page.url))
      .map((page) => {
        const name = page.url.replace(/^\//, '') + '.md'
        const rawTags = page.frontmatter.tags
        const tags = Array.isArray(rawTags)
          ? rawTags.map((tag) => String(tag).trim()).filter(Boolean)
          : rawTags
            ? [String(rawTags).trim()]
            : []
        // 先剥掉 frontmatter 再找一级标题，避免把 frontmatter 里以 # 开头的注释当标题
        const body = page.src?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
        const heading = body?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()

        // 和构建期的 meta description 同一套规则：先看 frontmatter，再取正文首段。
        // 截到 90 字——卡片上还会再 clamp 两行，这里只是别把整段都传给客户端。
        const description = truncate(
          String(page.frontmatter.description || extractDescription(docsRoot, name, 90) || ''),
          90
        )

        return {
          title: String(page.frontmatter.title || heading || page.url),
          url: page.url,
          tags: [...new Set(tags)],
          description,
          date: lastCommits.get('vitepress-docs/' + name)?.date ?? ''
        }
      })
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }
})
