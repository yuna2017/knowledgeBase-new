/**
 * 排行页面 HTML（由 Worker 直接返回）。
 * 饼图（Top 8 + 其他）、柱状图（Top 10）、全量列表、筛选与自动刷新。
 * 布局：宽幅高密度；配色：中性灰 + 单一蓝色强调，无渐变。
 */

export const RANKING_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="https://docs.yuna.team/images/logo.png">
<title>文章浏览量排行</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #ffffff; --text: #1a1d24; --muted: #6b7280;
    --accent: #2f6fed; --border: rgba(26, 29, 36, .08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1116; --card: #181b21; --text: #e8ebf2; --muted: #8a93a5;
      --accent: #5b8def; --border: rgba(232, 235, 242, .1);
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 18px 40px; font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--text); }
  .wrap { max-width: 1320px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 1.25rem; }
  header .sub { color: var(--muted); font-size: .78rem; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; display: flex; align-items: baseline; gap: 8px; }
  .stat .label { color: var(--muted); font-size: .7rem; }
  .stat .value { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .charts { display: grid; grid-template-columns: 430px 1fr; gap: 8px; margin-bottom: 10px; }
  .daily-card { margin-bottom: 10px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .card h2 { margin: 0 0 8px; font-size: .8rem; color: var(--muted); font-weight: 600; }
  .pie-wrap { position: relative; width: 210px; height: 210px; margin: 0 auto 8px; }
  .pie-wrap svg { transform: rotate(-90deg); }
  .pie-center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; }
  .pie-center .num { font-size: 1.3rem; font-weight: 700; }
  .pie-center .label { color: var(--muted); font-size: .7rem; }
  .legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; }
  .legend li { display: flex; align-items: center; gap: 6px; font-size: .78rem; min-width: 0; }
  .legend .dot { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
  .legend .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend .value { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bars { display: flex; align-items: stretch; gap: 5px; height: 250px; }
  .bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .bar-col .val { flex: 0 0 auto; font-size: .68rem; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; text-align: center; }
  .bar-col .bar-area { flex: 1 1 auto; min-height: 0; display: flex; align-items: flex-end; justify-content: center; width: 100%; }
  .bar-col .bar { width: 68%; max-width: 30px; border-radius: 3px 3px 0 0; background: var(--accent); min-height: 2px; }
  .bar-col .name { flex: 0 0 auto; height: 2.6em; font-size: .72rem; color: var(--muted); width: 100%; text-align: center; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; -webkit-box-pack: center; overflow: hidden; word-break: break-all; }
  .controls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .search { flex: 1; min-width: 200px; position: relative; }
  .search input { width: 100%; padding: 7px 10px 7px 28px; font-size: .88rem; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--text); outline: none; }
  .search input:focus { border-color: var(--accent); }
  .search::before { content: "⌕"; position: absolute; left: 9px; top: 50%; transform: translateY(-52%); color: var(--muted); font-size: .95rem; }
  button { padding: 7px 14px; font-size: .88rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--text); }
  button:hover { border-color: var(--accent); }
  .auto { display: flex; align-items: center; gap: 5px; font-size: .8rem; color: var(--muted); white-space: nowrap; }
  .error { display: none; margin-bottom: 8px; padding: 8px 12px; border-radius: 6px; background: rgba(220, 70, 70, .1); border: 1px solid rgba(220, 70, 70, .3); color: #d64f4f; font-size: .85rem; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 8px; }
  .item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
  .item:hover { border-color: var(--accent); }
  .rank { flex: 0 0 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgba(107, 114, 128, .14); color: var(--muted); font-weight: 700; font-size: .82rem; }
  .main { flex: 1; min-width: 0; }
  .title { display: block; font-weight: 600; font-size: .9rem; }
  a.title { color: inherit; text-decoration: none; }
  a.title:hover { color: var(--accent); }
  .path { color: var(--muted); font-size: .7rem; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { height: 4px; border-radius: 2px; background: rgba(107, 114, 128, .15); margin-top: 5px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 2px; background: var(--accent); }
  .right { flex: 0 0 auto; text-align: right; }
  .views { font-weight: 700; font-size: .95rem; font-variant-numeric: tabular-nums; }
  .views::after { content: " 次"; color: var(--muted); font-size: .68rem; font-weight: 400; }
  .share { color: var(--muted); font-size: .7rem; margin-top: 1px; }
  .item.zero { opacity: .45; }
  .empty { color: var(--muted); text-align: center; padding: 20px 0; font-size: .9rem; }
  .tooltip {
    position: fixed; z-index: 50; pointer-events: none; min-width: 200px; max-width: 320px;
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 10px; font-size: .76rem; line-height: 1.45;
    box-shadow: 0 6px 18px rgba(0,0,0,.15);
  }
  .tooltip .tt-title { font-weight: 600; margin-bottom: 4px; }
  .tooltip .tt-row { display: flex; justify-content: space-between; gap: 10px; }
  .tooltip .tt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .tooltip .tt-empty { color: var(--muted); }
  .mini { color: var(--muted); font-size: .68rem; margin-top: 2px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 900px) {
    .charts { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .list { grid-template-columns: 1fr; }
    .legend { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>文章浏览量排行</h1>
    <div class="sub">数据来源：阅读量统计 · 已排除首页、聚合页与维护文档</div>
  </header>

  <div class="stats">
    <div class="stat"><span class="label">文章</span><span class="value" id="stat-count">—</span></div>
    <div class="stat"><span class="label">总浏览</span><span class="value" id="stat-total">—</span></div>
    <div class="stat"><span class="label">最高单篇</span><span class="value" id="stat-max">—</span></div>
    <div class="stat"><span class="label">平均浏览</span><span class="value" id="stat-avg">—</span></div>
  </div>

  <div class="charts">
    <div class="card">
      <h2>浏览量构成（Top 8 + 其他）</h2>
      <div class="pie-wrap">
        <svg id="pie" width="210" height="210" viewBox="0 0 210 210"></svg>
        <div class="pie-center"><div class="num" id="pie-total">—</div><div class="label">总浏览</div></div>
      </div>
      <ul class="legend" id="legend"></ul>
    </div>
    <div class="card">
      <h2>Top 8 柱状图</h2>
      <div class="bars" id="bars"><div class="empty">加载中…</div></div>
    </div>
  </div>

  <div class="card daily-card">
    <h2>每日新增阅读量（UTC+8 · 近 14 天）</h2>
    <div class="bars" id="daily-bars"><div class="empty">加载中…</div></div>
  </div>

  <div class="controls">
    <div class="search"><input type="search" id="filter" placeholder="按标题或路径筛选…"></div>
    <button id="refresh">刷新</button>
    <label class="auto"><input type="checkbox" id="auto">自动刷新</label>
  </div>

  <div class="error" id="error"></div>
  <div class="list" id="list"><div class="empty">加载中…</div></div>
  <div class="tooltip" id="tooltip" hidden></div>
</div>

<script>
const errorBox = document.getElementById('error')
const listBox = document.getElementById('list')
const filterInput = document.getElementById('filter')
const tooltip = document.getElementById('tooltip')
const MEDALS = ['🥇', '🥈', '🥉']
const PIE_COLORS = ['#2f6fed', '#4b8bb4', '#5ca7a1', '#6fa46e', '#b28a4e', '#b45f5f', '#a45f8e', '#7a7ac4', '#8a8f98']

function showTooltip(html, event) {
  tooltip.innerHTML = html
  tooltip.hidden = false
  const pad = 12
  const left = Math.min(event.clientX + pad, window.innerWidth - tooltip.offsetWidth - pad)
  const top = Math.min(event.clientY + pad, window.innerHeight - tooltip.offsetHeight - pad)
  tooltip.style.left = left + 'px'
  tooltip.style.top = top + 'px'
}

function hideTooltip() {
  tooltip.hidden = true
  tooltip.innerHTML = ''
}

async function load() {
  errorBox.style.display = 'none'
  try {
    const res = await fetch('/api/ranking')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    render(await res.json())
  } catch (error) {
    errorBox.textContent = '加载失败：' + error.message
    errorBox.style.display = 'block'
  }
}

function renderPie(items, total) {
  const svg = document.getElementById('pie')
  const ns = 'http://www.w3.org/2000/svg'
  svg.replaceChildren()
  document.getElementById('pie-total').textContent = total.toLocaleString('zh-CN')

  if (total === 0) {
    const circle = document.createElementNS(ns, 'circle')
    circle.setAttribute('cx', 105); circle.setAttribute('cy', 105); circle.setAttribute('r', 74)
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', 'rgba(107,114,128,.25)')
    circle.setAttribute('stroke-width', 28)
    svg.appendChild(circle)
    return
  }

  const ranked = items.filter((item) => item.views > 0)
  const top = ranked.slice(0, 8)
  const restViews = ranked.slice(8).reduce((sum, item) => sum + item.views, 0)
  const slices = top.map((item, i) => ({ name: item.title, value: item.views, color: PIE_COLORS[i] }))
  if (restViews > 0) slices.push({ name: '其他文章', value: restViews, color: PIE_COLORS[8] })

  const R = 74
  const C = 2 * Math.PI * R
  let offset = 0
  for (const slice of slices) {
    const frac = slice.value / total
    const circle = document.createElementNS(ns, 'circle')
    circle.setAttribute('cx', 105); circle.setAttribute('cy', 105); circle.setAttribute('r', R)
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke', slice.color)
    circle.setAttribute('stroke-width', 28)
    circle.setAttribute('stroke-dasharray', (Math.max(frac * C - 1.5, 0.5)).toFixed(2) + ' ' + C.toFixed(2))
    circle.setAttribute('stroke-dashoffset', (-offset).toFixed(2))
    svg.appendChild(circle)
    offset += frac * C
  }

  const legend = document.getElementById('legend')
  legend.replaceChildren(...slices.map((slice) => {
    const li = document.createElement('li')
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = slice.color
    const name = document.createElement('span'); name.className = 'name'; name.textContent = slice.name; name.title = slice.name
    const value = document.createElement('span'); value.className = 'value'
    value.textContent = slice.value.toLocaleString('zh-CN') + ' · ' + ((slice.value / total) * 100).toFixed(1) + '%'
    li.append(dot, name, value)
    return li
  }))
}

function renderBars(items) {
  const box = document.getElementById('bars')
  const ranked = items.filter((item) => item.views > 0).slice(0, 8)
  box.replaceChildren()
  if (ranked.length === 0) {
    box.innerHTML = '<div class="empty">暂无数据</div>'
    return
  }
  const max = ranked[0].views
  for (const item of ranked) {
    const col = document.createElement('div')
    col.className = 'bar-col'
    const val = document.createElement('div'); val.className = 'val'; val.textContent = item.views.toLocaleString('zh-CN'); val.title = item.title
    const area = document.createElement('div'); area.className = 'bar-area'
    const bar = document.createElement('div'); bar.className = 'bar'
    // 高度按弹性区百分比计算，数值标签与名称占固定高度，保证不超出图表区域
    bar.style.height = Math.max(Math.round((item.views / max) * 100), 2) + '%'
    area.appendChild(bar)
    const name = document.createElement('div'); name.className = 'name'
    name.textContent = item.title; name.title = item.title
    col.append(val, area, name)
    box.appendChild(col)
  }
}

function renderList(data) {
  const total = data.items.reduce((sum, item) => sum + item.views, 0)
  const max = Math.max(...data.items.map((item) => item.views), 1)
  const keyword = filterInput.value.trim().toLowerCase()
  const shown = data.items.filter((item) =>
    !keyword || item.title.toLowerCase().includes(keyword) || item.page.toLowerCase().includes(keyword)
  )

  if (shown.length === 0) {
    listBox.innerHTML = '<div class="empty">没有匹配的文章</div>'
    return
  }

  listBox.replaceChildren(...shown.map((item, index) => {
    const row = document.createElement('div')
    row.className = 'item'
    if (item.views === 0) row.classList.add('zero')

    const rank = document.createElement('div')
    rank.className = 'rank'
    rank.textContent = index < 3 && item.views > 0 ? MEDALS[index] : String(index + 1)

    const main = document.createElement('div')
    main.className = 'main'
    const title = document.createElement('a')
    title.className = 'title'; title.href = item.url; title.target = '_blank'; title.textContent = item.title
    const path = document.createElement('div')
    path.className = 'path'
    path.textContent = item.page + (item.date ? ' · 上传 ' + item.date.slice(0, 10) : '')
    const track = document.createElement('div')
    track.className = 'bar-track'
    const fill = document.createElement('div')
    fill.className = 'bar-fill'
    fill.style.width = Math.round((item.views / max) * 100) + '%'
    track.appendChild(fill)
    main.append(title, path, track)

    // 小字展示近 7 天每日新增（+N），悬停看明细
    if (Array.isArray(item.series) && item.series.length) {
      const recent = item.series.slice(-7)
      const mini = document.createElement('div')
      mini.className = 'mini'
      mini.textContent = '近7天 ' + recent.map((entry) => (entry.views > 0 ? '+' + entry.views : '0')).join(' ')
      mini.title = recent.map((entry) => entry.day.slice(5) + ' +' + entry.views).join(' · ')
      main.appendChild(mini)
    }

    const right = document.createElement('div')
    right.className = 'right'
    const views = document.createElement('div')
    views.className = 'views'; views.textContent = item.views.toLocaleString('zh-CN')
    const share = document.createElement('div')
    share.className = 'share'
    share.textContent = total > 0 ? ((item.views / total) * 100).toFixed(1) + '%' : '—'
    right.append(views, share)

    row.append(rank, main, right)
    return row
  }))
}

function renderDaily(daily) {
  const box = document.getElementById('daily-bars')
  box.replaceChildren()
  if (!Array.isArray(daily) || daily.length === 0) {
    box.innerHTML = '<div class="empty">暂无数据</div>'
    return
  }
  const max = Math.max(...daily.map((entry) => entry.views), 1)
  for (const entry of daily) {
    const col = document.createElement('div')
    col.className = 'bar-col'
    const val = document.createElement('div'); val.className = 'val'
    val.textContent = entry.views.toLocaleString('zh-CN'); val.title = entry.day
    const area = document.createElement('div'); area.className = 'bar-area'
    const bar = document.createElement('div'); bar.className = 'bar'
    bar.style.height = Math.max(Math.round((entry.views / max) * 100), entry.views > 0 ? 2 : 0) + '%'
    area.appendChild(bar)
    const name = document.createElement('div'); name.className = 'name'
    name.textContent = entry.day.slice(5) // MM-DD
    name.title = entry.day
    col.append(val, area, name)
    box.appendChild(col)

    // 悬停显示当天新增来源于哪些文章
    col.addEventListener('mouseenter', (event) => {
      let html = '<div class="tt-title">' + entry.day + ' · 新增 ' + entry.views.toLocaleString('zh-CN') + '</div>'
      const top = entry.top || []
      if (top.length === 0) {
        html += '<div class="tt-empty">当天没有阅读</div>'
      } else {
        for (const row of top.slice(0, 5)) {
          html += '<div class="tt-row"><span class="tt-name">' + row.title + '</span><span>+' + row.views + '</span></div>'
        }
        if (top.length > 5) html += '<div class="tt-empty">等 ' + top.length + ' 篇文章</div>'
      }
      showTooltip(html, event)
    })
    col.addEventListener('mousemove', (event) => {
      if (!tooltip.hidden) {
        const pad = 12
        tooltip.style.left = Math.min(event.clientX + pad, window.innerWidth - tooltip.offsetWidth - pad) + 'px'
        tooltip.style.top = Math.min(event.clientY + pad, window.innerHeight - tooltip.offsetHeight - pad) + 'px'
      }
    })
    col.addEventListener('mouseleave', hideTooltip)
  }
}

function render(data) {
  const total = data.items.reduce((sum, item) => sum + item.views, 0)
  const max = Math.max(...data.items.map((item) => item.views), 0)
  document.getElementById('stat-count').textContent = data.items.length
  document.getElementById('stat-total').textContent = total.toLocaleString('zh-CN')
  document.getElementById('stat-max').textContent = max.toLocaleString('zh-CN')
  document.getElementById('stat-avg').textContent = Math.round(total / Math.max(data.items.length, 1)).toLocaleString('zh-CN')
  renderPie(data.items, total)
  renderBars(data.items)
  renderDaily(data.daily)
  renderList(data)
}

document.getElementById('refresh').addEventListener('click', load)
filterInput.addEventListener('input', load)
let timer = null
document.getElementById('auto').addEventListener('change', (event) => {
  clearInterval(timer)
  if (event.target.checked) timer = setInterval(load, 30000)
})
load()
</script>
</body>
</html>
`
