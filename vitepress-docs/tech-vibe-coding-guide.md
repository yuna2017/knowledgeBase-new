---
tags:
  - Vibe Coding
  - AI工具
  - 开发工具
authors:
  - kindness314
---

# Vibe Coding 使用指南

这篇指南面向刚开始使用 AI 编程工具的同学。目标不是收集尽可能多的插件，而是先建立一套不会轻易丢代码、泄露密钥或被过时命令卡住的工作方式。

最近核对：2026 年 7 月 10 日。模型名称、订阅额度、CLI 参数和社区项目会继续变化，执行前仍应查看链接中的官方说明。

## 先看中国大陆使用限制

Claude、OpenAI 和 Gemini API 的官方支持地区目前均不包含中国大陆。校园网能否连接、能否注册账号、能否付款，以及账号是否符合平台条款，是几件不同的事。

代理或中转只能改变请求经过的线路，不能自动解决账号合规、数据跨境、隐私、资金和模型真实性问题。不要向不清楚数据政策的平台发送身份证信息、成绩、未公开论文、实验数据、实习代码、密码或 API Key。

- [OpenAI API 支持地区](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories)
- [Anthropic 支持地区](https://www.anthropic.com/supported-countries)
- [Gemini API 可用地区](https://ai.google.dev/gemini-api/docs/available-regions)
- [API 中转站简介](./tech-relay.md)

## 目录

1. 开始前的安全底线
2. 安装 Claude Code
3. 安装 OpenAI Codex
4. 使用 CC Switch 管理配置
5. Node.js 环境准备
6. API Key 与 SDK
7. Prompt、Agent、MCP 和 Skill
8. 一套适合新生的开发流程
9. CLAUDE.md 与 AGENTS.md
10. MCP 和社区工具
11. 常见问题

---

## 01 · 开始前的安全底线

### 先让 Git 保护项目

进入项目目录后，先检查状态：

```bash
git status
```

如果项目还没有 Git 仓库：

```bash
git init
git add .
git commit -m "chore: 保存初始版本"
```

提交前要先看 `git status`，确认没有把 `.env`、API Key、个人文件、大型数据集或构建产物加进去。不要把 `git add -A` 当成不看内容的固定动作。

AI 修改后先检查：

```bash
git status
git diff
```

确认无误再提交：

```bash
git add 需要提交的文件
git commit -m "feat: 简短说明修改内容"
```

不要在不清楚后果时运行 `git restore .`、`git clean -fd`、`git reset --hard`。这些命令可能丢弃尚未提交的工作，而且通常无法通过 Git 恢复。

### 密钥不要进入仓库

API Key 应放在环境变量、系统密钥存储或本地 `.env` 文件中。使用 `.env` 时，把它加入 `.gitignore`：

```gitignore
.env
.env.*
!.env.example
```

`.env.example` 只写变量名和示例，不写真实 Key：

```dotenv
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

一旦 Key 被提交、截图或发到群里，应立即去平台后台撤销并重新创建，不能只从文件中删掉。

### 远程命令不是普通文本

下面这些写法会下载并执行远程代码：

```text
curl ... | bash
irm ... | iex
npx -y 某个包@latest
uvx --from git+<官方仓库地址>
```

只使用项目官方提供的地址。执行前核对域名、仓库、发布者和命令内容。`@latest` 会随时间安装不同版本，课程项目或团队项目应记录或固定已经验证过的版本。

---

## 02 · 安装 Claude Code

Anthropic 当前推荐原生安装。旧的 npm 安装方式已被官方标记为 deprecated，不再作为本指南的首选。

### Windows PowerShell

```powershell
irm https://claude.ai/install.ps1 | iex
```

也可以使用 WinGet：

```powershell
winget install Anthropic.ClaudeCode
```

原生 Windows 建议安装 Git for Windows。Claude Code 可使用其中的 Bash 工具；没有安装时会改用 PowerShell。

### macOS / Linux / WSL

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

macOS 或 Linux 也可使用 Homebrew：

```bash
brew install --cask claude-code
```

### 验证

```bash
claude --version
claude
```

首次运行会进入登录或认证流程。是否能使用订阅或 API，取决于账号类型、支持地区和当前产品政策。

官方文档：

- [Claude Code 安装](https://code.claude.com/docs/en/setup)
- [Claude Code 概览](https://code.claude.com/docs/en/overview)

---

## 03 · 安装 OpenAI Codex

### npm

```bash
npm install -g @openai/codex
```

### macOS Homebrew

```bash
brew install --cask codex
```

也可以从官方仓库的 Releases 下载对应平台的二进制文件。

### 验证

```bash
codex --version
codex
```

优先使用 Codex 自带的官方登录流程和默认模型。不要在长期文档中写死 `gpt-5` 等模型 ID；当前推荐模型和可用模型会变化。

需要自定义 provider 时，先查看当前配置参考。第三方网关不仅要接受 OpenAI 风格的 URL，还要正确实现 Codex 使用的 Responses API、流式事件和工具调用。仅修改 `base_url` 后“能回复一句话”，不代表完全兼容。

- [Codex 官方仓库](https://github.com/openai/codex)
- [Codex 配置参考](https://developers.openai.com/codex/config-reference)
- [OpenAI 当前模型说明](https://developers.openai.com/api/docs/guides/latest-model.md)

---

## 04 · 使用 CC Switch 管理配置

CC Switch 是桌面配置管理器，不是 npm CLI。网上流传的 npm 全局安装和 `cc` 命令行教程不是该项目的官方使用方式。

### 安装

Windows：从 [GitHub Releases](https://github.com/farion1231/cc-switch/releases/latest) 下载 `.msi` 或 Portable 版本。

macOS：

```bash
brew install --cask cc-switch
```

Arch Linux：

```bash
paru -S cc-switch-bin
```

### 使用流程

1. 启动应用并备份现有配置。
2. 在“供应商”界面选择预设或创建自定义配置。
3. 填写供应商明确要求的 Base URL、API Key 和模型映射。
4. 点击“启用”。多数工具需要重启终端或 CLI 才会读取新配置。
5. 用不含敏感内容的小请求验证文本、流式输出和工具调用。
6. 需要恢复官方登录时，启用“官方登录”配置并重新完成登录。

CC Switch 不提供模型服务。预设供应商、README 中的赞助商和低价套餐不等于经过安全审计。

详见 [CC Switch 简介](./tech-cc-switch.md)。

---

## 05 · Node.js 环境准备

只有使用 npm 安装 CLI 或运行基于 Node.js 的 MCP Server 时才需要 Node.js。Claude Code 的原生安装本身不要求你先配置 Node.js。

### Windows

从 [Node.js 官网](https://nodejs.org/zh-cn/download) 下载当前 LTS 的 Windows Installer。安装完成后重新打开 PowerShell：

```powershell
node -v
npm -v
```

需要管理多个版本时可使用 [nvm-windows](https://github.com/coreybutler/nvm-windows)。不要照抄长期文档中的固定 Node 主版本；优先选择项目要求的版本或当前 LTS。

### macOS / Linux

可使用 [nvm](https://github.com/nvm-sh/nvm) 管理版本。安装 nvm 时使用其 README 中当前的安装命令，不要复制旧版本号。

安装当前 LTS：

```bash
nvm install --lts
nvm use --lts
nvm alias default 'lts/*'
```

验证：

```bash
node -v
npm -v
```

### npm 镜像

中国大陆下载 npm 包较慢时，有人会使用第三方镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

这不是 npm 官方服务，可能存在同步延迟和供应链风险。需要恢复官方 registry 时：

```bash
npm config set registry https://registry.npmjs.org
```

---

## 06 · API Key 与 SDK

官方 SDK 通常允许配置 API Key 和 Base URL，但“OpenAI 兼容”不表示所有接口和参数都兼容。第三方网关可能不支持 Responses API、工具调用、结构化输出、缓存或相同的错误格式。

### Python · OpenAI Responses API

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

response = client.responses.create(
    model=os.environ["OPENAI_MODEL"],
    input="用两句话解释递归。",
)

print(response.output_text)
```

### Python · Anthropic Messages API

```python
import os
from anthropic import Anthropic

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

message = client.messages.create(
    model=os.environ["ANTHROPIC_MODEL"],
    max_tokens=512,
    messages=[{"role": "user", "content": "用两句话解释递归。"}],
)

print(message.content[0].text)
```

模型 ID 从供应商当前模型页获取，不要把示例中的模型名当成长期固定值。为不同应用创建独立 Key，并在平台后台设置预算、额度和用量告警。

- [迁移到 OpenAI Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)

---

## 07 · Prompt、Agent、MCP 和 Skill

- **Prompt**：你交给模型的任务、材料、限制和验收标准。
- **Agent**：能根据中间结果选择工具、继续尝试或结束任务的系统。
- **MCP**：AI 应用连接外部数据和工具的一套协议。
- **Plugin**：产品自己的可安装功能包，不同产品通常不通用。
- **Skill**：用 `SKILL.md` 等文件描述可复用工作方式。不同产品的字段、目录和权限并不保证完全一致。
- **Workflow**：提前规定任务步骤的流程。固定流程并不比 Agent 低级，反而更容易检查。

更多解释见 [LLM 常用术语解释](./tech-llm-glossary.md)。

---

## 08 · 一套适合新生的开发流程

### 第一步：先说清任务

一条可执行的请求通常包含：

```text
目标：要完成什么。
范围：允许修改哪些文件，不要动哪些部分。
约束：技术栈、依赖、风格和不能做的事。
验收：运行什么测试，怎样算完成。
```

示例：

```text
修复登录按钮点击后没有加载状态的问题。
只修改 LoginForm.vue 和对应测试，不新增依赖。
失败时显示现有 toast，成功后的跳转行为保持不变。
先说明原因和计划，确认后再修改；完成后运行该组件测试。
```

### 第二步：让 AI 先读再改

复杂任务先要求它说明：

- 读了哪些文件；
- 判断的根因是什么；
- 准备修改什么；
- 有哪些风险；
- 如何验证。

简单任务可以直接做，但仍要限制文件范围。

### 第三步：查看真实结果

模型说“已经完成”不等于操作真的成功。检查：

```bash
git status
git diff
```

然后运行项目已有的 lint、类型检查和测试。不要让 AI 通过删测试、跳过测试或把失败 mock 掉来制造“通过”。

### 第四步：小步提交

一个独立修改验证通过后再提交。换到不相关任务时开新对话，避免旧上下文干扰新任务。

### 不可逆操作必须确认

发送邮件、提交申请、付款、发布内容、删除数据、修改生产环境和推送远程仓库前，应让工具停下来等待确认。

---

## 09 · CLAUDE.md 与 AGENTS.md

把稳定的项目约定写进仓库，可以减少每次重复说明。

Claude Code 常用：

```text
<项目根>/CLAUDE.md
```

Codex 常用：

```text
<项目根>/AGENTS.md
```

产品还可能读取用户级或更深目录中的说明文件。具体合并和优先级以当前官方文档为准，不能简单理解为“项目文件永远优先”。

一个精简模板：

```markdown
## 项目约定

- 默认使用中文交流；代码、路径和报错保持原文。
- 修改前先阅读相关文件和现有测试。
- 只做任务要求的改动，不顺手重构无关代码。
- 第三方库的版本和 API 先查当前官方文档。
- 不读取或提交 `.env`、密钥和个人数据。
- 修改后运行：`这里写项目实际命令`。
- 未验证时不要声称“完成”或“测试通过”。
- 删除、发布、推送和其他不可逆操作先等待确认。
```

- [Claude Code memory / CLAUDE.md](https://code.claude.com/docs/en/memory)
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)

---

## 10 · MCP 和社区工具

MCP Server 可能读取本地文件、访问账号、运行命令或把内容发给远程服务。安装前至少确认四件事：

1. 谁发布和维护这个项目；
2. 它会读取哪些目录和环境变量；
3. 数据是否发送到第三方服务器；
4. 如何固定版本、更新和卸载。

常见项目入口：

| 工具 | 用途 | 主要风险 |
| --- | --- | --- |
| [Context7](https://github.com/upstash/context7) | 查询库和框架文档 | 查询会发送到外部服务；免费限制会变化 |
| [Serena](https://github.com/oraios/serena) | 符号级代码导航 | 本地程序可读取代码库；从 GitHub 安装需核对版本 |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | 浏览器自动化和前端验收 | 可能接触 Cookie、登录状态和网页隐私数据 |
| [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | 联网搜索 | 需要第三方账号和 Key，查询会离开本机 |
| [DeepWiki MCP](https://docs.devin.ai/work-with-devin/deepwiki-mcp) | 查询公开 GitHub 仓库 | 私有仓库需要单独授权，不要默认上传内部代码 |

GitHub、npm 和海外远程服务在中国大陆校园网中的连通性可能波动。不要为了“让它能跑”就关闭证书校验、粘贴来历不明的镜像脚本或给工具开放整个用户目录。

### 社区插件和工作流

Trellis、GSD、Task Master、Open Design、Superpowers、Understand-Anything 等社区项目可以提供额外流程，但版本、维护状态和安装命令变化很快。本指南不再保存它们的 `npx @latest` 或插件市场命令。

决定使用前，请在项目仓库核对：

- 最近一次发布和维护状态；
- 许可证；
- 是否执行 Hook 或任意 shell 命令；
- API Key 保存在哪里；
- `.env` 是否已加入 `.gitignore`；
- 是否把代码、Prompt 或设计稿上传到远程服务；
- 是否有明确的卸载和清理方法。

课程项目优先选择依赖少、能解释清楚、能够固定版本的方案。工具越多，权限面和排错成本也越大。

---

## 11 · 常见问题

### 401 / 403

检查 Key 是否有效、环境变量名是否正确、账号是否有模型权限，以及平台是否支持当前地区。不要不断注册新账号绕过地区或风控限制。

### 402

通常与余额、计费或供应商路由有关。查看响应正文和供应商账单。缺少 OpenRouter 的应用归属请求头不会自动导致 402。

### 429

已经达到请求、Token 或并发限制。读取错误信息和速率限制响应头，等待后重试。不要让程序无限快速重试。

### 连接超时

先区分是校园网、DNS、代理、供应商还是本地防火墙问题。不要在没有证据时关闭 TLS 证书验证。

### 能聊天，但工具调用失败

第三方网关可能只兼容基本文本接口，没有完整实现 Responses API、Anthropic Messages、流式事件或工具调用。用供应商明确支持的客户端和接口验证。

### AI 改坏了代码

先停止继续修改，查看 `git status` 和 `git diff`。如果修改前已经提交，可以从已知提交恢复；如果没有提交，先复制当前文件再人工处理，不要直接运行会丢数据的 Git 命令。

### 什么时候算完成

至少满足以下条件：

- 修改范围符合要求；
- diff 已人工检查；
- 密钥和个人文件没有进入仓库；
- 项目规定的检查和测试通过；
- 实际功能已经验证；
- 仍存在的限制已经写清楚。
