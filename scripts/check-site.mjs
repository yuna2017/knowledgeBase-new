import { readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'parse5'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(projectRoot, process.argv[2] || 'vitepress-docs/.vitepress/dist')
const fallbackOrigin = 'https://built-site.invalid'
const runtimeRoutes = ['/api']

async function inventory(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await inventory(path))
    else if (entry.isFile()) files.push(relative(outputRoot, path).split(sep).join('/'))
  }
  return files
}

function walk(node, visit) {
  if (node.tagName) visit(node)
  for (const child of node.childNodes || []) walk(child, visit)
  if (node.content) walk(node.content, visit)
}

function attributes(node) {
  return Object.fromEntries((node.attrs || []).map((attr) => [
    attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name,
    attr.value
  ]))
}

// URLs are whitespace-delimited; a data URL may itself contain commas.
// Descriptors (1x, 640w) are not URLs and must not be checked as paths.
function srcsetUrls(value) {
  const urls = []
  let cursor = 0
  while (cursor < value.length) {
    while (/[\s,]/.test(value[cursor] || '') && cursor < value.length) cursor++
    const start = cursor
    while (cursor < value.length && !/\s/.test(value[cursor])) cursor++
    const token = value.slice(start, cursor)
    if (!token) break
    urls.push(token.replace(/,+$/, ''))
    if (token.endsWith(',')) continue
    let parentheses = 0
    while (cursor < value.length) {
      const char = value[cursor++]
      if (char === '(') parentheses++
      if (char === ')') parentheses--
      if (char === ',' && parentheses === 0) break
    }
  }
  return urls
}

function pagePath(file) {
  if (file === 'index.html') return '/'
  if (file.endsWith('/index.html')) return '/' + file.slice(0, -'index.html'.length)
  return '/' + file.replace(/\.html$/, '')
}

function parsePage(file, html) {
  const tree = parse(html, { sourceCodeLocationInfo: true })
  const ids = new Set()
  const references = []
  let canonical
  let baseHref
  walk(tree, (node) => {
    const attrs = attributes(node)
    if (attrs.id) ids.add(attrs.id)
    if (node.tagName === 'a' && attrs.name) ids.add(attrs.name)
    if (node.tagName === 'link' && attrs.rel?.split(/\s+/).includes('canonical')) {
      canonical = attrs.href
    }
    if (node.tagName === 'base') {
      baseHref ??= attrs.href
      return
    }
    const add = (attribute, value) => {
      if (!value?.trim()) return
      const location = node.sourceCodeLocation?.attrs?.[attribute]
      references.push({ value, line: location?.startLine || 1, attribute })
    }
    for (const attr of ['href', 'xlink:href', 'src', 'poster']) add(attr, attrs[attr])
    if (node.tagName === 'form') add('action', attrs.action)
    if (node.tagName === 'object') add('data', attrs.data)
    for (const attr of ['srcset', 'imagesrcset']) {
      for (const url of srcsetUrls(attrs[attr] || '')) add(attr, url)
    }
  })

  // The generated canonical supplies the deployment origin; no production
  // hostname is duplicated in this checker. Relative URLs follow clean URLs.
  let documentUrl = new URL(pagePath(file), fallbackOrigin)
  if (canonical) documentUrl = new URL(canonical, documentUrl)
  const baseUrl = baseHref ? new URL(baseHref, documentUrl) : documentUrl
  return { ids, references, documentUrl, baseUrl }
}

function findTarget(pathname, files) {
  const path = pathname.replace(/^\/+/, '')
  const candidates = pathname.endsWith('/')
    ? [path + 'index.html']
    : [path, path + '.html', path + '/index.html']
  return candidates.find((candidate) => files.has(candidate))
}

async function main() {
  const files = new Set(await inventory(outputRoot))
  const htmlFiles = [...files].filter((file) => file.endsWith('.html')).sort()
  if (!htmlFiles.length) throw new Error('构建目录里没有 HTML，请先运行 npm run build。')

  const pages = new Map()
  for (const file of htmlFiles) {
    pages.set(file, parsePage(file, await readFile(resolve(outputRoot, file), 'utf8')))
  }

  const errors = new Map()
  let checked = 0
  let anchors = 0
  const fail = (source, ref, reason) => {
    const key = `${source}\0${ref.value}\0${reason}`
    errors.set(key, `${source}:${ref.line} ${ref.attribute}="${ref.value}" — ${reason}`)
  }

  for (const [source, page] of pages) {
    for (const ref of page.references) {
      let url
      let pathname
      try {
        url = new URL(ref.value, page.baseUrl)
        if (!['http:', 'https:'].includes(url.protocol)) continue
        if (url.origin !== page.documentUrl.origin) continue
        pathname = decodeURIComponent(url.pathname)
      } catch {
        fail(source, ref, 'URL 编码无效')
        continue
      }
      if (runtimeRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
        continue
      }

      checked++
      const target = findTarget(pathname, files)
      if (!target) {
        fail(source, ref, '目标页面或资源不存在')
        continue
      }
      if (!url.hash || !pages.has(target)) continue
      let anchor
      try {
        // Text fragments can point at arbitrary rendered text without an id.
        anchor = decodeURIComponent(url.hash.slice(1).split(':~:text=')[0])
      } catch {
        fail(source, ref, '锚点编码无效')
        continue
      }
      if (!anchor || anchor.toLowerCase() === 'top') continue
      anchors++
      if (!pages.get(target).ids.has(anchor)) {
        fail(source, ref, `目标 ${target} 中没有锚点 #${anchor}`)
      }
    }
  }

  if (errors.size) {
    console.error(`构建产物检查失败：${errors.size} 处问题。`)
    for (const error of errors.values()) console.error('  ' + error)
    process.exitCode = 1
  } else {
    console.log(`构建产物检查通过：${pages.size} 个 HTML，${checked} 个站内引用，${anchors} 个锚点。`)
  }
}

main().catch((error) => {
  console.error(`构建产物检查失败：${error.message}`)
  process.exitCode = 1
})
