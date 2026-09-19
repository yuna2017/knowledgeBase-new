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

      // 读取明细：daily_views 按 (page, day) 记录每天每篇的新增，据此拆出
      //  - daily[*].top   某天新增最多的文章（供柱状图悬停提示）
      //  - items[*].series 每篇近 14 天的新增序列（供排行榜小字展示）
      const days = lastDaysUtc8(14).map((entry) => entry.day);
      const titleMap = new Map(pageTitles.map((item) => [item.page, item.title]));
      let daily = [];
      let seriesMap = new Map();
      try {
        const { results: rows } = await env.DB.prepare(
          'SELECT page, day, views FROM daily_views'
        ).all();
        const byDayOfPage = new Map(); // day -> Map(page -> views)
        const byPageOfDay = new Map(); // page -> Map(day -> views)
        for (const row of rows || []) {
          const page = String(row.page);
          const day = String(row.day);
          const views = Number(row.views) || 0;
          if (!byDayOfPage.has(day)) byDayOfPage.set(day, new Map());
          byDayOfPage.get(day).set(page, (byDayOfPage.get(day).get(page) || 0) + views);
          if (!byPageOfDay.has(page)) byPageOfDay.set(page, new Map());
          byPageOfDay.get(page).set(day, (byPageOfDay.get(page).get(day) || 0) + views);
        }

        daily = days.map((day) => {
          const per = byDayOfPage.get(day);
          let total = 0;
          let top = [];
          if (per) {
            for (const views of per.values()) total += views;
            top = [...per.entries()]
              .map(([page, views]) => ({ page, title: titleMap.get(page) || page, views }))
              .filter((entry) => entry.views > 0)
              .sort((a, b) => b.views - a.views)
              .slice(0, 8);
          }
          return { day, views: total, top };
        });

        seriesMap = new Map(
          pageTitles.map((item) => {
            const per = byPageOfDay.get(item.page);
            return [item.page, days.map((day) => ({ day, views: per ? (per.get(day) || 0) : 0 }))];
          })
        );
      } catch {
        daily = [];
        seriesMap = new Map();
      }

      for (const item of items) {
        item.series = seriesMap.get(item.page) || days.map((day) => ({ day, views: 0 }));
      }

      return json({ generatedAt: new Date().toISOString(), items, daily }, 200);
    }

    return json({ error: 'not found' }, 404);
  },
};
