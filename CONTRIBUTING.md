# 贡献指南

欢迎补充和修正知识库内容，提交前请对照以下清单。

## 内容要求

- 面向燕大师生的实际问题，步骤清晰可复现；命令必须实际验证过
- 涉及额度、价格、入口、版本、套餐或政策时，注明核实时间并引用官方来源；不记录无法长期维护的促销数字，确有必要时写清活动截止日期
- 区分“官方规则”“登录后实测”和“个人经验”，不要把个案写成全校统一政策
- 涉及海外服务时，说明中国大陆是否属于官方支持地区，以及注册、支付和网络限制
- 命令会删除文件、丢弃改动、公开端口或执行远程脚本时，提前写明风险

术语用法和时效标注的细则见[内容术语与维护规范](https://docs.yuna.team/CONTEXT)。

## 格式规范

- 图片放在 `vitepress-docs/images/` 下，并用相对路径引用
- frontmatter 里保留 1 到 3 个 `tags`
- `description` 不写时自动取正文第一段。长度必须在 80 到 130 字之间，构建时会检查，不合格直接失败
- 首段是免责声明、转载说明，或以冒号结尾只有半句话时，必须手写 `description`
- 新增 `tech-*` / `mcp-*` 文档后，要在 `tech-index.md` 里补一条链接，漏收同样会让检查失败

## 站内链接

除标准 Markdown 链接外，支持 Obsidian 风格的双向链接，直接写文件名（不带 `.md`）：

```markdown
详见 [[tech-git-github]]，也可以自定义显示文字：[[tech-git-github|Git 入门]]
```

## 标签

每个标签都有自己的页面（`/tags/<标签名>`，空格换成连字符，例如
`Vibe Coding` → `/tags/Vibe-Coding`）。新增标签前先在[标签页](https://docs.yuna.team/tags)
看有没有近义的，优先复用已有标签。

## 作者

作者写在文章顶部的 frontmatter 中，不要在正文里手写头像和作者卡片；多位作者依次列出：

```yaml
---
tags:
  - 示例标签
authors:
  - author1
  - author2
---
```

然后在 `vitepress-docs/.vitepress/theme/authors.ts` 的 `authorProfiles` 中登记：

```ts
'文章 frontmatter 里填的名称': {
  displayName: '站点中显示的名称',
  github: 'your-github-id'
},
```

`authors` 的值必须与 `authorProfiles` 的键完全一致，未登记会让 PR 检查和构建失败。
不填 `authors` 时，默认显示为“燕山大学大学生网络信息协会”。

## 提交前

```sh
npm run dev     # 本地预览，确认排版无误
npm run build   # 完整检查：链接可达性、导航收录、description 长度、作者登记
```

bun / pnpm / yarn 用户对应为 `bun run dev` / `pnpm dev` / `yarn dev`。

## 这些不用手写

- 每篇文章底部的「页面历史」和全站[最近更新](https://docs.yuna.team/recent)由 git 提交记录自动生成，无需手写。CI 里 `actions/checkout` 必须保持 `fetch-depth: 0`，否则所有页面显示同一个时间
