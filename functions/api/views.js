/**
 * Cloudflare Pages Function —— 文档站同源阅读量统计。
 *
 * 作用：把阅读计数从独立的 *.workers.dev Worker 搬到文档站同一域名
 * （docs.yuna.team/api/views），这样只要文档能打开，计数接口必然可达，
 * 不再受大陆对 *.workers.dev 子域名网络环境的影响。
 *
 * 需在 Pages 项目设置里给该函数绑定 D1 数据库，变量名必须为 `DB`
 * （数据库 yuna-kb-views，database_id fa3ebf5a-5c7e-4c46-92a8-67f6bd65d2aa）。
 *
 * 路由：
 *   POST /api/views                { "page": "/x" }  计数 +1，返回最新 views
 *   GET  /api/views?page=/x        只读某页阅读量，不 +1
 *   GET  /api/views/top?limit=N    阅读量 Top N（默认 3，最大 20）
 */

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

function isValidPage(page) {
  return (
    typeof page === 'string' &&
    page.length > 0 &&
    page.length <= PAGE_MAX &&
    PAGE_RE.test(page)
  );
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === '/api/views/top') {
    let limit = parseInt(url.searchParams.get('limit') || '3', 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 3;
    if (limit > 20) limit = 20;
    const { results } = await env.DB.prepare(
      'SELECT page, views FROM counters ORDER BY views DESC, page ASC LIMIT ?'
    ).bind(limit).all();
    return json({ items: results || [] }, 200);
  }

  const page = url.searchParams.get('page');
  if (!isValidPage(page)) return json({ error: 'invalid page' }, 400);
  const row = await env.DB.prepare('SELECT views FROM counters WHERE page = ?')
    .bind(page)
    .first();
  return json({ page, views: row ? row.views : 0 }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const page = body && body.page;
  if (!isValidPage(page)) return json({ error: 'invalid page' }, 400);

  const row = await env.DB.prepare(
    `INSERT INTO counters(page, views) VALUES(?, 1)
     ON CONFLICT(page) DO UPDATE SET views = views + 1
     RETURNING views`
  ).bind(page).first();

  // 每日新增流水（UTC+8）：失败只影响日统计，不阻断计数
  try {
    await ensureDailySchema(env);
    await env.DB.prepare(
      `INSERT INTO daily_views(page, day, views) VALUES(?, ?, 1)
       ON CONFLICT(page, day) DO UPDATE SET views = views + 1`
    ).bind(page, utc8Day()).run();
  } catch {
    // 忽略，日统计降级为空
  }

  return json({ page, views: row ? row.views : 0 }, 200);
}
