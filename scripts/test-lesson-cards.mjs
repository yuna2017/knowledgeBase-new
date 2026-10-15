import assert from 'node:assert/strict'
import { test } from 'node:test'
import MarkdownIt from 'markdown-it'
import { LessonCards } from '../vitepress-docs/.vitepress/shared/lesson-cards.ts'

/**
 * 授课分类页的讲义卡片是构建时从 Markdown 清单换出来的（见 shared/lesson-cards.ts）。
 * 这里盯住三件事：该换的地方换成卡片、顺序跟着清单走、换不了的地方原样保留。
 *
 * 换不了就退回普通列表是刻意的：清单同时是 check-docs 判断「文档能否从首页走到」
 * 的依据，宁可显示成一串链接，也不能因为渲染成卡片而把链接弄丢或让检查失效。
 */
const md = new MarkdownIt({ html: true })
md.use(LessonCards)

const render = (source, relativePath = 'lessons/ops.md') => md.render(source, { relativePath })

test('分类页的链接清单渲染成卡片，标题取自链接文字', () => {
  const html = render([
    '- [短标题](/lessons/ops/git-github)',
    '- [**加粗的**第二讲](/lessons/ops/package-manager)',
    ''
  ].join('\n'))

  assert.match(html, /<div class="lesson-grid">/)
  assert.equal((html.match(/class="lesson-card"/g) ?? []).length, 2)
  assert.match(html, /class="lesson-card__title">短标题</)
  // 标题用清单里写的文字，不是文档自己的标题——清单里能写更短的课次名
  assert.ok(!html.includes('Git 与 GitHub 入门'), '标题不该被文档标题顶掉')
  // 加粗这类行内标记只留文字
  assert.match(html, /class="lesson-card__title">加粗的第二讲</)
  // 顺序跟清单一致，不按日期或标题重排
  assert.ok(html.indexOf('短标题') < html.indexOf('加粗的第二讲'))
  assert.match(html, /href="\/lessons\/ops\/package-manager"/)
})

test('站内讲义补上摘要，站外链接只显示标题', () => {
  const internal = render('- [Git 与 GitHub 入门](/lessons/ops/git-github)\n')
  assert.match(internal, /class="lesson-card__desc">/)

  const external = render('- [官网讲义](https://www.yuna.team/post?slug=abc)\n')
  assert.match(external, /class="lesson-card__title">官网讲义</)
  assert.ok(
    !external.includes('lesson-card__desc'),
    '目录里查不到的站外链接不该凭空长出摘要'
  )
})

test('只在五个授课分类页生效，Windows 路径分隔符也认得', () => {
  const source = '- [X](/lessons/ops/git-github)\n'
  for (const page of ['tech-index.md', 'index.md', 'lessons/ops/git-github.md', 'tags/[tag].md']) {
    assert.match(render(source, page), /^<ul>/, page)
  }
  assert.match(render(source, 'lessons\\ops.md'), /lesson-card/)
})

test('清单里有卡片表达不了的内容时，整条清单保持普通列表', () => {
  const cases = {
    '同一行补了备注': '- [X](/lessons/ops/git-github)（第 1 讲）',
    '一项里两条链接': '- [X](/lessons/ops/git-github) / [Y](/lessons/ops/package-manager)',
    '一项里两段': '- 第一段\n\n  第二段',
    '嵌套清单': '- [X](/lessons/ops/git-github)\n  - [Y](/lessons/ops/package-manager)',
    '光有链接没有文字': '- [](/lessons/ops/git-github)'
  }
  for (const [name, source] of Object.entries(cases)) {
    const html = render(source + '\n')
    assert.match(html, /<ul>/, name)
    assert.ok(!html.includes('lesson-card'), name)
  }
})

test('页面里没有清单时什么也不做', () => {
  assert.ok(!render('# 开发部（暂无内容）\n').includes('lesson-grid'))
})
