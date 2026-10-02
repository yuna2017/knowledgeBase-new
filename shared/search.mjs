/**
 * VitePress 会把此函数序列化到浏览器，因此必须独立于模块作用域。
 * 中文和英文均按词建立索引；构建和查询使用完全相同的分词入口。
 */
export function tokenizeSearch(text) {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  return Array.from(segmenter.segment(String(text).normalize('NFKC')))
    .filter((part) => part.isWordLike)
    .map((part) => part.segment)
}

export const searchOptions = {
  combineWith: 'AND',
  boost: { title: 6, titles: 2, text: 1 },
  // 中文短词的模糊匹配容易把“学生证”匹配到“学生会”。仅拉丁词容错。
  fuzzy: (term) => /^[a-z\d_-]{4,}$/i.test(term) ? 0.15 : false,
  prefix: (term) => /^[a-z\d_-]{2,}$/i.test(term)
}
