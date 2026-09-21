---
layout: home

# 首页的 <title> 默认只有站点名「YUNA KnowledgeBase」——18 个字符，
# 搜索引擎会判为标题过短，也说不出这个站是做什么的。
# titleTemplate 给它补一个后缀，渲染成「YUNA KnowledgeBase | 燕山大学师生在线生活指南」。
titleTemplate: 燕山大学师生在线生活指南
description: YUNA KnowledgeBase 是燕山大学学生网络信息协会维护的在线生活指南，覆盖校园网认证、一网通办、正版软件、校园邮箱，以及学生权益、免费额度、科研工具和 AI 编程等技术资源。

hero:
  name: "YUNA KnowledgeBase"
  text: "面向问题的燕大师生在线生活指南"
  tagline: "校园服务、学习资源、学生权益与常用技术工具"
  image:
    src: /images/logo.png
    alt: YUNA KnowledgeBase Logo
  actions:
    - theme: brand
      text: 按标签浏览
      link: /tags
    - theme: alt
      text: 校园网指南
      link: /campus-network-index

# 这一行卡片不再用默认主题的 features 键：features 会被 VPHomeFeatures
# 整行接管渲染（没有插槽可以只换其中一张），而第三个格子要放交互式的
# 「随便看看」。换成自定义键后，前两张卡片仍然在 frontmatter 里编辑，
# 由 theme/HomeCards.vue 渲染。标签入口没有消失——导航「标签」、hero 的
# 「按标签浏览」和下面《使用说明》里都还指向 /tags。
homeCards:
  - title: 校园服务
    details: 校园网连接与认证、一网通办办事入口、正版软件下载、校园邮箱与 WebVPN 校外访问，以及学生社团与组织、常用部门公众号、在校点外卖等日常信息。
    link: /campus-index
    linkText: 查看
  - title: 技术资源
    details: 学生权益与教育优惠、免费额度与开源替代软件、文献管理与科研工具、MOOC 自学路线，以及 AI 编程、Vibe Coding、域名与 Cloudflare、自托管等技术实践。
    link: /tech-index
    linkText: 查看
---

## 使用说明

校园政策、软件版本、免费额度和第三方服务条款都可能变化。使用文档中的步骤前，请同时核对学校或服务商的最新官方页面。

- 不知道从哪里开始时，打开[标签索引](/tags)按主题浏览。
- 校园网、一网通办、正版化、校园邮箱和生活服务都在[校园服务导航](/campus-index)里；技术类内容看[技术资源导航](/tech-index)。
- 想知道最近改了什么，看[最近更新](/recent)。
- 站内搜索可查找标题、正文和关键词。
- 了解项目维护方式时，可查看[仓库说明](/README)。
- 发现内容有误时，请阅读[贡献指南](/CONTRIBUTING)。
