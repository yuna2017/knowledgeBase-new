import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: true })

/** Parse real Markdown links, excluding fenced examples and inline code. */
export function collectSourceLinks(content, frontmatter = {}) {
  const links = []
  function visit(tokens, inheritedLine = 1) {
    for (const token of tokens) {
      const line = token.map ? token.map[0] + 1 : inheritedLine
      if (token.type === 'link_open' || token.type === 'image') {
        links.push({ target: token.attrGet(token.type === 'image' ? 'src' : 'href'), line })
      }
      if (token.type === 'text') {
        for (const match of token.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
          links.push({ target: match[1].trim(), line, wiki: true })
        }
      }
      if (token.type === 'html_inline' || token.type === 'html_block') {
        const html = token.content.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
        for (const match of html.matchAll(/\s(?:href|src)\s*=\s*(["'])(.*?)\1/g)) {
          links.push({ target: match[2], line })
        }
      }
      if (token.children) visit(token.children, line)
    }
  }
  visit(markdown.parse(content, {}))
  for (const action of frontmatter.hero?.actions ?? []) {
    if (typeof action.link === 'string') links.push({ target: action.link, line: 1 })
  }
  for (const card of [...(frontmatter.features ?? []), ...(frontmatter.homeCards ?? [])]) {
    if (typeof card.link === 'string') links.push({ target: card.link, line: 1 })
  }
  if (typeof frontmatter.hero?.image?.src === 'string') links.push({ target: frontmatter.hero.image.src, line: 1 })
  return links
}
