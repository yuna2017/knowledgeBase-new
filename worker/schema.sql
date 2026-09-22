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
--
-- ⚠️ 这份建表语句在 functions/api/feedback/[[path]].js 的 schemaStatements()
-- 里有一份手工副本（Pages Functions 没有文件系统，读不到这个文件）。
-- scripts/test-feedback-api.mjs 会把两边建出来的表结构逐列比对，不一致就失败。
-- 改这里必须同时改那边。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category       TEXT    NOT NULL,           -- 聚合用的分类，枚举见接口里的 CATEGORIES；**不可修改**
  kind           TEXT    NOT NULL,           -- gap（缺口） / fix（勘误）
  want           TEXT    NOT NULL,
  scene          TEXT    NOT NULL,
  article        TEXT,                       -- kind=fix 时，要修正的是哪一篇
  contact        TEXT,
  status         TEXT    NOT NULL DEFAULT 'new',  -- new / planned / done / rejected
  resolved_label TEXT,                       -- 已上线：给读者看的短标签
  resolved_url   TEXT,                       -- 已上线：文章地址
  reject_reason  TEXT,                       -- 不采纳：为什么（提交者凭编号能看到，空着就显示兜底说明）
  suspicious     INTEGER NOT NULL DEFAULT 0,  -- 蜜罐命中 / 填得太快，只标记不丢弃
  flag_reason    TEXT,                        -- 可疑的原因：trap / fast / manual
                                              -- （历史值 no_token / verify_down 来自已下线的 Turnstile）
  ip_hash        TEXT,                        -- 加盐 SHA-256，不存原始 IP（限流已去掉，仍在记录）
  created_at     INTEGER NOT NULL,            -- epoch 毫秒
  updated_at     INTEGER,
  ticket         TEXT                         -- 查询码（形如 K7M2-9Q4P），提交者凭它查自己那条
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at);

-- 查询码唯一。NULL 在 SQLite 里互不相等，所以迁移前留下的空值不会互相冲突。
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_ticket ON feedback (ticket);

-- 审计口令的失败计数，用于锁定暴力尝试
CREATE TABLE IF NOT EXISTS feedback_login_attempts (
  ip           TEXT    PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
