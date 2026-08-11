import {
  existsSync,
  readdirSync,
  statSync
} from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = resolve(projectRoot, 'vitepress-docs')
const ignoredDirectories = new Set(['.vitepress', 'node_modules'])

function walkMarkdown(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const fullPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // 跳过 VitePress 动态路由模板（如 tags/[tag].md）：
      // 它不是一个真实页面，实际路由由同名的 .paths.ts 在构建时生成
      if (entry.name.includes('[')) continue
      files.push(fullPath)
    }
  }
  return files
}

function posixRelative(path) {
  return relative(docsRoot, path).split(sep).join('/')
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function resolveLocalTarget(sourceFile, rawTarget) {
  const withoutFragment = rawTarget.split('#', 1)[0].split('?', 1)[0]
  if (!withoutFragment) return null

  let decoded
  try {
    decoded = decodeURIComponent(withoutFragment)
  } catch {
    decoded = withoutFragment
  }

  const isRootPath = decoded.startsWith('/')
  const routePath = decoded.replace(/^\/+/, '')
  const basePath = isRootPath
    ? resolve(docsRoot, routePath)
    : resolve(dirname(sourceFile), decoded)
  const extension = extname(basePath)
  const candidates = []

  if (!routePath && isRootPath) {
    candidates.push(resolve(docsRoot, 'index.md'))
  } else if (decoded.endsWith('/')) {
    candidates.push(resolve(basePath, 'index.md'))
  } else if (!extension) {
    candidates.push(basePath + '.md', resolve(basePath, 'index.md'))
  } else if (extension === '.html') {
    candidates.push(basePath.slice(0, -5) + '.md')
  } else {
    candidates.push(basePath)
  }

  if (isRootPath) {
    candidates.push(resolve(docsRoot, 'public', routePath))
  }

  return candidates.find((candidate) => {
    return existsSync(candidate) && statSync(candidate).isFile()
  }) || null
}

const markdownFiles = walkMarkdown(docsRoot)
const markdownSet = new Set(markdownFiles.map(posixRelative))
const graph = new Map(markdownFiles.map((file) => [posixRelative(file), new Set()]))
const taggedFiles = new Set()
const errors = []
let localReferenceCount = 0

for (const sourceFile of markdownFiles) {
  const sourceName = posixRelative(sourceFile)
  const text = await import('node:fs/promises').then(({ readFile }) => {
    return readFile(sourceFile, 'utf8')
  })
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatter && /^tags:\s*$/m.test(frontmatter[1])) {
    taggedFiles.add(sourceName)
  }
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1].replace(/^<|>$/g, '')
    if (
      rawTarget.startsWith('#') ||
      rawTarget.startsWith('//') ||
      /^[a-z][a-z\d+.-]*:/i.test(rawTarget)
    ) {
      continue
    }

    localReferenceCount += 1
    if (rawTarget.includes('\\')) {
      errors.push(
        sourceName + ':' + lineNumber(text, match.index) +
        ' 使用了反斜杠路径：' + rawTarget
      )
      continue
    }

    const resolvedTarget = resolveLocalTarget(sourceFile, rawTarget)
    if (!resolvedTarget) {
      errors.push(
        sourceName + ':' + lineNumber(text, match.index) +
        ' 找不到目标：' + rawTarget
      )
      continue
    }

    if (resolvedTarget.endsWith('.md')) {
      const targetName = posixRelative(resolvedTarget)
      if (markdownSet.has(targetName)) {
        graph.get(sourceName).add(targetName)
      }
    }
  }
}

if (graph.has('tags.md')) {
  for (const file of taggedFiles) graph.get('tags.md').add(file)
}

const reachable = new Set()
const queue = ['index.md']
while (queue.length > 0) {
  const current = queue.shift()
  if (reachable.has(current) || !graph.has(current)) continue
  reachable.add(current)
  for (const target of graph.get(current)) queue.push(target)
}

for (const file of markdownSet) {
  if (!reachable.has(file)) {
    errors.push('无法从 index.md 到达文档：' + file)
  }
}

/*
 * 导航页收录完整性检查。
 *
 * tech-index.md 是手写的技术资源导航，它的分组和一句话介绍是编辑判断，
 * 自动生成的标签页替代不了。但手写清单会随着新文档的加入悄悄漂移——
 * 加过一次检查之前，已经有 4 篇文档没被收录。
 *
 * 这里把「漏收」从看不见的偏差变成构建失败：新增 tech-* / mcp-* 文档时，
 * 必须同时在导航页里加一条，否则 PR 检查和部署都不会通过。
 */
const NAVIGATION_INDEXES = [
  {
    index: 'tech-index.md',
    // 该导航页负责收录哪些文档，按文件名前缀判断
    prefixes: ['tech-', 'mcp-']
  }
]

for (const { index, prefixes } of NAVIGATION_INDEXES) {
  if (!graph.has(index)) {
    errors.push('导航页不存在：' + index)
    continue
  }

  const listed = graph.get(index)
  const shouldList = [...markdownSet].filter((file) => {
    return (
      file !== index &&
      !file.includes('/') &&
      prefixes.some((prefix) => file.startsWith(prefix))
    )
  })

  for (const file of shouldList.sort()) {
    if (!listed.has(file)) {
      errors.push(
        index + ' 未收录文档：' + file +
        '（新增文档后请同步在该导航页中补一条链接）'
      )
    }
  }
}

if (errors.length > 0) {
  console.error('文档检查失败：')
  for (const error of errors) console.error('- ' + error)
  process.exit(1)
}

console.log(
  '文档检查通过：' + markdownFiles.length +
  ' 个页面，' + localReferenceCount + ' 个本地引用，全部可从首页到达。'
)
