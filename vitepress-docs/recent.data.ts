import { createDocumentLoader } from '../shared/documents/catalog.mjs'

export interface RecentPage {
  title: string
  url: string
  date: string
}

declare const data: RecentPage[]
export { data }

// Preserve the recent-changes list for all real documents, including maintenance pages.
export default createDocumentLoader((pages): RecentPage[] =>
  pages.filter((page) => page.lastModified && page.kind !== 'home' && page.kind !== 'aggregate')
    .map(({ title, url, lastModified }) => ({ title, url, date: lastModified }))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 50)
)
