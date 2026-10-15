import type MarkdownIt from 'markdown-it'
import { loadDocuments } from '../../../shared/documents/catalog.mjs'
import { normalizePagePath } from '../../../shared/documents/page-kind.mjs'

/**
 * 把授课分类页里的讲义清单渲染成卡片。
 *
 * 清单本身仍然写在 Markdown 里（见 CONTRIBUTING 的「授课讲义」一节）：
 *
 *   - [Git 与 GitHub 入门](/lessons/ops/git-github)
 *
 * 这里在构建时把它换成和标签页同一种卡片：标题、摘要、最后修订时间。
 * 摘要和时间取自文档目录，所以清单里不用手写这两项，也不会和文档本身对不上。
 *
 * 为什么用 markdown-it 规则，而不是像标签页那样写个 Vue 组件配 data loader：
 * 分类页的清单必须留在 Markdown 源码里。scripts/check-docs.mjs 是靠**源码里的链接**
 * 判断「每篇文档都能从首页走到」的，清单换成组件渲染就没有链接可查了，
 * 新讲义漏收录时构建不再报错——那是这套检查里最该保住的告警。
 *
 * 只有同时满足下面两条的清单会被替换，其余一律保持原样：
 *   1. 页面是五个授课分类页之一（讲义清单只写在这五个页面上）；
 *   2. 每一项都恰好是一条链接，没有附加文字、多个链接或嵌套清单。
 * 条件不满足时输出普通列表：宁可显示成一串链接，也不要渲染出半截卡片。
 *
 * 另外只看最外层的清单。清单里再嵌一层清单时，外层已经退回普通列表了，
 * 内层若单独换成卡片，卡片网格会嵌进 <li> 里，排版是坏的。
 */
const DEPARTMENT_PAGE = /^lessons\/(?:dev|security|ops|publicity|public)\.md$/

/** 与标签页卡片显示同一种日期（标签页在客户端格式化，这里在构建时格式化） */
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai'
})

/** 只用到这几个成员，不深引 markdown-it 的类型文件 */
interface MarkdownToken {
  type: string
  content: string
  map: [number, number] | null
  children: MarkdownToken[] | null
  attrGet(name: string): string | null
}

interface CoreState {
  env: { relativePath?: string }
  tokens: MarkdownToken[]
  Token: new (type: string, tag: string, nesting: number) => MarkdownToken
}

interface LessonDocument {
  description: string
  lastModified: string
}

/**
 * 讲义路径 → 摘要与最后修订时间。
 *
 * 构建期间只读一次目录：每次渲染都重读的话，五十多个页面会各走一遍 git log。
 * 代价是本地 dev 下改讲义自己的 description 要重启才反映到卡片上
 * （卡片标题来自清单本身，编辑清单是即时生效的）。
 */
let documents: Map<string, LessonDocument> | undefined

function lessonDocuments(): Map<string, LessonDocument> {
  documents ??= new Map(loadDocuments().map((page) => [
    normalizePagePath(page.url),
    { description: page.description, lastModified: page.lastModified }
  ]))
  return documents
}

/** 与 tokens[open] 配对的列表结束位置；嵌套列表一并算进这一段。 */
function listEnd(tokens: MarkdownToken[], open: number): number {
  let depth = 0
  for (let index = open; index < tokens.length; index += 1) {
    const { type } = tokens[index]
    if (type === 'bullet_list_open' || type === 'ordered_list_open') depth += 1
    else if (type === 'bullet_list_close' || type === 'ordered_list_close') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * 取出清单里的链接，顺序即清单顺序（课次先后由写清单的人决定）。
 * 只要有一项不是「一条链接」，就返回 null，让整条清单保持普通列表。
 */
function lessonLinks(items: MarkdownToken[]): Array<{ title: string; href: string }> | null {
  const links: Array<{ title: string; href: string }> = []
  let index = 0
  while (index < items.length) {
    const [open, paragraph, inline, paragraphClose, close] = items.slice(index, index + 5)
    if (
      open?.type !== 'list_item_open' ||
      paragraph?.type !== 'paragraph_open' ||
      inline?.type !== 'inline' ||
      paragraphClose?.type !== 'paragraph_close' ||
      close?.type !== 'list_item_close'
    ) return null

    const children = inline.children ?? []
    const inner = children.slice(1, -1)
    const href = children[0]?.type === 'link_open' && children.at(-1)?.type === 'link_close'
      ? children[0].attrGet('href')
      : null
    // 链接里面只能有文字和加粗这类行内标记。中间再出现一条链接或图片的话，
    // 它们不会进卡片，链接就被悄悄丢掉了——这种情况整条清单退回普通列表，
    // 宁可不好看，也不能让链接从页面上消失。
    const extra = inner.some((child) =>
      child.type === 'link_open' || child.type === 'link_close' || child.type === 'image'
    )
    // 标题取链接文字（可以写得比文档标题短），行内标记只留文字
    const title = inner.map((child) => child.content ?? '').join('').trim()
    if (!href || extra || !title) return null

    links.push({ title, href })
    index += 5
  }
  return links.length ? links : null
}

function cardsHtml(links: Array<{ title: string; href: string }>, md: MarkdownIt): string {
  const { escapeHtml } = md.utils
  const catalog = lessonDocuments()

  const cards = links.map(({ title, href }) => {
    // 站外讲义（例如官网文章）在目录里查不到，卡片就只显示标题
    const document = catalog.get(normalizePagePath(href))
    const description = document?.description ?? ''
    const date = document?.lastModified ? new Date(document.lastModified) : null
    const stamp = date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : ''

    return [
      `<a class="lesson-card" href="${escapeHtml(href)}">`,
      `<span class="lesson-card__title">${escapeHtml(title)}</span>`,
      description ? `<p class="lesson-card__desc">${escapeHtml(description)}</p>` : '',
      stamp
        ? `<time class="lesson-card__date" datetime="${escapeHtml(document!.lastModified)}">${escapeHtml(stamp)}</time>`
        : '',
      '</a>'
    ].join('')
  })

  return '<div class="lesson-grid">' + cards.join('') + '</div>'
}

export function LessonCards(md: MarkdownIt): void {
  md.core.ruler.push('lesson_cards', (state: CoreState) => {
    const relativePath = String(state.env.relativePath ?? '').replace(/\\/g, '/')
    if (!DEPARTMENT_PAGE.test(relativePath)) return

    // depth 只在最外层清单上做替换。清单没换成卡片时把 depth 记成 1，
    // 它里面嵌的清单就跟外层一起保持普通列表，不会单独变成卡片。
    let depth = 0
    for (let index = 0; index < state.tokens.length; index += 1) {
      const { type } = state.tokens[index]
      if (type === 'bullet_list_close' || type === 'ordered_list_close') {
        depth = Math.max(0, depth - 1)
        continue
      }
      if (type !== 'bullet_list_open' && type !== 'ordered_list_open') continue

      if (depth > 0) {
        depth += 1
        continue
      }

      const end = listEnd(state.tokens, index)
      if (end < 0) continue
      const links = lessonLinks(state.tokens.slice(index + 1, end))
      if (!links) {
        depth = 1
        continue
      }

      const block = new state.Token('html_block', '', 0)
      block.content = cardsHtml(links, md)
      block.map = state.tokens[index].map
      state.tokens.splice(index, end - index + 1, block)
    }
  })
}
