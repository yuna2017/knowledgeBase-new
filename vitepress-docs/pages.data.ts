import { createDocumentLoader } from '../shared/documents/catalog.mjs'

export interface PageMeta {
  title: string
  url: string
  description: string
}

export default createDocumentLoader((pages): PageMeta[] =>
  pages.map(({ title, url, description }) => ({ title, url, description }))
)
