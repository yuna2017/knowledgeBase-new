/**
 * 把标签名转成 URL 片段。
 *
 * 保留中文和大小写，只把空白折叠成连字符，让标签页地址仍然可读
 * （`Vibe Coding` → `/tags/Vibe-Coding`，`校园网` → `/tags/校园网`）。
 * 这样标签页可以被收藏、被搜索引擎单独收录，也方便在文章里直接手写链接。
 */
export function tagSlug(tag: string) {
  return String(tag).trim().replace(/\s+/g, '-')
}

/** 标签页地址，站点 base 由调用方用 withBase 补。 */
export function tagPath(tag: string) {
  return '/tags/' + tagSlug(tag)
}

/**
 * 旧版把所有标签堆在 /tags 一页里，靠这个哈希做页内锚点。
 * 现在每个标签都有独立页面，锚点不再使用；保留函数只为兼容可能残留的旧链接。
 *
 * @deprecated 用 tagPath 代替
 */
export function tagId(tag: string) {
  let hash = 2166136261
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return 'tag-' + (hash >>> 0).toString(36)
}
