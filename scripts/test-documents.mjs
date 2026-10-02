import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDocuments } from '../shared/documents/catalog.mjs'
import { parseFrontmatter } from '../shared/documents/frontmatter.mjs'
import { collectSourceLinks } from '../shared/documents/links.mjs'
import { getPageKind, isSearchablePage, isRankableArticle, sourcePathToUrl } from '../shared/documents/page-kind.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fixture(run) {
  const base = resolve(tmpdir())
  const directory = mkdtempSync(join(base, 'yuna-documents-'))
  const write = (path, content) => {
    const file = join(directory, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  try { return run(directory, write) } finally {
    // Only remove the exact temporary fixture created by this test.
    assert.equal(dirname(resolve(directory)), base)
    assert.ok(directory.startsWith(join(base, 'yuna-documents-')))
    rmSync(directory, { recursive: true, force: true })
  }
}

test('YAML comments, quotes and folded values have one interpretation', () => {
  const page = parseFrontmatter(`---
tags: [AI, "Tools, SDK"] # a valid YAML comment
pinned: "1"
title: "A: title"
description: >-
  First line
  second line
---
# Body title`)
  assert.deepEqual(page.tags, ['AI', 'Tools, SDK'])
  assert.equal(page.pinned, 1)
  assert.equal(page.frontmatter.title, 'A: title')
  assert.equal(page.frontmatter.description, 'First line second line')
  assert.deepEqual(parseFrontmatter('---\ntags:\n  - AI # comment\n---\n').tags, ['AI'])
  assert.deepEqual(parseFrontmatter('---\ntags: "AI, Tools"\n---\n').tags, ['AI, Tools'])
  for (const pinned of ['1 # comment', '"1"', 'true']) {
    assert.equal(parseFrontmatter('---\npinned: ' + pinned + '\n---\n').pinned, 1)
  }
  assert.equal(parseFrontmatter('---\npinned: false\n---\n').pinned, undefined)
  for (const yaml of ['pinned: 0', 'pinned: nonsense', 'tags: [AI, 42]', 'title: [invalid]']) {
    assert.throws(() => parseFrontmatter('---\n' + yaml + '\n---\n', 'bad.md'), /bad\.md/)
  }
})

test('nested documents retain their source identity and index URLs; snippets are not pages', () => fixture((directory, write) => {
  write('index.md', '# Home')
  write('guide/index.md', '---\n# not the title\ntags: [Guides]\n---\n# Guide')
  write('guide/child.md', '# Child\n\n<!--@include: ../_partials/body.md-->')
  write('_partials/body.md', 'This is an included description with enough text.')
  write('snippets/example.md', '# Example')
  write('tags/[tag].md', '# Template')
  const pages = loadDocuments({ docsRoot: directory, repoRoot: directory, includeGit: false })
  assert.equal(pages.length, 3)
  const page = pages.find((item) => item.sourcePath === 'guide/index.md')
  assert.equal(page.url, '/guide/')
  assert.equal(page.title, 'Guide')
  assert.equal(page.repositoryPath, 'guide/index.md')
  assert.match(pages.find((item) => item.sourcePath === 'guide/child.md').description, /^This is an included/)
  assert.equal(sourcePathToUrl('guide\\index.md'), '/guide/')
  write('guide.md', '# Collision')
  assert.throws(() => loadDocuments({ docsRoot: directory, includeGit: false }), /文档路由冲突/)
}))

test('ambiguous or unsafe tag routes fail before a broken site can be generated', () => fixture((directory, write) => {
  write('index.md', '# Home')
  write('one.md', '---\ntags: [Vibe Coding, Vibe-Coding]\n---\n# One')
  assert.throws(() => loadDocuments({ docsRoot: directory, includeGit: false }), /标签路由冲突/)
  write('one.md', '---\ntags: ["AI#Tools"]\n---\n# One')
  assert.throws(() => loadDocuments({ docsRoot: directory, includeGit: false }), /路径字符/)
}))

test('site and ranking share classification; function pages and explicit noindex stay out of search', () => {
  for (const path of ['/', '/tags/校园网', '/campus-index', '/tech-index', '/wanted-audit', '/README']) {
    assert.equal(isRankableArticle(path), false, path)
  }
  assert.equal(isRankableArticle('/guide/index.md'), true)
  assert.equal(getPageKind('/wanted.html?x=1'), 'function')
  assert.equal(isSearchablePage('/wanted-done'), false)
  assert.equal(isSearchablePage('/CONTRIBUTING'), true)
  assert.equal(isSearchablePage('/article', { search: false }), false)
  assert.equal(isSearchablePage('/article', { head: [['meta', { name: 'robots', content: 'nofollow, NOINDEX' }]] }), false)
})

test('source links use Markdown tokens, including references and wiki links but excluding code examples', () => {
  const content = '[Nested](nested(path).md)\n\n[Reference][ref]\n\n[ref]: /guide/\n\n[[other|Other]]\n\n`[Code](/fake)`\n\n```md\n[Code](/fake-too)\n```'
  assert.deepEqual(collectSourceLinks(content).map((link) => link.target), ['nested(path).md', '/guide/', 'other'])
})

test('pinned PR protection recognizes YAML variants and a renamed pinned file', () => fixture((directory, write) => {
  write('.test-gitconfig', '')
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(directory, '.test-gitconfig') }
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Document tests', '-c', 'user.email=tests@example.invalid', ...args], {
    cwd: directory, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
  const check = (base) => spawnSync(process.execPath, [join(repoRoot, 'scripts/check-pinned.mjs')], {
    cwd: directory, env: { ...env, PR_BASE_SHA: base }, encoding: 'utf8'
  })
  git('init', '-q')
  write('article.md', '# Article')
  git('add', '.')
  git('commit', '-qm', 'Initial document')
  const unpinnedBase = git('rev-parse', 'HEAD')
  for (const value of ['"1"', '1 # comment']) {
    write('article.md', '---\npinned: ' + value + '\n---\n# Article')
    git('add', '.')
    git('commit', '-qm', 'Set pinned')
    const result = check(unpinnedBase)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /置顶文章不允许通过 PR 修改/)
  }
  const pinnedBase = git('rev-parse', 'HEAD')
  renameSync(join(directory, 'article.md'), join(directory, "renamed's article.md"))
  write("renamed's article.md", '# Renamed, pinned removed')
  git('add', '-A')
  git('commit', '-qm', 'Rename and remove pinned')
  const renamed = check(pinnedBase)
  assert.equal(renamed.status, 1, renamed.stderr)
  assert.match(renamed.stderr, /article\.md/)
  const cleanBase = git('rev-parse', 'HEAD')
  write('new.md', '# A new unpinned article')
  git('add', '.')
  git('commit', '-qm', 'Add unpinned article')
  const clean = check(cleanBase)
  assert.equal(clean.status, 0, clean.stderr)
}))

test('the current catalog preserves document URLs and registered tag names', () => {
  const pages = loadDocuments({ includeGit: false })
  assert.ok(pages.length >= 49)
  assert.ok(pages.some((page) => page.url === "/tech-Uri'sFJ"))
  assert.ok(pages.some((page) => page.tags.includes('Vibe Coding')))
  assert.ok(pages.find((page) => page.url === '/campus-ms-index').pinned)
})
