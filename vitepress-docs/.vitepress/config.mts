import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'YUNA KnowledgeBase',
  description: '面向问题的燕大师生在线生活指南',
  lang: 'zh-CN',
  base: '/',
  
    
  head: [
    ['link', { rel: 'icon', href: '/logo.png' }]
  ],
  themeConfig: {
    nav: [
      { text: '问题速查', link: '/moudle/intro/' },
      { text: '校园网', link: '/moudle/network/' },
      { text: '在线服务', link: '/moudle/service/' },
      { text: '正版化', link: '/moudle/ms/' },
      { text: '校园邮箱', link: '/moudle/mail/' },
      { text: '关于我们', link: '/moudle/about/' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'MIT Licensed',
      copyright: 'Copyright © 2017-2025 燕山大学大学生网络信息协会'
    }
  },
})