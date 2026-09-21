/**
 * 页面分类。
 *
 * 站点里有四类页面，很多地方需要区别对待，集中定义在这里避免各处判断不一致：
 *
 * - 聚合页：/tags、/tags/*、/recent。它们是入口而不是内容，
 *   没有作者、标签和新鲜度可言，也不该统计阅读次数。
 * - 板块导航页：/tech-index、/campus-index。手写的入口页，
 *   有作者、标签和校准时间（这些照常显示），但同样不是知识库文章，
 *   不统计阅读量，也不进「最高阅读」和「随便看看」。
 *   导航页流量天然偏高，混进排行会把首页最显眼的位置让给入口页。
 * - 项目维护文档：仓库说明、贡献指南、内容规范，以及 /wanted 系列
 *   （反馈收集、提交成功、公开状态、审计）。是真实页面，
 *   但不是面向读者的知识库文章，不该混进「最高阅读」排行。
 * - 其余即为知识库文章。
 */

/** 聚合入口页（不含 /tags/ 下的动态子页，那个用前缀判断） */
const AGGREGATE_PATHS = new Set(['/tags', '/recent'])

/**
 * 各板块的手写导航页。
 * 新增板块导航页时要加到这里，否则它会开始被计入阅读量，
 * 并可能挤进首页「最高阅读」的三个位置。
 */
const NAVIGATION_PATHS = new Set(['/tech-index', '/campus-index'])

/**
 * 面向维护者而非读者的文档。
 *
 * /wanted 系列（反馈收集、提交成功、公开状态、审计）都归在这里：
 * 它们是功能页而不是知识库文章，不该进「最高阅读」和「随便看看」。
 * 其中 /wanted-audit 还额外被 Google 等排除（frontmatter 里 noindex）。
 *
 * 注意这里只影响「计数 / 排行 / 抽取池」三件事：这些页面依然会显示
 * 作者、标签和校准时间（与 /CONTRIBUTING 一致）。
 */
const MAINTENANCE_PATHS = new Set([
  '/README',
  '/CONTRIBUTING',
  '/CONTEXT',
  '/wanted',
  '/wanted-done',
  '/wanted-status',
  '/wanted-audit'
])

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
 * 是否为「知识库文章」——决定了三件事：计不计阅读量、进不进「最高阅读」、
 * 进不进「随便看看」的抽取池。
 *
 * 首页、聚合页、板块导航页和项目维护文档都排除在外。
 *
 * 注意导航页**不走** isAggregatePage：它们有作者、标签和校准时间，
 * 这些照常显示，只是不参与统计与推荐。
 */
export function isRankableArticle(value: string): boolean {
  const path = normalize(value)
  return (
    path !== '/' &&
    !isAggregatePage(path) &&
    !NAVIGATION_PATHS.has(path) &&
    !MAINTENANCE_PATHS.has(path)
  )
}
