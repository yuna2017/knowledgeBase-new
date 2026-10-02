# 需求反馈部署与迁移

生产由 GitHub Actions 的 `.github/workflows/deploy.yml` 部署，**不是 Cloudflare Pages 原生 Git 自动构建**。推送到 `main` 或手动运行该工作流触发发布。

维护命令在仓库根目录执行，使用 Node.js 24 和 `npm ci` 安装的 Wrangler。

## 必要配置

| 配置 | 位置与用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub Secret，执行迁移与发布 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret，Cloudflare 账号 ID |
| `CLOUDFLARE_PROJECT_NAME` | GitHub Secret，实际 Pages 项目名 |
| `DB` | 根 `wrangler.toml` 中的 D1 绑定，当前为 `yuna-kb-views` |
| `FEEDBACK_ADMIN_PASSWORD` | Pages Production Secret，反馈审计口令 |

部署 Token 在目标账号下需要三项权限：

- `Account → Cloudflare Pages → Edit`
- `Account → Workers Scripts → Edit`
- `Account → D1 → Edit`

Pages 预览环境默认没有 DB 绑定；需要完整预览时配置独立预览库。

## 自动发布顺序

工作流先运行统一验证，保存并复用同一提交的构建产物；仅当前 `main` 最新提交继续发布：

1. 执行远端数据库迁移。
2. 发布 Pages 静态站与根目录 `functions/`。
3. 发布旧地址的统计兼容 Worker。
4. 发布排行 Worker。

生产发布串行执行，迁移或发布步骤失败会停止后续步骤。接口不会在首次请求时自动建表或修复结构。

**修复脚本后推送新提交，让新提交触发部署；重跑旧工作流仍使用旧提交中的脚本。** 先看失败步骤的日志，再处理凭据、迁移或发布问题。

构建产物保留 3 天；过期后需重跑全部任务或重新触发工作流，不能仅重跑发布任务。

## 必要维护命令

手动操作远端库需提供上述 Token 和账号环境变量，且不要与 CI 迁移同时运行：

```sh
npm run db:migrate:remote -- --check   # 只检查迁移版本
npm run db:migrate:remote             # 应用尚未完成的迁移
npx --no-install wrangler pages deployment tail --project-name <项目名>
npx --no-install wrangler pages secret put FEEDBACK_ADMIN_PASSWORD --project-name <项目名>
```

迁移保留已有反馈和阅读量；中断后可重跑，已提交版本会跳过。后续改表新增迁移，不改已应用版本，也不删除迁移记录来绕过检查。`--check` 检查版本元数据，不是完整数据库一致性审计。

本地使用 `npm run dev:full`，或 `npm run db:migrate:local` 单独迁移；二者共用 `.wrangler/state`。完整验证见[架构与开发维护](architecture.md)。

## 常见失败

| 现象 | 处理 |
| --- | --- |
| 迁移被拒绝或鉴权失败 | 核对 Token 的 D1 Edit 权限、账号和 DB 绑定 |
| 接口报 `no such table/column` | 核对实际 DB，检查并补完迁移后再发布 |
| 迁移签名不一致或出现未知版本 | 使用匹配的新代码，恢复被改写的已应用迁移定义 |
| 审计登录返回 503 | 配置对应 Pages 环境的审计口令；改口令后旧会话失效 |

应用回滚使用 Pages 部署记录；不要通过删除新列或恢复整个 D1 来代替代码回滚。
