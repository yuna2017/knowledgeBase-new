import { execFileSync } from 'node:child_process'

export interface LastCommit {
  /** ISO 时间 */
  date: string
}

/**
 * 一次性取出仓库里全部 Markdown 的最后提交时间。
 *
 * 用一次 `git log --name-only` 取全量，比逐文件调用 git 快得多
 * （36 篇文档就是 36 次进程启动，在 Windows 上尤其明显）。
 *
 * 依赖完整的提交历史：CI 里 actions/checkout 必须保持 fetch-depth: 0，
 * 浅克隆会让所有文件拿到同一个时间。
 *
 * 键是相对仓库根目录的 POSIX 路径，例如 `vitepress-docs/tech-git-github.md`。
 */
export function loadLastCommits(cwd = process.cwd()): Map<string, LastCommit> {
  const result = new Map<string, LastCommit>()

  let raw: string
  try {
    // \x01 分隔提交，\x00 分隔字段，避免提交说明里的字符干扰解析
    raw = execFileSync(
      'git',
      ['log', '--name-only', '--format=%x01%cI'],
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  } catch {
    // 没有 git、或不在仓库里时降级为空，调用方按「无时间」处理
    return result
  }

  for (const block of raw.split('\x01').slice(1)) {
    const [date, ...fileLines] = block.split('\n')

    for (const file of fileLines) {
      const path = file.trim()
      // git log 按时间倒序输出，第一次见到某个文件就是它最后一次改动
      if (path.endsWith('.md') && !result.has(path)) {
        result.set(path, { date: date.trim() })
      }
    }
  }

  return result
}
