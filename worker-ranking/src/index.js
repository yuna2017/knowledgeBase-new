/**
 * 全站文章浏览量排行 Worker（内部使用，独立部署，不接入文档站点）。
 *
 * 路由：
 *   GET /            排行页面（饼图 / 柱状图 / 列表）
 *   GET /api/ranking 全量排行数据：文章清单合并 D1 计数
 *
 * 依赖：D1 绑定（变量名 DB），与计数 Worker 共用 yuna-kb-views 库。
 * 文章清单由 gen-titles.mjs 从 vitepress-docs 生成到 src/page-titles.json，
 * 新增 / 删除 / 改名文章后重跑生成脚本并重新部署。
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
      return json({ generatedAt: new Date().toISOString(), items }, 200);
    }

    return json({ error: 'not found' }, 404);
  },
};
