import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { parseFrontmatter } from './frontmatter.mjs'
import { expandIncludes, extractDescription } from './markdown.mjs'
import { loadLastCommits } from './git.mjs'
import { getPageKind, isNoindex, normalizePagePath, sourcePathToUrl } from './page-kind.mjs'
import { tagSlug } from './tags.mjs'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const DOCS_ROOT = resolve(REPO_ROOT, 'vitepress-docs')
const markdown = new MarkdownIt({ html: true })
const ignoredDirectories = new Set(['node_modules', 'public', 'snippets', '_partials'])

export function walkDocuments(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) continue
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkDocuments(file))
    else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('[')) files.push(file)
  }
  return files.sort()
}

function headingTitle(content) {
  const tokens = markdown.parse(content, {})
  const heading = tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1')
  return heading >= 0 ? tokens[heading + 1]?.content?.trim() : ''
}

/** A build-time catalog. Source identity is retained, never reconstructed from a URL. */
export function loadDocuments({ docsRoot = DOCS_ROOT, repoRoot = REPO_ROOT, includeGit = true } = {}) {
  const commits = includeGit ? loadLastCommits(repoRoot) : new Map()
  const pages = walkDocuments(docsRoot).map((filePath) => {
    const sourcePath = relative(docsRoot, filePath).replace(/\\/g, '/')
    const repositoryPath = relative(repoRoot, filePath).replace(/\\/g, '/')
    const source = readFileSync(filePath, 'utf8')
    const metadata = parseFrontmatter(source, sourcePath)
    const content = expandIncludes(metadata.content, filePath)
    const url = sourcePathToUrl(sourcePath)
    return {
      ...metadata,
      sourcePath, filePath, repositoryPath, source, content, url,
      title: metadata.frontmatter.title || headingTitle(content) || url,
      description: metadata.frontmatter.description || extractDescription(docsRoot, sourcePath, 130),
      lastModified: commits.get(repositoryPath)?.date ?? '',
      kind: getPageKind(url),
      noindex: isNoindex(metadata.frontmatter)
    }
  })
  const routes = new Map()
  const slugs = new Map()
  for (const page of pages) {
    const route = normalizePagePath(page.url)
    if (routes.has(route)) throw new Error(`文档路由冲突：${routes.get(route)} 与 ${page.sourcePath}`)
    routes.set(route, page.sourcePath)
    for (const tag of page.tags) {
      const slug = tagSlug(tag)
      if (/[/\\?#%\[\]<>:"|*]/.test(slug) || /^\.+$/.test(slug) || slug.endsWith('.')) {
        throw new Error(`${page.sourcePath}：标签含不支持的路径字符：${tag}`)
      }
      if (slugs.has(slug) && slugs.get(slug) !== tag) throw new Error(`标签路由冲突：${slugs.get(slug)} 与 ${tag}`)
      slugs.set(slug, tag)
    }
  }
  for (const [slug, tag] of slugs) {
    if (routes.has('/tags/' + slug)) throw new Error(`标签路由与文档冲突：${tag}`)
  }
  return pages
}

/** VitePress data loaders project the catalog and keep Markdown hot reload working. */
export function createDocumentLoader(transform) {
  return {
    watch: [resolve(DOCS_ROOT, '**/*.md'), resolve(REPO_ROOT, 'CONTRIBUTING.md')],
    load() { return transform(loadDocuments()) }
  }
}
