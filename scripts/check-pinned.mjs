import { execFileSync } from 'node:child_process'
import { parseFrontmatter } from '../shared/documents/frontmatter.mjs'

// PRs may neither edit existing pinned documents nor change the pinned status.
const baseSha = process.env.PR_BASE_SHA
if (!baseSha || !/^[a-f0-9]{40,64}$/i.test(baseSha)) {
  console.error('缺少有效 PR_BASE_SHA：请传入 github.event.pull_request.base.sha。')
  process.exit(1)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function show(sha, file) {
  // Missing files are normal for additions/deletions. Other Git failures must fail closed.
  try {
    git(['cat-file', '-e', sha + ':' + file])
  } catch (error) {
    if (error.status === 128 && /does not exist|exists on disk, but not in|not a valid object/i.test(String(error.stderr))) return ''
    throw error
  }
  return git(['show', sha + ':' + file])
}

try {
  // Treat renames as deletion + addition so renaming a pinned file cannot evade the guard.
  const changedFiles = git(['diff', '--no-renames', '--name-only', '-z', baseSha, 'HEAD'])
    .split('\0').filter((file) => file.endsWith('.md'))
  const violations = []
  for (const file of changedFiles) {
    const basePinned = parseFrontmatter(show(baseSha, file), file).pinned
    const headPinned = parseFrontmatter(show('HEAD', file), file).pinned
    if (basePinned !== undefined || basePinned !== headPinned) violations.push(file)
  }
  if (violations.length) {
    console.error('置顶文章不允许通过 PR 修改，本次变更拦截：\n' + violations.map((file) => '- ' + file).join('\n'))
    console.error('置顶文章仅由 owner 直接推送到 main 维护。')
    process.exitCode = 1
  } else {
    console.log('置顶文章校验通过：PR 未改动任何置顶文章。')
  }
} catch (error) {
  console.error('置顶文章检查失败：' + error.message)
  process.exitCode = 1
}
