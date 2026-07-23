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

if (errors.length > 0) {
  console.error('文档检查失败：')
  for (const error of errors) console.error('- ' + error)
  process.exit(1)
}

console.log(
  '文档检查通过：' + markdownFiles.length +
  ' 个页面，' + localReferenceCount + ' 个本地引用，全部可从首页到达。'
)
