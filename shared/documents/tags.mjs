/** Preserve existing public tag addresses, including Chinese and letter case. */
export function tagSlug(tag) {
  return String(tag).trim().replace(/\s+/g, '-')
}

export function tagPath(tag) {
  return '/tags/' + tagSlug(tag)
}

/** @deprecated Compatibility with the former anchors on /tags. */
export function tagId(tag) {
  let hash = 2166136261
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return 'tag-' + (hash >>> 0).toString(36)
}
