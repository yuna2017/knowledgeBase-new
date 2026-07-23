# 贡献指南

欢迎补充和修正知识库内容。提交前请确认：

- 仓库地址为：https://github.com/yuna2017/knowledgeBase-new
- 内容面向燕大师生的实际问题，步骤清晰可复现
- 涉及额度、价格、入口、版本、套餐或政策时，注明核实时间并引用官方来源
- 区分“官方规则”“登录后实测”和“个人经验”，不要把个案写成全校统一政策
- 涉及海外服务时，说明中国大陆是否属于官方支持地区，以及注册、支付和网络限制
- 命令必须实际验证；会删除文件、丢弃改动、公开端口或执行远程脚本时，提前写明风险
- 不记录无法长期维护的促销数字；确有必要时写清活动截止日期
- 图片放在 `vitepress-docs/images/` 下，并在文章中使用相对路径引用
- 每篇 Markdown 顶部保留 `tags`，数量为 1 到 3 个

## 添加或修改作者

作者信息统一写在文章顶部的 frontmatter 中，不要再在正文里手写头像和作者卡片。

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

- `authors` 中的值必须与 `authorProfiles` 的键完全一致
- `displayName` 控制站点显示的作者名
- `github` 用于生成 GitHub 主页链接和头像地址
- 添加后无需在 Markdown 正文中重复填写作者信息
