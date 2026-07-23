/**
 * YUNA KnowledgeBase 阅读量 Worker
 *
 * 路由：
 *   POST /api/views            body: { "page": "/tech-cloudflare" }  计数 +1，返回最新 views
 *   GET  /api/views?page=/x    只读某页阅读量，不 +1
 *   GET  /api/views/top?limit=3  阅读量 Top N（默认 3，最大 20）
 *
 * 存储：D1，counters(page TEXT PRIMARY KEY, views INTEGER)
 */

// page key 校验：站内路径，以 / 开头，长度受限，禁止控制字符和协议前缀
const PAGE_RE = /^\/[\w\-./%]*$/;
const PAGE_MAX = 256;

function parseOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
    },
  });
}

function isValidPage(page) {
  return (
    typeof page === 'string' &&
    page.length > 0 &&
    page.length <= PAGE_MAX &&
    PAGE_RE.test(page)
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // 计数 +1
    if (request.method === 'POST' && url.pathname === '/api/views') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid json' }, 400, request, env);
      }
      const page = body && body.page;
      if (!isValidPage(page)) {
        return json({ error: 'invalid page' }, 400, request, env);
      }
      const row = await env.DB.prepare(
        `INSERT INTO counters(page, views) VALUES(?, 1)
         ON CONFLICT(page) DO UPDATE SET views = views + 1
         RETURNING views`
      )
        .bind(page)
        .first();
      return json({ page, views: row ? row.views : 0 }, 200, request, env);
    }

    // 只读单页
    if (request.method === 'GET' && url.pathname === '/api/views') {
      const page = url.searchParams.get('page');
      if (!isValidPage(page)) {
        return json({ error: 'invalid page' }, 400, request, env);
      }
      const row = await env.DB.prepare('SELECT views FROM counters WHERE page = ?')
        .bind(page)
        .first();
      return json({ page, views: row ? row.views : 0 }, 200, request, env);
    }

    // Top N 排行
    if (request.method === 'GET' && url.pathname === '/api/views/top') {
      let limit = parseInt(url.searchParams.get('limit') || '3', 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 3;
      if (limit > 20) limit = 20;
      const { results } = await env.DB.prepare(
        'SELECT page, views FROM counters ORDER BY views DESC, page ASC LIMIT ?'
      )
        .bind(limit)
        .all();
      return json({ items: results || [] }, 200, request, env);
    }

    return json({ error: 'not found' }, 404, request, env);
  },
};
