import { createDocumentLoader } from '../shared/documents/catalog.mjs'

export interface TaggedPage {
  title: string
  url: string
  tags: string[]
  date: string
}

export default createDocumentLoader((pages): TaggedPage[] =>
  pages.filter((page) => page.tags.length > 0 && page.kind !== 'home')
    .map(({ title, url, tags, lastModified }) => ({ title, url, tags, date: lastModified }))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
)
