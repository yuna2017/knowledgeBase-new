import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import MiniSearch from 'minisearch'
import { tokenizeSearch, searchOptions } from '../shared/search.mjs'

const chunks = resolve('vitepress-docs/.vitepress/dist/assets/chunks')
const filename = readdirSync(chunks).find((name) => name.startsWith('@localSearchIndexroot.'))
assert.ok(filename, '构建产物缺少本地搜索索引')
const file = resolve(chunks, filename)
const { default: json } = await import(pathToFileURL(file).href)
const index = MiniSearch.loadJSON(json, {
  fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'],
  tokenize: tokenizeSearch, searchOptions
})
for (const [query, route] of [
  ['微软', '/tech-coding-tools'],
  ['校园网 认证', '/campus-network-connect'],
  ['校园邮箱', '/campus-mail-index'],
  ['GitHub 学生', '/tech-student-pack']
]) {
  assert.ok(index.search(query).some((item) => item.id.split('#')[0] === route),
    `搜索“${query}”未召回 ${route}`)
}
const documentIds = Object.values(JSON.parse(json).documentIds)
assert.ok(!documentIds.some((id) => /^\/wanted(?:[-#]|$)/.test(id)), '反馈功能页不应进入正文搜索')
const bytes = readFileSync(file)
console.log(`搜索产物检查通过：4 组常用查询、功能页排除；索引 ${bytes.length} 字节，gzip ${gzipSync(bytes).length} 字节。`)
