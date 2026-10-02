#!/usr/bin/env node
/** Generate the ranking inventory from the site's shared document catalog. */
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDocuments, REPO_ROOT } from '../shared/documents/catalog.mjs'
import { isRankableArticle } from '../shared/documents/page-kind.mjs'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const SITE_URL = 'https://docs.yuna.team'

function firstCommitDate(file) {
  try {
    return execFileSync('git', ['log', '--follow', '--reverse', '--format=%cI', '--', file], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim().split(/\r?\n/)[0] || ''
  } catch {
    return ''
  }
}

const pages = loadDocuments({ includeGit: false })
  .filter((page) => isRankableArticle(page.url))
  .map((page) => ({
    page: page.url,
    title: page.title,
    url: SITE_URL + page.url,
    date: firstCommitDate(page.repositoryPath)
  }))
  .sort((left, right) => left.page.localeCompare(right.page))

const target = join(projectRoot, 'src', 'page-titles.json')
writeFileSync(target, JSON.stringify(pages, null, 2) + '\n', 'utf8')
console.log(`已生成 ${target}：${pages.length} 篇文章`)
