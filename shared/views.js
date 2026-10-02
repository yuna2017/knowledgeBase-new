/** The statistics service is shared by Pages and the legacy Worker adapter. */
const PAGE_RE = /^\/[\w\-./%']*$/
const PAGE_MAX = 256

export function utc8Day(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function isValidPage(page) {
  return typeof page === 'string' && page.length > 0 && page.length <= PAGE_MAX && PAGE_RE.test(page)
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  })
}

export async function handleViews(request, env, headers = {}) {
  const url = new URL(request.url)
  try {
    if (request.method === 'GET' && url.pathname === '/api/views/top') {
      const raw = parseInt(url.searchParams.get('limit') || '3', 10)
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 3
      const { results } = await env.DB.prepare(
        'SELECT page, views FROM counters ORDER BY views DESC, page ASC LIMIT ?'
      ).bind(limit).all()
      return json({ items: results || [] }, 200, headers)
    }
    if (url.pathname !== '/api/views') return json({ error: 'not found' }, 404, headers)
    if (request.method === 'GET') {
      const page = url.searchParams.get('page')
      if (!isValidPage(page)) return json({ error: 'invalid page' }, 400, headers)
      const row = await env.DB.prepare('SELECT views FROM counters WHERE page = ?').bind(page).first()
      return json({ page, views: row ? row.views : 0 }, 200, headers)
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers)
    let body
    try { body = await request.json() } catch { return json({ error: 'invalid json' }, 400, headers) }
    const page = body && body.page
    if (!isValidPage(page)) return json({ error: 'invalid page' }, 400, headers)
    // Both counters describe the same event. D1 batches roll back together on failure.
    const [total] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO counters(page, views) VALUES(?, 1)
        ON CONFLICT(page) DO UPDATE SET views = views + 1 RETURNING views`).bind(page),
      env.DB.prepare(`INSERT INTO daily_views(page, day, views) VALUES(?, ?, 1)
        ON CONFLICT(page, day) DO UPDATE SET views = views + 1`).bind(page, utc8Day())
    ])
    return json({ page, views: total.results?.[0]?.views ?? 0 }, 200, headers)
  } catch (error) {
    console.error('[views] storage failure', error)
    return json({ error: 'storage error' }, 503, headers)
  }
}
