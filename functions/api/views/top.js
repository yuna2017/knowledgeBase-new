/**
 * Cloudflare Pages Function —— 阅读量 Top 排行（首页「最高阅读」用）。
 *
 * 依赖与 functions/api/views.js 相同的 D1 绑定（变量名 DB，库 yuna-kb-views）。
 *   GET /api/views/top?limit=N   按阅读量倒序取前 N（默认 3，最大 20）
 */

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

  let limit = parseInt(url.searchParams.get('limit') || '3', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 3;
  if (limit > 20) limit = 20;

  const { results } = await env.DB.prepare(
    'SELECT page, views FROM counters ORDER BY views DESC, page ASC LIMIT ?'
  ).bind(limit).all();

  return json({ items: results || [] }, 200);
}
