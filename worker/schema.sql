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

-- ---------------------------------------------------------------------------
-- 需求反馈（/wanted 系列页面用）
--
-- 由 Pages Function functions/api/feedback/[[path]].js 按需创建并读写，
-- 记在这里是为了让建表和接口在同一处可查。ip_hash 是加盐 SHA-256，
-- 只用于限频，**不存原始 IP**。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT    NOT NULL,
  kind       TEXT    NOT NULL,          -- gap（缺口） / fix（勘误）
  want       TEXT    NOT NULL,
  scene      TEXT    NOT NULL,
  contact    TEXT,
  status     TEXT    NOT NULL DEFAULT 'new',  -- new / planned / done / rejected
  ip_hash    TEXT,
  created_at INTEGER NOT NULL           -- epoch 毫秒
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at);

-- 审计口令的失败计数，用于锁定暴力尝试
CREATE TABLE IF NOT EXISTS feedback_login_attempts (
  ip           TEXT    PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
