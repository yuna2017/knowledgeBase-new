/**
 * YUNA KnowledgeBase 阅读量 Worker
 *
 * 路由：
 *   POST /api/views            body: { "page": "/tech-cloudflare" }  计数 +1，返回最新 views
 *   GET  /api/views?page=/x    只读某页阅读量，不 +1
 *   GET  /api/views/top?limit=3  阅读量 Top N（默认 3，最大 20）
 *
 * 存储：D1
 *   counters(page TEXT PRIMARY KEY, views INTEGER)        累计阅读量
 *   daily_views(page TEXT, day TEXT, views INTEGER, PK(page, day))  按 UTC+8 日期记每日新增
 */

// page key 校验：站内路径，以 / 开头，长度受限，禁止控制字符和协议前缀。
// 允许单引号：站点路径可能含它（如 /tech-Uri'sFJ），不允许会让这类页面无法计数。
const PAGE_RE = /^\/[\w\-./%']*$/;
const PAGE_MAX = 256;

/** 当前时间的 UTC+8 日期字符串（YYYY-MM-DD） */
function utc8Day(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 每日流水表按需创建（每个 isolate 只执行一次），失败不影响累计计数 */
let dailySchemaReady = null;
function ensureDailySchema(env) {
  if (!dailySchemaReady) {
    dailySchemaReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS daily_views (
         page  TEXT NOT NULL,
         day   TEXT NOT NULL,
         views INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (page, day)
       )`
    ).run().catch(() => null);
  }
  return dailySchemaReady;
}

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

      // 每日新增流水（UTC+8）：失败只影响日统计，不阻断计数
      try {
        await ensureDailySchema(env);
        await env.DB.prepare(
          `INSERT INTO daily_views(page, day, views) VALUES(?, ?, 1)
           ON CONFLICT(page, day) DO UPDATE SET views = views + 1`
        )
          .bind(page, utc8Day())
          .run();
      } catch {
        // 忽略，日统计降级为空
      }

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
