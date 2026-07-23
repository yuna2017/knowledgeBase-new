---
tags:
  - AI工具
  - 开发工具
  - 配置管理
authors:
  - liugu2023
---

# CC Switch 简介

[CC Switch](https://github.com/farion1231/cc-switch) 是一个开源的跨平台桌面应用，用来管理 Claude Code、Claude Desktop、Codex、Gemini CLI、OpenCode 等 AI 工具的供应商、MCP、Skills 和提示文件配置。

它本身不提供模型或 API 额度，也不替任何第三方供应商背书。配置能够写入工具，不代表对应账号、接口或中转服务符合上游条款。

## 它解决什么问题

不同 AI 工具分别使用环境变量、JSON、TOML 或其他配置文件。需要在官方登录、自建服务和不同 API 供应商之间切换时，手动修改容易写错，也不方便恢复。

CC Switch 把配置保存在本地数据库中，通过图形界面写入各工具使用的配置文件。多数工具在切换后需要重启终端或 CLI；是否支持热切换以当前官方说明为准。

## 主要功能

- 为多个 AI 编程工具保存和切换供应商配置
- 通过系统托盘快速启用已有配置
- 在支持的工具之间管理和同步 MCP、Skills、Prompts
- 统计经其本地代理处理的请求、Token 和估算费用
- 导入、导出和备份配置

统计结果依赖供应商返回值、模型价格配置和代理接管范围，不能替代供应商账单。

## 安装

### Windows

从 [GitHub Releases](https://github.com/farion1231/cc-switch/releases/latest) 下载 `.msi` 安装包或 Portable 压缩包。首次运行前核对仓库、发布者和文件名。

### macOS

```bash
brew install --cask cc-switch
```

升级：

```bash
brew upgrade --cask cc-switch
```

### Arch Linux

```bash
paru -S cc-switch-bin
```

其他 Linux 发行版可从 Releases 下载 `.deb`、`.rpm` 或 AppImage。系统要求和文件名可能变化，以最新 Release 说明为准。

## 基本使用流程

1. 首次启动时导入现有工具配置，并先做备份。
2. 在“供应商”界面选择预设或创建自定义配置。
3. 只填写供应商明确要求的 Base URL、API Key 和模型映射。
4. 点击“启用”，然后按提示重启对应终端或 CLI。
5. 用一个无敏感内容的小请求验证模型、流式输出和工具调用。
6. 需要恢复官方登录时，启用“官方登录”配置并重新完成该工具的登录流程。

不同网关对 Responses API、Anthropic Messages、缓存、工具调用和流式事件的兼容程度不同。“能回复一句话”不代表完整兼容。

## 安全与中国大陆使用提示

- API Key 只保存在可信设备上，不要截图、发群或写入 Git 仓库。
- 不同项目和工具尽量使用独立 Key，并设置预算、额度和撤销方式。
- 开启云同步前确认同步位置、加密方式和数据范围。
- 预置供应商或 README 中的赞助商不等于经过项目方安全审计。
- 中国大陆用户仍需自行核对上游平台的支持地区、账号条款、付款要求和数据政策。
- 第三方中转从技术上可以看到请求内容，使用前请阅读 [API 中转站简介](./tech-relay.md)。

## 相关链接

- [项目仓库](https://github.com/farion1231/cc-switch)
- [中文说明](https://github.com/farion1231/cc-switch/blob/main/README_ZH.md)
- [最新版本](https://github.com/farion1231/cc-switch/releases/latest)
