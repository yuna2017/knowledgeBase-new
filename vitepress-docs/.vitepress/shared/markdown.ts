import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** 去掉行内 Markdown 语法，只留纯文字。 */
export function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')    // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_m, target, label) => label || target) // 双向链接
    .replace(/`([^`]*)`/g, '$1')             // 行内代码
    .replace(/[*_~]/g, '')                   // 强调符号
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, limit = 150): string {
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text
}

/** 读取 Markdown 源文件，并展开 VitePress 的 <!--@include: xxx--> 引入。 */
export function readMarkdown(file: string, depth = 0): string {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return ''
  }

  raw = raw
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')      // frontmatter
    .replace(/<script[\s\S]*?<\/script>/gi, '')          // Vue <script setup>
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/^```[\s\S]*?^```/gm, '')                   // 围栏代码块
  if (depth >= 2) return raw

  // CONTRIBUTING.md 这类页面整篇都是一条 include，不展开就取不到任何描述
  return raw.replace(/<!--\s*@include:\s*(.+?)\s*-->/g, (_match, target: string) => {
    return readMarkdown(resolve(dirname(file), target.split('{')[0].trim()), depth + 1)
  })
}

/**
 * 从 Markdown 正文里取第一段可读文字作为摘要。
 *
 * 这样不必给每篇文章手写 description，也不会让所有页面共用同一句站点简介。
 * 段落和列表按文档顺序取先出现的那个——不少页面（如 tech-mooc）标题之后直接就是列表。
 *
 * 同时供两处使用：config.mts 生成 <meta description>，标签页生成文档摘要。
 */
export function extractDescription(
  srcDir: string,
  relativePath: string,
  limit = 150
): string {
  const body = readMarkdown(join(srcDir, relativePath))

  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.trim()
    // 跳过标题、表格和原始 HTML
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('<')
    ) {
      continue
    }

    let text: string
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(trimmed)) {
      text = trimmed
        .split(/\r?\n/)
        .map((line) => stripInline(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')))
        .filter((line) => line.length >= 4)
        .join('；')
    } else {
      text = stripInline(trimmed.replace(/^>\s?/gm, ''))
    }

    if (text.length >= 10) return truncate(text, limit)
  }

  return ''
}
