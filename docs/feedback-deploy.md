# 需求反馈渠道部署与数据库迁移

在仓库根目录运行命令。使用 Node 24 和 `npm ci` 安装的 Wrangler；版本由 lockfile 固定。

数据库升级入口只有 `scripts/migrate-d1.mjs`。**接口不再在请求中建表或补列；必须先迁移，再发布代码。** 本手册替代旧版“删表重建、手工逐列 ALTER、首次请求自动修复”的操作说明。

## 本地验证

```sh
npm ci
npm test
node scripts/migrate-d1.mjs --local --config wrangler.toml --database DB
node scripts/migrate-d1.mjs --local --config wrangler.toml --database DB --check
npm run dev:full
```

`dev:full` 会在缺少产物时构建站点，准备本地数据库并启动 Pages Functions 与带热更新的文档站。只预览文档排版时使用 `npm run dev`。本地 D1 与远端数据库隔离；如用 `--persist-to` 指定状态目录，迁移和 Pages dev 必须使用同一个目录。

在根目录 `.dev.vars` 中配置本地审计口令：

```dotenv
FEEDBACK_ADMIN_PASSWORD="本地开发专用口令"
```

该文件被 gitignore 排除。开发数据和口令都不应复制到生产。

## 生产配置

| 配置 | 位置与用途 |
| --- | --- |
| `DB` | 根 `wrangler.toml` 声明的 D1 绑定，现有库 `yuna-kb-views` |
| `FEEDBACK_ADMIN_PASSWORD` | Pages Production Secret，使用随机强口令 |
| `CLOUDFLARE_API_TOKEN` | GitHub Secret，用于迁移与发布；需要 D1、Pages、Worker 对应编辑权限 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret，Cloudflare 账号 |
| `CLOUDFLARE_PROJECT_NAME` | GitHub Secret，实际 Pages 项目名 |

`wrangler.toml` 的 Preview 默认不绑定生产库。需要完整远端预览时，先创建独立预览数据库、为 Preview 声明绑定和口令，并向迁移命令传入 `--env preview`。不要将生产反馈数据接到预览站点。

口令可以通过 Pages 控制台配置，也可以使用本地安装的 CLI：

```sh
npx --no-install wrangler pages secret put FEEDBACK_ADMIN_PASSWORD --project-name <项目名>
```

未配置审计口令时，普通反馈仍可提交，审计接口返回 503。更换口令会使已有审计会话失效。

Turnstile 已撤下；当前客户端和服务端均不依赖它。历史 `no_token` / `verify_down` 可疑反馈仍保留给维护者复核。

## 显式数据库迁移

迁移会处理同一 D1 库中的阅读统计、反馈、审计登录和迁移元数据，不删除原表、不清空数据。

| 版本 | 行为 |
| --- | --- |
| `001-adopt-schema` | 从冻结的 `worker/schema.sql` 建立空库；已有库先检查列，只补缺列，再补索引 |
| `002-feedback-idempotency` | 添加 `request_id`、`request_hash` 和 request ID 唯一索引 |

`worker/schema.sql` 是版本 001 的冻结基线，不是最新结构的独立安装脚本。后续改表应新增迁移版本，并加入 `migrations/runner.mjs`，不要改动已应用版本的 SQL 或校验签名。

生产迁移会写远端库，应在维护者安排的发布流程中运行。可先导出备份到仓库以外的安全位置：

```sh
npx --no-install wrangler d1 export DB --remote --config wrangler.toml --output <备份路径.sql>
node scripts/migrate-d1.mjs --remote --config wrangler.toml --database DB
node scripts/migrate-d1.mjs --remote --config wrangler.toml --database DB --check
```

迁移器要求明确选择 `--local` 或 `--remote`，没有隐式远端默认值。它会：

- 兼容空库、早期缺列库和已经手工补过列的现有库，保留原反馈和阅读统计。
- 在 `kb_schema_migrations` 记录版本、签名与应用时间；成功执行结构变更后才写完成标记。
- 遇到中断时允许再次执行；已经存在的列和索引会被跳过，未完成版本继续执行。
- 在已应用迁移的签名改变或数据库存在代码不认识的未来版本时失败，阻止错误版本继续操作。
- 在 `--check` 模式只检查版本元数据，发现待执行迁移时返回非零；此模式不会写库，也不是完整的数据库一致性审计。

迁移必须串行运行。CI 的生产发布采用同一并发组，手动维护时不要同时启动另一份迁移。失败时先查看明确错误并修复原因，然后重跑；不要删迁移记录来绕过版本检查，也不要重新运行旧版 DROP TABLE 手册。

## 发布顺序

生产 workflow 先通过统一验证，包括测试、构建、产物检查和本地 Functions 冒烟检查。发布 job 再检查提交版本，按顺序执行：

1. 远端数据库迁移。
2. 发布 Pages 静态站和根目录 `functions/`。
3. 发布保留给旧客户端使用的阅读计数 Worker。
4. 发布排行 Worker。

Pages 与旧计数 Worker 共用 `shared/views.js`，旧地址保留兼容。新计数请求在 D1 batch 中同时更新累计和每日统计，任意一步失败则一起回滚，并返回可观察的存储错误。

手动发布时同样先完成验证和迁移，并从根目录执行 Pages 部署：

```sh
npm test
npm run build
node scripts/migrate-d1.mjs --remote --config wrangler.toml --database DB
npx --no-install wrangler pages deploy vitepress-docs/.vitepress/dist --project-name <项目名>
```

排行元数据由构建流程生成；不要手工维护第二份文章分类或排除名单。Git 时间数据需要完整提交历史。

## 验证反馈与幂等

先在本地验证，再按发布安排验证线上。每次独立提交使用一个随机 `requestId`；同一次提交的自动重试、手动重试和刷新补发都复用它。

```powershell
$feedbackRequestId = [guid]::NewGuid().ToString()
$feedbackBody = @{
  requestId = $feedbackRequestId
  category = '其他'
  kind = 'gap'
  want = '部署自测'
  scene = '本地验证'
  elapsed = 9000
} | ConvertTo-Json

# 连续执行两次应返回同一个 ticket，数据库只新增一行。
Invoke-RestMethod -Method Post -Uri http://localhost:8788/api/feedback -ContentType 'application/json' -Body $feedbackBody
Invoke-RestMethod -Method Post -Uri http://localhost:8788/api/feedback -ContentType 'application/json' -Body $feedbackBody
```

相同 ID 携带不同业务内容返回 409，不覆盖原反馈，也不返回原查询码。旧客户端和无 JavaScript 的原生表单仍可提交；没有客户端 ID 的请求由服务器分别生成 ID，因此跨请求去重需要调用方提供稳定 ID。

浏览器需要确认：

- 正常提交跳到带查询码的完成页；HTTP 200 但缺少有效查询码时仍保留草稿。
- 模拟提交成功但响应丢失，再重试仍只有一行、返回原查询码。
- 关闭页面再打开，补发继续使用原 ID，成功后显示查询码与回执入口。
- 补发旧反馈时，另外编辑的新草稿不会被清除。
- 关闭 JavaScript，原生表单仍能提交并跳到带查询码的完成页。
- 未登录读审计列表得到 401，正确口令可查看、筛选和处理反馈。

测试分别覆盖接口与旧库迁移、真实表单脚本的重试恢复、统计兼容入口与事务回滚。`npm test` 不接触线上数据；本地 Functions 冒烟检查也使用隔离 D1 状态目录。

## 维护与故障处理

每天的 `feedback-notify.yml` 根据待处理反馈开关提醒 issue。明细和快照脚本沿用：

```sh
node scripts/feedback-report.mjs
node scripts/feedback-report.mjs --write
```

它们直连 Cloudflare API，需要相应账号配置；不要将包含私人反馈的导出结果放进公开仓库。

| 症状 | 检查 |
| --- | --- |
| 提交 500 或统计 503，日志有 `no such table/column` | 检查 DB 绑定和迁移版本；运行迁移后重新验证。接口不会自动改表 |
| 迁移报告签名不一致 | 恢复已应用的迁移定义，另加新迁移；不要篡改元数据 |
| 迁移报告未知版本 | 使用与数据库匹配的新代码；旧部署只回滚应用，不逆向迁移数据库 |
| 提交 409 | 同一个 request ID 被用于不同内容；新的反馈必须使用新 ID |
| 审计提示未配置 | 检查对应环境的口令 Secret 和部署 |
| 状态页显示快照 | 实时 API 不可达；查看接口日志，不能把快照当成实时零条 |
| 提交成功但仍提示确认中 | 回执未完整到达；保留同一个 ID 重试取得原查询码 |

```sh
npx --no-install wrangler pages deployment tail --project-name <项目名>
```

应用回滚通过 Pages 的部署记录进行。本次迁移仅增表、列和索引，保留旧代码使用的字段；不要为应用回滚删除新列。D1 整库恢复会同时恢复阅读计数和反馈，不能将它当成普通代码回滚步骤。

本次改造已验证本地迁移与测试；是否已执行生产迁移、是否发布到真实 Cloudflare 账号，必须以维护者的部署记录为准。
