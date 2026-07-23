# YUNA KnowledgeBase

YUNA KnowledgeBase 是面向燕山大学师生的在线生活指南，由燕山大学学生网络信息协会维护。内容以解决实际问题为主，包括校园服务、学习资源、学生权益和常用技术工具。

分类方式已从旧版固定栏目（校园必备服务、免费资源、学习与科研、前沿工具）迁移为 **tags** 体系。每篇文章可以拥有多个 tags，通过 tags 聚合和检索来发现内容。

- [文档首页](/)
- [标签索引](/tags)
- [贡献指南](/CONTRIBUTING)

## 使用说明

- 校园套餐、办事流程和系统界面可能按学期调整，请以学校当期通知和登录后的页面为准。
- 海外服务的访问、注册、支付和地区政策可能不适用于中国大陆。技术上能够连接，不代表符合服务商条款。
- 免费额度、软件版本和学生优惠变化较快。文章中的核验日期只表示当时状态，使用前仍应打开官方链接确认。
- 涉及成绩、培养方案、推免、转专业和毕业要求时，以教务处、学院及本人适用年级的正式文件为准。
- 每篇文章可以使用多个 tag，但应优先复用已有标签；确需新增时，要同步检查导航和近义标签。发现标签混乱时，可按[贡献指南](/CONTRIBUTING)提交修正。

## 参与维护

内容有误或你有新的校内实测经验，可以阅读[贡献指南](/CONTRIBUTING)后提交 Pull Request，也可以联系 <liugu0825@qq.com>。

维护资料：

- [标签索引](/tags)
- [内容术语与维护规范](/CONTEXT)

## 本地运行

```sh
npm ci
npm run dev
```

构建并同时检查本地文档链接与页面可达性：

```sh
npm run build
```

站点由 VitePress 构建，正文位于 `vitepress-docs`，静态图片位于 `vitepress-docs/images`。

## 仓库

- [GitHub：yuna2017/knowledgeBase-new](https://github.com/yuna2017/knowledgeBase-new)

本项目使用 MIT License。
