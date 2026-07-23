CREATE TABLE IF NOT EXISTS counters (
  page  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);

-- 供首页 Top 排行按阅读量倒序快速取前几名
CREATE INDEX IF NOT EXISTS idx_counters_views ON counters (views DESC);
