# YUNA KnowledgeBase

面向燕山大学师生的校园生活与学习指南，由燕山大学大学生网络信息协会维护，使用 VitePress 构建。

[在线阅读](https://docs.yuna.team) · [提交反馈](https://docs.yuna.team/wanted) · [贡献指南](CONTRIBUTING.md)

## 本地运行

使用 Node.js 24，在仓库根目录执行：

```sh
npm ci
npm run dev
```

| 命令 | 用途 |
| --- | --- |
| `npm run dev:full` | 启动文档热更新、本地接口和本地数据库 |
| `npm run build` | 构建站点，检查链接、锚点和搜索 |
| `npm run verify` | 执行提交前的完整验证 |

完整环境访问 `http://127.0.0.1:5173`。本地审计口令可配置在 `.dev.vars`，示例见 [.dev.vars.example](.dev.vars.example)。

## 参与维护

文章的术语、标签和时效信息约定见[内容规范](vitepress-docs/CONTEXT.md)。

生产环境通过 GitHub Actions 发布到 Cloudflare Pages；数据库迁移在发布前自动执行。

内容采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans) 许可。参与修改请阅读贡献指南。
