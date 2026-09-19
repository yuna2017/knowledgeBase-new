CREATE TABLE IF NOT EXISTS counters (
  page  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);

-- 供首页 Top 排行按阅读量倒序快速取前几名
CREATE INDEX IF NOT EXISTS idx_counters_views ON counters (views DESC);

-- 每日新增阅读量（day 为 UTC+8 日期，YYYY-MM-DD），由 Worker 计数时自动写入
CREATE TABLE IF NOT EXISTS daily_views (
  page  TEXT NOT NULL,
  day   TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page, day)
);

-- 供排行页按日聚合
CREATE INDEX IF NOT EXISTS idx_daily_views_day ON daily_views (day DESC);
