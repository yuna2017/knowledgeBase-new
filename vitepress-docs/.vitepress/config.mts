import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'YUNA KnowledgeBase',
  description: '面向问题的燕大师生在线生活指南',
  lang: 'zh-CN',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/images/logo.png' }]
  ],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      {
        text: '校园服务',
        items: [
          { text: '校园网', link: '/campus-network-index' },
          { text: '一网通办', link: '/campus-service-index' },
          { text: '校园正版化', link: '/campus-ms-index' },
          { text: '校园邮箱', link: '/campus-mail-index' }
        ]
      },
      { text: '技术资源', link: '/tech-index' },
      { text: '标签', link: '/tags' },
      {
        text: '参与维护',
        items: [
          { text: '贡献指南', link: '/CONTRIBUTING' },
          { text: '仓库说明', link: '/README' },
          { text: '内容规范', link: '/CONTEXT' }
        ]
      }
    ],

    sidebar: [
      {
        text: '文档入口',
        items: [
          { text: '标签', link: '/tags' }
        ]
      },
      {
        text: '校园网',
        items: [
          { text: '校园网简介', link: '/campus-network-index' },
          { text: '连接与认证', link: '/campus-network-connect' },
          { text: '常见问题', link: '/campus-network-qa' },
          { text: '学校 WebVPN', link: '/campus-network-vpn' }
        ]
      },
      {
        text: '校园服务',
        items: [
          { text: '一网通办', link: '/campus-service-index' },
          { text: '校园正版化', link: '/campus-ms-index' },
          { text: '校园邮箱', link: '/campus-mail-index' }
        ]
      },
      {
        text: '技术资源',
        collapsed: true,
        items: [
          { text: '技术资源导航', link: '/tech-index' },
          { text: 'GitHub 学生包与教育优惠', link: '/tech-student-pack' },
          { text: 'Cloudflare 免费额度', link: '/tech-cloudflare' },
          { text: '免费云资源', link: '/tech-free-cloud' },
          { text: '免费 AI API 额度', link: '/tech-free-ai' },
          { text: '域名申请与管理', link: '/tech-domain' },
          { text: '文献与科研工具', link: '/tech-research-tools' },
          { text: 'MOOC 与免费学习资源', link: '/tech-mooc' },
          { text: 'Git 与 GitHub 入门', link: '/tech-git-github' },
          { text: '免费与开源替代软件', link: '/tech-oss-alternatives' },
          { text: 'LLM 常用术语', link: '/tech-llm-glossary' },
          { text: 'Vibe Coding 入门', link: '/tech-vibecoding' },
          { text: 'AI 编程工具', link: '/tech-coding-tools' },
          { text: 'Vibe Coding 使用指南', link: '/tech-vibe-coding-guide' },
          { text: 'AI Skill 与 MCP 基础', link: '/tech-skills-mcp' },
          { text: 'MCP 与 Skills 推荐', link: '/mcp-recommendation' },
          { text: 'CC Switch 简介', link: '/tech-cc-switch' },
          { text: 'API 中转站简介', link: '/tech-relay' },
          { text: '自托管入门', link: '/tech-self-hosting' }
        ]
      },
      {
        text: '项目维护',
        collapsed: true,
        items: [
          { text: '仓库说明', link: '/README' },
          { text: '内容术语与维护规范', link: '/CONTEXT' },
          { text: '贡献指南', link: '/CONTRIBUTING' }
        ]
      }
    ],

    outline: [2, 3],
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yuna2017/knowledgeBase-new' }
    ],
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    footer: {
      message: 'MIT Licensed',
      copyright: 'Copyright © 2017-2026 燕山大学大学生网络信息协会'
    }
  }
})
