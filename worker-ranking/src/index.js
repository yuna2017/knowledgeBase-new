/**
 * 全站文章浏览量排行 Worker（内部使用，独立部署，不接入文档站点）。
 *
 * 路由：
 *   GET /            排行页面（饼图 / 柱状图 / 列表 / 每日新增）
 *   GET /api/ranking 全量排行数据：文章清单合并 D1 计数 + 近 14 天每日新增
 *
 * 依赖：D1 绑定（变量名 DB），与计数 Worker 共用 yuna-kb-views 库。
 * 文章清单由 gen-titles.mjs 从 vitepress-docs 生成到 src/page-titles.json，
 * CI 在推送到 main 时自动重建并部署，无需手动操作。
 */

import pageTitles from './page-titles.json';
import { RANKING_PAGE_HTML } from './ranking-page';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 近 count 天的 UTC+8 日期列表（含今天，从早到晚） */
function lastDaysUtc8(count) {
  const now = Date.now()
  const days = []
  for (let i = count - 1; i >= 0; i--) {
    const shifted = new Date(now + (8 - i * 24) * 3600 * 1000)
    days.push({ day: shifted.toISOString().slice(0, 10), views: 0 })
  }
  return days
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(RANKING_PAGE_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/ranking') {
      const { results } = await env.DB.prepare(
        'SELECT page, views FROM counters'
      ).all();
      const viewMap = new Map(
        (results || []).map((row) => [row.page, Number(row.views) || 0])
      );
      const items = pageTitles
        .map((item) => ({ ...item, views: viewMap.get(item.page) ?? 0 }))
        .sort((left, right) => right.views - left.views || left.page.localeCompare(right.page));

      // 近 14 天每日新增（UTC+8）；表还不存在或查询失败时返回空数组，页面显示暂无数据
      let daily = [];
      try {
        const { results: dailyRows } = await env.DB.prepare(
          'SELECT day, SUM(views) AS views FROM daily_views GROUP BY day'
        ).all();
        const byDay = new Map(
          (dailyRows || []).map((row) => [row.day, Number(row.views) || 0])
        );
        daily = lastDaysUtc8(14).map((entry) => ({
          day: entry.day,
          views: byDay.get(entry.day) ?? 0,
        }));
      } catch {
        daily = [];
      }

      return json({ generatedAt: new Date().toISOString(), items, daily }, 200);
    }

    return json({ error: 'not found' }, 404);
  },
};
