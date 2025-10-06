import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'YUNA KnowledgeBase',
  description: '面向问题的燕大师生在线生活指南',
  lang: 'zh-CN',
  base: '/',
  
    
  head: [
    ['link', { rel: 'icon', href: '/images/logo.png' }]
  ],
  themeConfig: {
    nav: [
      { text: '问题速查', link: '/moudle/intro/' },
      { text: '校园网', link: '/moudle/network/' },
      { text: '一网通办', link: '/moudle/service/' },
      { text: '正版化', link: '/moudle/ms/' },
      { text: '校园邮箱', link: '/moudle/mail/' },
      { text: '关于我们', link: '/moudle/about/' }
    ],

    // 左侧侧边栏配置
    sidebar: {
      '/moudle/intro/': [
        {
          text: '问题速查',
          items: [
            { text: '我想上网', link: '/moudle/intro/#我想上网' },
            { text: '我想办点事、查些东西', link: '/moudle/intro/#我想办点事、查些东西' },
            { text: '听说学校提供正版软件激活？', link: '/moudle/intro/#听说学校提供正版软件激活' },
            { text: '校园邮箱是啥？', link: '/moudle/intro/#校园邮箱是啥' },
          ]
        }
      ],
      '/moudle/network/': [
        {
          text: '校园网简介',
          items: [
            { text: '概览', link: '/moudle/network/index' },
            { text: '如何接入', link: '/moudle/network/#如何接入' },
            { text: '要不要办理校园宽带（校园卡）业务？', link: '/moudle/network/#要不要办理校园宽带-校园卡-业务' },
          ]
        },
        {
          text: '答疑',
          items: [
            { text:'概览', link: '/moudle/network/qa/' }
          ]
        },
        {
          text: '连接与认证方式',
          items: [
            { text:'概览', link: '/moudle/network/connect/' },
            { text:'首次连接', link: '/moudle/network/connect#首次连接' },
            { text:'非首次连接', link: '/moudle/network/connect#非首次连接' },
            { text:'进入自助服务', link: '/moudle/network/connect#进入自助服务' },
          ]
        },
      ],
      '/moudle/service/': [
        { text: '一网通办', 
          items: [ 
            { text: '概览', link: '/moudle/service/' }, 
            { text: '简介', link: '/moudle/service/index#简介' },
            { text: '访问方式及使用指南', link: '/moudle/service/index#访问方式及使用指南' },
            { text: '常用功能介绍', link: '/moudle/service/index#常用功能介绍' }
          ] 
        },
        { text: 'VPN', 
          items: [ 
            { text: '概览', link: '/moudle/service/vpn/' }
          ] 
        },
      ],
      '/moudle/ms/': [
        { text: '正版化', 
          items: [ 
            { text: '概览', link: '/moudle/ms/' },
            { text: '访问方式', link: '/moudle/ms/#访问方式' },
            { text: '常用软件', link: '/moudle/ms/#常用软件' }
           ] 
        }
      ],
      '/moudle/mail/': [
        { text: '校园邮箱',
           items: [
             { text: '概览', link: '/moudle/mail/' },
             { text: '简介', link: '/moudle/mail/#简介' },
             { text: '账号申请与管理', link: '/moudle/mail/#账号申请与管理' },
             { text: '可以白嫖的工具', link: '/moudle/mail/#可以白嫖的工具' }, 
            ] 
        },
        {
          text: '常见问题',
          items: [
            { text: '概览', link: '/moudle/mail/qa/' }
          ]
        },
      ],
      '/moudle/about/': [
        {
          text: '关于我们',
          items: [
            { text: '项目概览', link: '/moudle/about/' },
            { text: '我们在做什么', link: '/moudle/about/#我们在做什么' },
            { text: '参与共建', link: '/moudle/about/#参与共建' },
            { text: '内容更新与许可', link: '/moudle/about/#内容更新与许可' },
            { text: '联系方式', link: '/moudle/about/#联系方式' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/yuna2017/knowledgeBase-new' }
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