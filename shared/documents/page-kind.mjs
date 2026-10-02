/** Browser-safe page identity and classification, shared by the site and build tools. */
const AGGREGATE_PATHS = new Set(['/tags', '/recent'])
const NAVIGATION_PATHS = new Set(['/tech-index', '/campus-index'])
const MAINTENANCE_PATHS = new Set(['/README', '/CONTRIBUTING', '/CONTEXT'])
const FUNCTION_PATHS = new Set(['/wanted', '/wanted-done', '/wanted-status', '/wanted-audit'])

export function sourcePathToUrl(sourcePath) {
  const path = String(sourcePath).replace(/\\/g, '/').replace(/^\/+/, '')
  return '/' + path.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
}

export function normalizePagePath(value) {
  let path = String(value).replace(/\\/g, '/').split(/[?#]/, 1)[0]
  try { path = decodeURIComponent(path) } catch { /* Keep malformed input comparable. */ }
  path = path.replace(/\.(?:md|html)$/, '').replace(/(^|\/)index$/, '$1')
  return ('/' + path.replace(/^\/+|\/+$/g, '')) || '/'
}

export function getPageKind(value) {
  const path = normalizePagePath(value)
  if (path === '/') return 'home'
  if (AGGREGATE_PATHS.has(path) || path.startsWith('/tags/')) return 'aggregate'
  if (NAVIGATION_PATHS.has(path)) return 'navigation'
  if (FUNCTION_PATHS.has(path)) return 'function'
  if (MAINTENANCE_PATHS.has(path)) return 'maintenance'
  return 'article'
}

export function isAggregatePage(value) {
  return getPageKind(value) === 'aggregate'
}

export function isRankableArticle(value) {
  return getPageKind(value) === 'article'
}

export function isNoindex(frontmatter = {}) {
  return Array.isArray(frontmatter.head) && frontmatter.head.some((tag) =>
    Array.isArray(tag) && tag[0] === 'meta' &&
    String(tag[1]?.name).toLowerCase() === 'robots' &&
    /(?:^|[\s,])noindex(?:$|[\s,])/i.test(String(tag[1]?.content ?? ''))
  )
}

export function isSearchablePage(value, frontmatter = {}) {
  return getPageKind(value) !== 'function' && frontmatter.search !== false && !isNoindex(frontmatter)
}
