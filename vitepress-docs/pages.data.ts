import { createContentLoader } from 'vitepress'

export interface PageMeta {
  title: string
  url: string
  /** 摘要，供首页「最高阅读」和「置顶推荐」用同一套字段展示 */
  description: string
}

// 全站页面的 url → 标题与摘要映射，供首页两处推荐区把路径还原成可读内容
export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): PageMeta[] {
    return pages.map((page) => {
      // 先剥掉 frontmatter 再找一级标题，避免把 frontmatter 里以 # 开头的注释当标题
      const body = page.src?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
      const heading = body?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
      return {
        title: String(page.frontmatter.title || heading || page.url),
        url: page.url,
        description: String(page.frontmatter.description || '')
      }
    })
  }
})
