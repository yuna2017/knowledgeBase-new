import matter from 'gray-matter'

function fail(sourcePath, message) {
  throw new Error(`[文档元数据] ${sourcePath}：${message}`)
}

export function normalizeStringList(value, field, sourcePath = '<markdown>') {
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [value]
  if (values.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(sourcePath, `${field} 必须是非空字符串或字符串列表`)
  }
  return [...new Set(values.map((item) => item.trim()))]
}

/** The display and PR protection use exactly the same pinned interpretation. */
export function normalizePinned(value, sourcePath = '<markdown>') {
  if (value === undefined || value === null || value === false) return undefined
  // Preserve the previously supported true and quoted numeric forms.
  const order = value === true ? 1 : typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim()) : value
  if (typeof order !== 'number' || !Number.isSafeInteger(order) || order <= 0) {
    fail(sourcePath, 'pinned 必须是正整数，或 false（不置顶）')
  }
  return order
}

export function parseFrontmatter(text, sourcePath = '<markdown>') {
  let parsed
  try {
    parsed = matter(text)
  } catch (error) {
    fail(sourcePath, `YAML 解析失败：${error.message}`)
  }
  const frontmatter = parsed.data
  for (const field of ['title', 'description']) {
    if (frontmatter[field] !== undefined && typeof frontmatter[field] !== 'string') {
      fail(sourcePath, `${field} 必须是字符串`)
    }
  }
  return {
    frontmatter,
    content: parsed.content,
    tags: normalizeStringList(frontmatter.tags, 'tags', sourcePath),
    authors: normalizeStringList(frontmatter.authors, 'authors', sourcePath),
    pinned: normalizePinned(frontmatter.pinned, sourcePath)
  }
}
