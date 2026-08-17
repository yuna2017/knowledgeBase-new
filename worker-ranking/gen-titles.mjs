#!/usr/bin/env node
/**
 * 从 vitepress-docs 生成排行 Worker 的文章清单（src/page-titles.json）。
 *
 * 排除规则与站点 page-kind.ts 保持一致：
 * 首页、聚合页（/tags、/recent）、维护文档（/README、/CONTRIBUTING、/CONTEXT）不计入。
 *
 * 每篇附带仓库里最后一次提交时间（date），排行页面用于展示修订时间。
 *
 * 自动更新：CI 在每次推送到 main 时自动运行本脚本并重新部署 Worker，
 * 平时无需手动执行；本地预览时可直接运行：node gen-titles.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)))
const repoRoot = resolve(projectRoot, '..')
const docsRoot = resolve(projectRoot, '..', 'vitepress-docs')
const SITE_URL = 'https://docs.yuna.team'

const AGGREGATE_PATHS = new Set(['/tags', '/recent'])
const MAINTENANCE_PATHS = new Set(['/README', '/CONTRIBUTING', '/CONTEXT'])
const FALLBACK_TITLES = {
  index: '首页',
  tags: '标签',
  recent: '最近更新',
}

function walkMarkdown(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.vitepress') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkMarkdown(full))
    else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('[')) {
      files.push(full)
    }
  }
  return files
}

/** 文件路径 → 站点 URL（cleanUrls：去 .md，index.md 对应根路径） */
function pageUrlOf(rel) {
  const path = rel.replace(/\.md$/, '').replace(/\\/g, '/')
  return path === 'index' ? '/' : '/' + path
}

/** 是否纳入排行：首页、聚合页、维护文档都不算知识库文章 */
function isRankable(page) {
  return (
    page !== '/' &&
    !AGGREGATE_PATHS.has(page) &&
    !page.startsWith('/tags/') &&
    !MAINTENANCE_PATHS.has(page)
  )
}

function titleOf(file, rel) {
  const text = readFileSync(file, 'utf8')
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (frontmatter) {
    const title = frontmatter[1].match(/^title:\s*(.+?)\s*$/m)
    if (title) return title[1].replace(/^['"]|['"]$/g, '')
  }
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const heading = body.match(/^#\s+(.+?)\s*$/m)
  if (heading) return heading[1].trim()
  const base = rel.split(/[\\/]/).pop().replace(/\.md$/, '')
  return FALLBACK_TITLES[base] || base
}

/** 文件在仓库里的最后一次提交时间（ISO）；git 不可用时返回空串 */
function lastCommitDate(file) {
  try {
    return execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', file],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
  } catch {
    return ''
  }
}

const pages = walkMarkdown(docsRoot)
  .map((file) => {
    const rel = relative(docsRoot, file)
    const page = pageUrlOf(rel)
    return { page, title: titleOf(file, rel), url: SITE_URL + page, date: lastCommitDate(relative(repoRoot, file)) }
  })
  .filter((item) => isRankable(item.page))
  .sort((a, b) => a.page.localeCompare(b.page))

const target = join(projectRoot, 'src', 'page-titles.json')
writeFileSync(target, JSON.stringify(pages, null, 2) + '\n', 'utf8')
console.log(`已生成 ${target}：${pages.length} 篇文章`)
