# 贡献指南

欢迎补充和修正知识库内容。仓库地址：<https://github.com/yuna2017/knowledgeBase-new>。

提交前请对照以下清单确认：

## 内容要求

- 内容面向燕大师生的实际问题，步骤清晰可复现
- 涉及额度、价格、入口、版本、套餐或政策时，注明核实时间并引用官方来源
- 区分“官方规则”“登录后实测”和“个人经验”，不要把个案写成全校统一政策
- 涉及海外服务时，说明中国大陆是否属于官方支持地区，以及注册、支付和网络限制
- 不记录无法长期维护的促销数字；确有必要时写清活动截止日期

## 命令与风险

- 命令必须实际验证
- 会删除文件、丢弃改动、公开端口或执行远程脚本时，提前写明风险

## 格式规范

- 图片放在 `vitepress-docs/images/` 下，并在文章中使用相对路径引用
- 每篇 Markdown 顶部保留 `tags`，数量为 1 到 3 个
- frontmatter 的结束分隔符 `---` 只写一次，多写一行会让 YAML 解析失败
- 搜索引擎摘要和分享卡片的描述，默认自动取正文第一段（或第一组列表）。想自己指定时，在 frontmatter 里加一行 `description:`，控制在 150 字以内

## 站内链接

除标准 Markdown 链接外，支持 Obsidian 风格的双向链接，直接写文件名（不带 `.md`）：

```markdown
详见 [[tech-git-github]]，也可以自定义显示文字：[[tech-git-github|Git 入门]]
```

站内链接在阅读时会有悬停预览，读者不用跳走就能看到目标页内容。

## 标签

每个标签都有自己的页面，地址是 `/tags/<标签名>`（名字里的空格换成连字符，例如
`Vibe Coding` → `/tags/Vibe-Coding`）。新增标签前先在[标签页](https://docs.yuna.team/tags)
看一眼有没有近义的，优先复用已有标签。

## 页面历史

每篇文章底部的「页面历史」由 git 提交记录自动生成，不需要手写。它依赖完整的提交历史：
CI 里 `actions/checkout` 必须保持 `fetch-depth: 0`，浅克隆会让所有页面显示同一个时间。

全站的[最近更新](https://docs.yuna.team/recent)页同理，数据来自各文件最后一次提交。

## 提交前本地预览

- commit 之前先运行 `npm run dev`（bun / pnpm / yarn 用户对应为 `bun run dev` / `pnpm dev` / `yarn dev`），在本地预览中确认文章排版无误后再提交

## 添加或修改作者

作者信息统一写在文章顶部的 frontmatter 中，不要再在正文里手写头像和作者卡片：

```yaml
---
tags:
  - 示例标签
authors:
  - author
---
```

一篇文章有多位作者时，可以依次添加：

```yaml
authors:
  - author1
  - author2
```

然后在 `vitepress-docs/.vitepress/theme/authors.ts` 的 `authorProfiles` 中加入对应关系：

```ts
'文章开头authors填入的名称': {
  displayName: '站点中显示的名称',
  github: 'your-github-id'
},
```

注意事项：

- `authors` 中的值必须与 `authorProfiles` 的键完全一致
- `displayName` 控制站点显示的作者名
- `github` 用于生成 GitHub 主页链接和头像地址
- 添加后无需在 Markdown 正文中重复填写作者信息
- 作者信息为空时，文章默认显示作者为“燕山大学大学生网络信息协会”
- 作者信息不为空但未在 `authorProfiles` 中登记时，PR 文档检查和静态构建将失败
