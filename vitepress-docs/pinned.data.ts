import { createDocumentLoader } from '../shared/documents/catalog.mjs'

export interface PinnedPage {
  title: string
  url: string
  description: string
  order: number
}

export default createDocumentLoader((pages): PinnedPage[] =>
  pages.filter((page) => page.pinned !== undefined)
    .map(({ title, url, description, pinned }) => ({ title, url, description, order: pinned }))
    .sort((left, right) => left.order - right.order)
)
