import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import matter from 'gray-matter'

export function stripInline(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_match, target, label) => label || target)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text, limit = 150) {
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text
}

/** Expand existing whole-file includes; reject cycles instead of silently truncating them. */
export function expandIncludes(content, file, ancestors = new Set([resolve(file)])) {
  return content.replace(/<!--\s*@include:\s*(.+?)\s*-->/g, (_match, target) => {
    const included = resolve(dirname(file), target.split('{')[0].trim())
    if (ancestors.has(included)) throw new Error(`Markdown include 循环：${included}`)
    const next = new Set(ancestors).add(included)
    return expandIncludes(matter(readFileSync(included, 'utf8')).content, included, next)
  })
}

export function readMarkdown(file) {
  return expandIncludes(matter(readFileSync(file, 'utf8')).content, file)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/^```[\s\S]*?^```/gm, '')
}

export function extractDescription(srcDir, relativePath, limit = 150) {
  const body = readMarkdown(join(srcDir, relativePath))
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block.trim()
    if (!trimmed || /^[#|<]/.test(trimmed)) continue
    const text = /^\s*(?:[-*+]|\d+\.)\s/.test(trimmed)
      ? trimmed.split(/\r?\n/)
        .map((line) => stripInline(line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')))
        .filter((line) => line.length >= 4).join('；')
      : stripInline(trimmed.replace(/^>\s?/gm, ''))
    if (text.length >= 10) return truncate(text, limit)
  }
  return ''
}
