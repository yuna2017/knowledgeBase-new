import { loadDocuments } from '../../shared/documents/catalog.mjs'
import { tagSlug } from '../../shared/documents/tags.mjs'

interface TaggedPage {
  title: string
  url: string
  description: string
  date: string
}

export default {
  paths() {
    const grouped = new Map<string, TaggedPage[]>()
    const coOccurrence = new Map<string, Map<string, number>>()
    for (const page of loadDocuments()) {
      if (page.kind === 'home') continue
      const entry = {
        title: page.title, url: page.url, description: page.description, date: page.lastModified
      }
      for (const tag of page.tags) {
        if (!grouped.has(tag)) grouped.set(tag, [])
        grouped.get(tag)!.push(entry)
        if (!coOccurrence.has(tag)) coOccurrence.set(tag, new Map())
        const partners = coOccurrence.get(tag)!
        for (const other of page.tags) {
          if (other !== tag) partners.set(other, (partners.get(other) ?? 0) + 1)
        }
      }
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
      .map(([tag, docs]) => ({
        params: {
          tag: tagSlug(tag),
          name: tag,
          count: docs.length,
          docs: docs.sort((left, right) =>
            right.date.localeCompare(left.date) || left.title.localeCompare(right.title, 'zh-CN')
          ),
          related: [...(coOccurrence.get(tag) ?? new Map())]
            .sort(([leftTag, leftCount], [rightTag, rightCount]) =>
              rightCount - leftCount || leftTag.localeCompare(rightTag, 'zh-CN')
            )
            .slice(0, 8)
            .map(([name, count]) => ({ name, count, slug: tagSlug(name) }))
        }
      }))
  }
}
