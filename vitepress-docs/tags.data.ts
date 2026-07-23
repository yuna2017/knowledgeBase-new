import { createContentLoader } from 'vitepress'

export interface TaggedPage {
  title: string
  url: string
  tags: string[]
}

export default createContentLoader('*.md', {
  includeSrc: true,
  transform(pages): TaggedPage[] {
    return pages
      .map((page) => {
        const rawTags = page.frontmatter.tags
        const tags = Array.isArray(rawTags)
          ? rawTags.map((tag) => String(tag).trim()).filter(Boolean)
          : rawTags
            ? [String(rawTags).trim()]
            : []
        const heading = page.src?.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()

        return {
          title: String(page.frontmatter.title || heading || page.url),
          url: page.url,
          tags: [...new Set(tags)]
        }
      })
      .filter((page) => page.tags.length > 0)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }
})

