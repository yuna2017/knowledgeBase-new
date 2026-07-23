import { createContentLoader } from 'vitepress'

export interface PageMeta {
  title: string
  url: string
}

// 全站页面的 url → 标题映射，供首页阅读量排行把路径还原成标题与链接
export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): PageMeta[] {
    return pages.map((page) => {
      const heading = page.src?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
      return {
        title: String(page.frontmatter.title || heading || page.url),
        url: page.url
      }
    })
  }
})
