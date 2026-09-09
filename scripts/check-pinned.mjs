import { execSync } from 'node:child_process'

/**
 * 置顶文章保护：只有 owner 直接提交（push 到 main）能改，任何 PR 一律拦截，不分人。
 *
 * 判定规则：一个 PR 里若有 .md 文件满足下面任一条件，就无法通过：
 *   1. 该文件在基础分支（main）上就是置顶文章——frontmatter 里有 `pinned:` 值；
 *   2. 该文件的 `pinned` 值相对基础分支发生了变化（新增、移除或改了数字/true）。
 *
 * 为什么不用 owner 白名单：
 *   owner 修改置顶文章的途径是直接把提交推到 main——deploy.yml 由 push 事件触发，
 *   而本脚本只在 pull_request 流程（pr-check.yml）里运行。所以 owner 的提交不会走到这里，
 *   也就不需要判断"谁开的 PR"；凡是 PR 改动置顶文章，一律不允许。
 *   维护者想改置顶内容，走 owner 的 main 直推通道即可。
 */

const BASE_SHA = process.env.PR_BASE_SHA
if (!BASE_SHA) {
  console.error('缺少 PR_BASE_SHA：请确认在 pr-check.yml 里传入了 github.event.pull_request.base.sha。')
  process.exit(1)
}

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/**
 * 从文件内容里取置顶标记的归一化值。
 * 返回 undefined 表示未置顶；pinned: false 也视为未置顶。
 * 数字统一成字符串（如 "1"），true 保留为 "true"，便于做"值是否变化"的比对。
 */
function pinnedValue(text) {
  if (!text) return undefined
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return undefined
  const match = frontmatter[1].match(/^pinned\s*:\s*(true|false|-?\d+)\s*$/m)
  if (!match) return undefined
  const value = match[1]
  if (value === 'false') return undefined
  return value === 'true' ? 'true' : String(Number(value))
}

/** 取指定提交中某文件的内容；文件在该提交里不存在时返回 undefined。 */
function show(sha, file) {
  try {
    return git(`show ${sha}:${file}`)
  } catch {
    return undefined
  }
}

let changedFiles
try {
  changedFiles = git(`diff --name-only --diff-filter=ACMRD ${BASE_SHA} HEAD`)
    .split('\n')
    .filter((line) => line.trim())
} catch (error) {
  console.error('无法计算 PR 变更文件：' + error.message)
  process.exit(1)
}

const violations = []
for (const file of changedFiles) {
  if (!file.endsWith('.md')) continue

  const basePinned = pinnedValue(show(BASE_SHA, file))
  const headPinned = pinnedValue(show('HEAD', file))

  const pinnedOnBase = basePinned !== undefined
  const pinnedChanged = basePinned !== headPinned

  if (pinnedOnBase || pinnedChanged) {
    const reason = pinnedOnBase
      ? (pinnedChanged ? '置顶文章（且修改了 pinned 值）' : '置顶文章')
      : '新增了 pinned 置顶标记'
    violations.push(`${file}（${reason}）`)
  }
}

if (violations.length > 0) {
  console.error('置顶文章不允许通过 PR 修改，本次变更拦截：')
  for (const violation of violations) console.error('- ' + violation)
  console.error('置顶文章仅由 owner 直接推送到 main 维护；如需调整，请在 main 上改动后部署。')
  process.exit(1)
}

console.log('置顶文章校验通过：PR 未改动任何置顶文章。')
