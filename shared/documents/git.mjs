import { execFileSync } from 'node:child_process'

const histories = new Map()

/** One history query per repository revision, shared by all catalog projections. */
export function loadLastCommits(cwd = process.cwd()) {
  try {
    const options = { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], options).trim()
    const cached = histories.get(cwd)
    if (cached?.head === head) return cached.commits
    const raw = execFileSync('git', [
      '-c', 'core.quotepath=false', 'log', '--name-only', '--format=%x01%cI', '--', '*.md'
    ], options)
    const commits = new Map()
    for (const block of raw.split('\x01').slice(1)) {
      const [date, ...files] = block.split('\n')
      for (const file of files) {
        const path = file.trim()
        if (path.endsWith('.md') && !commits.has(path)) commits.set(path, { date: date.trim() })
      }
    }
    histories.set(cwd, { head, commits })
    return commits
  } catch {
    // An exported source archive can still build without Git history.
    return new Map()
  }
}
