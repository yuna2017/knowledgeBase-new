import { createContentLoader } from 'vitepress'

export interface PinnedPage {
  title: string
  url: string
  description: string
  /** 置顶优先级，数字越小越靠前 */
  order: number
}

// 首页「置顶推荐」区的数据源：收集带 pinned: <number> 的文档并按升级排序。
// 与 pages.data.ts / recent.data.ts 同一套构建期机制，纯静态，无运行期依赖。
export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): PinnedPage[] {
    return pages
      .map((page) => {
        // 先剥掉 frontmatter 再找一级标题，避免把 frontmatter 里以 # 开头的注释当标题
        const body = page.src?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
        const heading = body?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
        return {
          title: String(page.frontmatter.title || heading || page.url),
          url: page.url,
          description: String(page.frontmatter.description || ''),
          order: Number(page.frontmatter.pinned)
        }
      })
      // 只有显式写了 pinned: 正整数 的文档才进入置顶区
      .filter((page) => Number.isInteger(page.order) && page.order > 0)
      .sort((left, right) => left.order - right.order)
  }
})
