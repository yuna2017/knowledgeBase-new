import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContentLoader } from 'vitepress'
import { loadLastCommits } from './.vitepress/shared/git'

export interface RecentPage {
  title: string
  url: string
  /** 最后一次提交的 ISO 时间 */
  date: string
}

declare const data: RecentPage[]
export { data }

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 聚合页自身没有内容意义，不列进「最近更新」 */
const EXCLUDED_URLS = new Set(['/', '/tags', '/recent'])

export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): RecentPage[] {
    const lastCommits = loadLastCommits(repoRoot)

    return pages
      .map((page) => {
        // 先剥掉 frontmatter 再找一级标题，避免把 frontmatter 里以 # 开头的注释当标题
        const body = page.src?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
        const heading = body?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
        // createContentLoader 给的是站点 URL，换算回仓库里的源文件路径
        const relative = 'vitepress-docs' + (page.url === '/' ? '/index' : page.url) + '.md'

        return {
          title: String(page.frontmatter.title || heading || page.url),
          url: page.url,
          date: lastCommits.get(relative)?.date ?? ''
        }
      })
      .filter((page) => page.date && !EXCLUDED_URLS.has(page.url) && !page.url.includes('['))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 50)
  }
})
