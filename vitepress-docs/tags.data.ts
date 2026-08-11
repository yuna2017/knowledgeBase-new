import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContentLoader } from 'vitepress'
import { loadLastCommits } from './.vitepress/shared/git'

export interface TaggedPage {
  title: string
  url: string
  tags: string[]
  /** 最后修订时间（ISO）；标签总览用它挑出每个标签下最新的一篇 */
  date: string
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): TaggedPage[] {
    const lastCommits = loadLastCommits(repoRoot)

    return pages
      .map((page) => {
        const rawTags = page.frontmatter.tags
        const tags = Array.isArray(rawTags)
          ? rawTags.map((tag) => String(tag).trim()).filter(Boolean)
          : rawTags
            ? [String(rawTags).trim()]
            : []
        const heading = page.src?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
        // createContentLoader 给的是站点 URL，换算回仓库里的源文件路径
        const relative = 'vitepress-docs' + (page.url === '/' ? '/index' : page.url) + '.md'

        return {
          title: String(page.frontmatter.title || heading || page.url),
          url: page.url,
          tags: [...new Set(tags)],
          date: lastCommits.get(relative)?.date ?? ''
        }
      })
      .filter((page) => page.tags.length > 0)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }
})
