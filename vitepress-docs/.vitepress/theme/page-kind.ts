/**
 * 页面分类。
 *
 * 站点里有三类页面，很多地方需要区别对待，集中定义在这里避免各处判断不一致：
 *
 * - 聚合页：/tags、/tags/*、/recent。它们是入口而不是内容，
 *   没有作者、标签和新鲜度可言，也不该统计阅读次数。
 * - 项目维护文档：仓库说明、贡献指南、内容规范。是真实页面，
 *   但不是面向读者的知识库文章，不该混进「最高阅读」排行。
 * - 其余即为知识库文章。
 */

/** 聚合入口页（不含 /tags/ 下的动态子页，那个用前缀判断） */
const AGGREGATE_PATHS = new Set(['/tags', '/recent'])

/** 面向维护者而非读者的文档 */
const MAINTENANCE_PATHS = new Set(['/README', '/CONTRIBUTING', '/CONTEXT'])

/** 把站内地址或源文件路径统一成 `/xxx` 形式，便于比对 */
function normalize(value: string): string {
  const path = value
    .replace(/\.md$/, '')
    .replace(/\.html$/, '')
    .replace(/\/index$/, '/')
  const withSlash = path.startsWith('/') ? path : '/' + path
  return withSlash.length > 1 ? withSlash.replace(/\/$/, '') : '/'
}

/** 聚合入口页：不显示标签、作者、新鲜度，也不统计阅读次数 */
export function isAggregatePage(value: string): boolean {
  const path = normalize(value)
  return AGGREGATE_PATHS.has(path) || path.startsWith('/tags/')
}

/**
 * 是否为可进入「最高阅读」排行的知识库文章。
 * 首页、聚合页和项目维护文档都排除在外。
 */
export function isRankableArticle(value: string): boolean {
  const path = normalize(value)
  return path !== '/' && !isAggregatePage(path) && !MAINTENANCE_PATHS.has(path)
}
