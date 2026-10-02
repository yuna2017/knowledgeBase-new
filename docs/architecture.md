# 架构与开发维护

站点用 VitePress 生成静态 HTML；阅读统计和反馈由同源 Pages Functions 提供。运行接口不参与文档构建。

## 结构边界

| 位置 | 职责 |
| --- | --- |
| `vitepress-docs/` | 文档、动态标签页与构建数据入口 |
| `vitepress-docs/.vitepress/` | 站点配置、主题和按页面加载的交互组件 |
| `shared/documents/` | 文档目录、元数据、路径、页面分类及 Git 时间 |
| `shared/search.mjs` | 构建与浏览器共用的中文分词和搜索规则 |
| `shared/feedback-*.js` | 反馈契约、请求标识与提交状态 |
| `shared/views.js` | Pages 与旧统计 Worker 共用的计数逻辑 |
| `functions/`、`worker/`、`worker-ranking/` | 同源接口、旧统计兼容入口、排行服务 |
| `migrations/` | 显式数据库升级和版本校验 |

标签、首页推荐、最近更新、排行清单和检查脚本统一读取文档目录。元数据或页面分类规则改在共享层，不在各组件中另写解析逻辑。

反馈组件随相应页面加载，首页组件及文章元数据随首页加载；调整加载边界时保留 SSR 输出，尤其是无 JavaScript 也能提交的原生反馈表单。

## 本地开发

使用 Node.js 24，在仓库根目录运行：

```sh
npm ci
npm run dev             # 仅文档站
npm run dev:full        # 文档热更新、Pages Functions、本地 D1
```

完整环境访问 `http://127.0.0.1:5173`，`/api` 代理到本机 `8788`。可用 `DOCS_WEB_PORT`、`DOCS_API_PORT` 改端口；退出时关闭本次启动的服务。

`dev:full` 自动迁移本地库，缺少静态产物时先构建。本地状态统一放在 `.wrangler/state`，与 `npm run db:migrate:local` 一致。

复制 `.dev.vars.example` 为 `.dev.vars` 设置审计口令，也可设置环境变量 `FEEDBACK_ADMIN_PASSWORD`；均未配置时使用启动提示中的本地默认口令。

## 数据库约定

接口不建表、不补列。结构变更新增迁移版本；`worker/schema.sql` 是版本 001 的冻结基线，已应用的迁移定义和校验签名不可改写。

同一条反馈重试时复用 `requestId`，相同内容返回原查询码；修改内容后使用新 ID。累计与每日阅读量由同一 D1 batch 更新。

## 验证

| 命令 | 用途 |
| --- | --- |
| `npm test` | 文档、搜索、接口、迁移和检查器回归，含本地模拟服务上的真实 Wrangler 远端 CLI 测试 |
| `npm run build` | 源文档检查、静态构建、生成 HTML 的链接与锚点检查、搜索验证 |
| `npm run test:local` | 隔离本地 D1 上的真实 Pages 集成检查，结束后清理测试库 |
| `npm run verify` | 以上完整验证，加排行清单生成和 Worker 发布包检查 |

PR 与生产发布复用同一验证流程；Git 时间和排行生成需要完整提交历史。生产配置、迁移顺序及失败重跑见[部署说明](feedback-deploy.md)。
