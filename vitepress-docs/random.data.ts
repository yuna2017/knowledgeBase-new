import { createDocumentLoader } from '../shared/documents/catalog.mjs'
import { truncate } from '../shared/documents/markdown.mjs'
import { isRankableArticle } from '../shared/documents/page-kind.mjs'

export interface RandomPickPage {
  title: string
  url: string
  tags: string[]
  description: string
  date: string
}

// The browser shuffles the pool; the build only determines eligible articles.
export default createDocumentLoader((pages): RandomPickPage[] =>
  pages.filter((page) => isRankableArticle(page.url))
    .map(({ title, url, tags, description, lastModified }) => ({
      title, url, tags, description: truncate(description, 90), date: lastModified
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
)
