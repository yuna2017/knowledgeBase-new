/*
 * 构建产物发布后，把本次变更的页面推送给 IndexNow。
 *
 * Bing Webmaster Tools 把「未采用 IndexNow」列为高严重性问题：不推送时
 * 搜索引擎只能等下一轮爬取才发现改动，时效性内容（免费额度、校园服务流程）
 * 在搜索结果里会长期停留在旧版本。
 *
 * IndexNow 是 Bing / Yandex / Seznam / Naver 共用的协议，向任一端点提交即可，
 * 这里用 api.indexnow.org 这个中立入口。
 *
 * 密钥不是机密：协议要求它必须能从 https://<host>/<key>.txt 公开读到，
 * 搜索引擎靠这个文件确认提交者拥有该域名。所以密钥直接存在
 * vitepress-docs/public/ 里随站点发布，不走 GitHub Secrets。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

/** 与 .vitepress/config.mts 里的 SITE_URL 保持一致 */
const SITE_URL = 'https://docs.yuna.team'
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = resolve(projectRoot, 'vitepress-docs')
const publicRoot = resolve(docsRoot, 'public')
const distRoot = resolve(docsRoot, '.vitepress', 'dist')

/**
 * 从 public/ 里找出密钥文件。
 *
 * 不把密钥写死在代码里：轮换时只要换掉 public/ 下的文件就行，
 * 不用记得同步改这个脚本。文件名和内容必须一致，这是协议的要求。
 */
function readKey() {
  const candidates = readdirSync(publicRoot).filter((name) => {
    return /^[a-f\d]{8,128}\.txt$/i.test(name)
  })

  if (candidates.length === 0) {
    throw new Error(
      '在 vitepress-docs/public/ 里找不到 IndexNow 密钥文件。' +
      '密钥应是 8-128 位十六进制字符，文件名为 <密钥>.txt，内容就是密钥本身。'
    )
  }
  if (candidates.length > 1) {
    throw new Error('public/ 里存在多个 IndexNow 密钥文件：' + candidates.join('、'))
  }

  const key = candidates[0].replace(/\.txt$/i, '')
  const content = readFileSync(resolve(publicRoot, candidates[0]), 'utf8').trim()
  if (content !== key) {
    throw new Error(
      '密钥文件内容与文件名不一致：文件名是 ' + key + '，内容是 ' + content +
      '。IndexNow 会读取该文件校验所有权，两者必须相同。'
    )
  }
  return key
}

/** 仓库里的 Markdown 路径 → 站点上的绝对地址（cleanUrls 开启，不带 .html） */
function pageUrl(relativePath) {
  let path = relativePath.replace(/^vitepress-docs\//, '').replace(/\.md$/, '')
  if (path === 'index') path = ''
  else if (path.endsWith('/index')) path = path.slice(0, -'index'.length)
  return SITE_URL + '/' + path
}

/** 从构建产物的 sitemap 里取全部页面，首次接入或手动触发时用 */
function urlsFromSitemap() {
  const xml = readFileSync(resolve(distRoot, 'sitemap.xml'), 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
}

/**
 * 取两次提交之间变更的文档页。
 *
 * 删除的文件也一并提交：IndexNow 靠重新抓取来确认 404，主动推送比等下一轮
 * 爬取更快把失效页面从结果里清掉。
 *
 * 只看 .md：改主题或配置会一次性影响全站，逐页推送反而像在刷接口。
 * 这类改动想让搜索引擎尽快重抓，手动触发一次工作流走全量提交即可。
 */
function urlsFromDiff(beforeSha, afterSha) {
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', beforeSha, afterSha, '--', 'vitepress-docs'],
    { cwd: projectRoot, encoding: 'utf8' }
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.md'))
    // tags/[tag].md 是动态路由模板，本身不是页面
    .filter((line) => !line.includes('['))

  if (changed.length === 0) return []

  const urls = new Set(changed.map(pageUrl))
  // 聚合页的内容由这些文档拼出来，任一文档变更它们就跟着变了
  urls.add(SITE_URL + '/tags')
  urls.add(SITE_URL + '/recent')
  return [...urls]
}

const key = readKey()
const beforeSha = process.env.BEFORE_SHA ?? ''
const afterSha = process.env.AFTER_SHA ?? 'HEAD'

/*
 * 手动触发（workflow_dispatch）或分支首次推送时，github.event.before 是空值
 * 或全零 SHA，diff 无从算起，这时提交 sitemap 里的全部页面。
 * 日常推送只提交变更页——IndexNow 明确不建议反复提交未变更的 URL。
 */
const isFullSubmit = !beforeSha || /^0+$/.test(beforeSha)
const urls = isFullSubmit ? urlsFromSitemap() : urlsFromDiff(beforeSha, afterSha)

if (urls.length === 0) {
  console.log('IndexNow：本次没有文档变更，跳过提交。')
  process.exit(0)
}

const payload = {
  host: new URL(SITE_URL).host,
  key,
  keyLocation: SITE_URL + '/' + key + '.txt',
  urlList: urls
}

console.log(
  'IndexNow：提交 ' + urls.length + ' 个 URL' +
  (isFullSubmit ? '（全量）' : '（本次变更）') + '：'
)
for (const url of urls) console.log('- ' + url)

// 本地核对用：只打印将要提交的内容，不真的发请求
if (process.argv.includes('--dry-run')) {
  console.log('IndexNow：--dry-run，未发送请求。')
  process.exit(0)
}

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload)
})

/*
 * 200 表示已接收，202 表示已接收但密钥仍在校验（首次接入时的正常状态）。
 * 其余状态码打印出来但不让工作流失败：站点这时已经发布成功，
 * 通知搜索引擎失败不该把一次正常部署标成红色。
 */
const body = await response.text()
if (response.status === 200 || response.status === 202) {
  console.log('IndexNow：提交成功（HTTP ' + response.status + '）。')
} else {
  console.error('IndexNow：提交失败，HTTP ' + response.status + ' ' + body)
  process.exitCode = 1
}
