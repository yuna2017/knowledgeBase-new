import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLastCommits } from '../.vitepress/shared/git'
import { extractDescription } from '../.vitepress/shared/markdown'
import { tagSlug } from '../.vitepress/theme/tag-utils'

interface TaggedPage {
  title: string
  url: string
  /** 正文首段摘要，让读者不点进去也能判断要不要看 */
  description: string
  /** 最后修订时间（ISO）；知识库里不少内容有时效性，这个比标题更能帮人筛选 */
  date: string
}

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(docsRoot, '..')

/**
 * 从 frontmatter 里取 tags。
 *
 * 这里不能用 createContentLoader —— 动态路由要在 VitePress 解析配置之前
 * 就把路径算出来，那时候 content loader 还没有可用的运行环境。
 * 所以直接读文件，只解析需要的这几个字段。
 */
function readTags(frontmatter: string): string[] {
  const block = frontmatter.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m)
  if (block) {
    return block[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }

  const inline = frontmatter.match(/^tags:\s*(.+)$/m)?.[1]?.trim()
  if (!inline || inline.startsWith('#')) return []

  return inline
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(tag => tag.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

export default {
  paths() {
    const lastCommits = loadLastCommits(repoRoot)
    const grouped = new Map<string, TaggedPage[]>()
    /** 记录标签共现次数，用来在标签页底部推荐相关标签 */
    const coOccurrence = new Map<string, Map<string, number>>()

    for (const name of readdirSync(docsRoot)) {
      if (!name.endsWith('.md') || name === 'index.md') continue

      const text = readFileSync(join(docsRoot, name), 'utf8')
      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
      if (!frontmatter) continue

      const tags = [...new Set(readTags(frontmatter))]
      if (!tags.length) continue

      const title =
        frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ||
        text.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() ||
        name.replace(/\.md$/, '')

      const description =
        frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ||
        extractDescription(docsRoot, name, 90)

      const entry: TaggedPage = {
        title,
        url: '/' + name.replace(/\.md$/, ''),
        description,
        date: lastCommits.get('vitepress-docs/' + name)?.date ?? ''
      }

      for (const tag of tags) {
        if (!grouped.has(tag)) grouped.set(tag, [])
        grouped.get(tag)!.push(entry)

        if (!coOccurrence.has(tag)) coOccurrence.set(tag, new Map())
        const partners = coOccurrence.get(tag)!
        for (const other of tags) {
          if (other === tag) continue
          partners.set(other, (partners.get(other) ?? 0) + 1)
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
          // 新的排前面，时效性内容更容易被看到
          docs: docs.sort((left, right) =>
            right.date.localeCompare(left.date) ||
            left.title.localeCompare(right.title, 'zh-CN')
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
