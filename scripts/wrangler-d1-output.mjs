import { stripVTControlCharacters } from 'node:util'

/**
 * Wrangler's remote --file path prints spinner progress before its --json result.
 * The final JSON document starts at column zero; nested result rows must never be
 * mistaken for a complete response when an outer document is truncated.
 */
export function parseD1Output(output) {
  const lines = stripVTControlCharacters(String(output)).replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const start = lines.findIndex((line) => /^(?:\[\s*(?:\{|\]|$)|\{\s*(?:"|\}|$))/.test(line))
  if (start < 0) throw new Error('Wrangler returned no D1 JSON result')

  let result
  try {
    result = JSON.parse(lines.slice(start).join('\n'))
  } catch (cause) {
    throw new Error('Wrangler returned an incomplete or invalid D1 JSON result', { cause })
  }
  const entries = Array.isArray(result) ? result : [result]
  if (!entries.length || entries.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error('Wrangler returned an invalid D1 result structure')
  }
  if (entries.some((entry) => entry.success === false || entry.error || entry.errors?.length)) {
    throw new Error('D1 rejected a migration query')
  }
  if (entries.some((entry) => entry.success !== true || !Array.isArray(entry.results))) {
    throw new Error('Wrangler returned an invalid D1 result structure')
  }
  return entries
}
