import { existsSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { loadDocuments, DOCS_ROOT } from '../shared/documents/catalog.mjs'
import { normalizePagePath } from '../shared/documents/page-kind.mjs'
import { tagPath } from '../shared/documents/tags.mjs'
import { collectSourceLinks } from '../shared/documents/links.mjs'

const pages = loadDocuments({ includeGit: false })
const markdownSet = new Set(pages.map((page) => page.sourcePath))
const graph = new Map(pages.map((page) => [page.sourcePath, new Set()]))
const routes = new Map(pages.map((page) => [normalizePagePath(page.url), page.sourcePath]))
const files = new Map(pages.map((page) => [page.filePath, page.sourcePath]))
const errors = []
let localReferenceCount = 0

// These are the same actual tag routes emitted by [tag].paths.ts.
for (const page of pages) {
  if (page.kind === 'home') continue
  for (const tag of page.tags) {
    const route = tagPath(tag)
    const key = '@tag:' + tag
    if (!graph.has(key)) graph.set(key, new Set())
    graph.get(key).add(page.sourcePath)
    graph.get('tags.md')?.add(key)
    routes.set(normalizePagePath(route), key)
  }
}

function resolveTarget(page, target, wiki) {
  const path = target.split(/[?#]/, 1)[0]
  if (!path) return {}
  let decoded
  try { decoded = decodeURIComponent(path) } catch { decoded = path }
  const rootPath = decoded.startsWith('/')
  const basePath = rootPath ? resolve(DOCS_ROOT, '.' + decoded) : resolve(dirname(page.filePath), decoded)
  const rel = relative(DOCS_ROOT, basePath).replace(/\\/g, '/')
  const route = routes.get(normalizePagePath('/' + rel))
  if (route) return { page: route }
  if (wiki) {
    const matches = pages.filter((candidate) =>
      candidate.sourcePath.replace(/\.md$/, '') === decoded ||
      candidate.sourcePath.split('/').pop().replace(/\.md$/, '') === decoded
    )
    if (matches.length === 1) return { page: matches[0].sourcePath }
    if (matches.length > 1) return { error: '双向链接目标不唯一：' + target }
  }
  const candidates = [basePath]
  if (rootPath) candidates.push(resolve(DOCS_ROOT, 'public', '.' + decoded))
  if (!extname(basePath)) candidates.push(basePath + '.md', resolve(basePath, 'index.md'))
  if (basePath.endsWith('.html')) candidates.push(basePath.slice(0, -5) + '.md')
  for (const file of candidates) {
    if (existsSync(file) && statSync(file).isFile()) {
      if (file.endsWith('.md') && !files.has(file)) return { error: '目标不是站点页面：' + target }
      return { page: files.get(file) }
    }
  }
  return { error: '找不到目标：' + target }
}

for (const page of pages) {
  for (const { target, line, wiki } of collectSourceLinks(page.content, page.frontmatter)) {
    if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
    localReferenceCount++
    if (target.includes('\\')) {
      errors.push(page.sourcePath + ':' + line + ' 使用了反斜杠路径：' + target)
      continue
    }
    const resolved = resolveTarget(page, target, wiki)
    if (resolved.error) errors.push(page.sourcePath + ':' + line + ' ' + resolved.error)
    if (resolved.page) graph.get(page.sourcePath).add(resolved.page)
  }
}

const reachable = new Set()
const queue = ['index.md']
while (queue.length) {
  const current = queue.shift()
  if (reachable.has(current) || !graph.has(current)) continue
  reachable.add(current)
  queue.push(...graph.get(current))
}
for (const file of markdownSet) {
  if (!reachable.has(file)) errors.push('无法从 index.md 到达文档：' + file)
}

// Editorial navigation stays hand-written; new documents must be listed explicitly.
for (const { index, prefixes } of [
  { index: 'tech-index.md', prefixes: ['tech-', 'mcp-'] },
  { index: 'campus-index.md', prefixes: ['campus-'] }
]) {
  if (!graph.has(index)) {
    errors.push('导航页不存在：' + index)
    continue
  }
  for (const file of markdownSet) {
    if (file === index || !prefixes.some((prefix) => file.split('/').pop().startsWith(prefix))) continue
    if (!graph.get(index).has(file)) errors.push(index + ' 未收录文档：' + file)
  }
}
if (errors.length) {
  console.error('文档检查失败：\n' + errors.map((error) => '- ' + error).join('\n'))
  process.exitCode = 1
} else {
  console.log('文档检查通过：' + pages.length + ' 个页面，' + localReferenceCount + ' 个本地引用，全部可从首页到达。')
}
