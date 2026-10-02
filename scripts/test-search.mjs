import { test } from 'node:test'
import assert from 'node:assert/strict'
import MiniSearch from 'minisearch'
import { tokenizeSearch, searchOptions } from '../shared/search.mjs'

const options = {
  fields: ['title', 'titles', 'text'],
  storeFields: ['title', 'titles'],
  tokenize: tokenizeSearch,
  searchOptions
}

test('中文关键词可以命中连续中文正文，英文和混合查询保持可用', () => {
  const index = new MiniSearch(options)
  index.addAll([
    { id: 'editor', title: '编程工具', titles: '', text: '最流行的是微软的 Visual Studio Code。' },
    { id: 'network', title: '连接与认证', titles: '校园网', text: '通过统一身份认证登录校园网。' },
    { id: 'cloud', title: '免费云服务', titles: '', text: '学生可以申请 GitHub 学生包。' },
    { id: 'clubs', title: '学生组织', titles: '', text: '学生会活动' }
  ])
  assert.equal(index.search('微软')[0]?.id, 'editor')
  assert.equal(index.search('校园网 认证')[0]?.id, 'network')
  assert.equal(index.search('github 学生')[0]?.id, 'cloud')
  assert.equal(index.search('visu')[0]?.id, 'editor')
  assert.equal(index.search('学生证').length, 0)
  assert.equal(index.search('不存在的服务').length, 0)
})

test('分词函数经 VitePress 风格序列化后可独立运行', () => {
  const restored = new Function('return ' + tokenizeSearch.toString())()
  for (const text of ['微软的编辑器', '校园网认证', 'ＡＰＩ and GitHub 学生包', '']) {
    assert.deepEqual(restored(text), tokenizeSearch(text))
  }
  const index = new MiniSearch(options)
  index.add({ id: 'one', title: '微软编辑器', titles: '', text: 'Visual Studio Code' })
  const restoredIndex = MiniSearch.loadJSON(JSON.stringify(index), { ...options, tokenize: restored })
  assert.equal(restoredIndex.search('微软')[0]?.id, 'one')
})
