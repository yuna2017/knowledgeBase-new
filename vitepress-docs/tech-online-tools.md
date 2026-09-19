---
description: 按用途整理的实用在线工具网址：Markdown 转 PDF、随机数生成、Base64 编解码、JSON 格式化、时间戳转换、图片压缩、二维码生成等，并附敏感内容不要粘贴到在线工具的隐私提醒。
tags:
  - 免费资源
  - 在线工具
---

# 实用在线工具网址

按用途整理的常用在线工具入口。最近核对：2026 年 8 月。工具站点可能调整域名或改为收费，使用前以页面当前状态为准。

## 文档与格式转换

| 用途 | 工具 | 说明 |
|------|------|------|
| Markdown 转 PDF | [markdowntoword.io](https://markdowntoword.io/zh/tools/markdown-to-pdf) | 网页端粘贴 Markdown 直接导出 PDF |
| PDF 合并 / 拆分 / 压缩 | [iLovePDF](https://www.ilovepdf.com/zh-cn) | 文件会上传到其服务器，不要上传敏感文档 |

更稳妥的做法是本地转换：VS Code 安装 **Markdown PDF** 插件，或使用 [Pandoc](https://pandoc.org/)（`pandoc 文件.md -o 文件.pdf`），文件不出本机。

## 编码与文本

| 用途 | 工具 | 说明 |
|------|------|------|
| Base64 编解码 | [base64encode.org](https://www.base64encode.org/zh/) / [base64decode.org](https://www.base64decode.org/zh/) | 简单直接 |
| 编解码 / 哈希 / 进制换算等一站式 | [CyberChef](https://gchq.github.io/CyberChef/) | 开源，纯浏览器本地运行，离线可用，推荐处理敏感内容时使用 |
| 正则表达式测试 | [regex101.com](https://regex101.com/) | 带解释与多种语言模式 |
| 文本 / 代码对比 | [Diffchecker](https://www.diffchecker.com/) | 粘贴两端文本显示差异 |

## 随机数与抽签

| 用途 | 工具 | 说明 |
|------|------|------|
| 真随机数 | [random.org](https://www.random.org/) | 基于大气噪声的真随机源，提供随机数、掷硬币、抽签、密码生成等 |

程序里的 `Math.random()` 等属于伪随机，抽奖、生成密码等重要用途建议用真随机源。

## 开发常用

| 用途 | 工具 | 说明 |
|------|------|------|
| JSON 格式化 / 校验 | [json.cn](https://www.json.cn/) | 国内访问稳定 |
| 时间戳转换 | [tool.lu 时间戳](https://tool.lu/timestamp/) | 与 Unix 时间戳互转 |
| 其他常用小工具 | [tool.lu](https://tool.lu/) | 进制转换、URL 编解码、哈希计算等在线工具箱 |

## 图片与二维码

| 用途 | 工具 | 说明 |
|------|------|------|
| 图片压缩 | [TinyPNG](https://tinypng.com/) | 免费压缩 PNG/JPEG/WebP，图片会上传处理 |
| 抠图 | [remove.bg](https://www.remove.bg/) | 免费额度有限制 |
| 二维码生成 | [草料二维码](https://cli.im/) | 文本、网址、名片等转二维码 |

## 隐私提醒

- 网页工具通常会把内容发到对方服务器，**不要**粘贴密钥、密码、身份证号、成绩、未公开论文、实习代码或学校内部资料。
- 处理敏感内容优先选本地运行的工具（CyberChef、VS Code 插件、Pandoc 等），或在断网环境使用离线工具。
