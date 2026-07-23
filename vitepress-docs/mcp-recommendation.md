---
tags:
  - MCP
  - Skills
authors:
  - liugu2023
---

# MCP与Skills推荐

>注意：
    本文为笔者与2026年7月22日从LinuxDO论坛转载而来，不保证时效性，可从文档结尾的参考文献处访问原贴

## **一、思考 / 推理增强类**

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| Grill Me | Skill | https://github.com/mattpocock/skills | 对用户方案进行"压力测试"，通过连续追问和挑战假设，暴露设计漏洞和不完整逻辑 | 论坛里经常提到的 GrillMe skill，必备推荐 |
| Grill With Docs | Skill | https://github.com/mattpocock/skills | Grill Me 的"带文档"变体，在追问的同时要求对照需求文档/规约进行核验，更适合有明确规格的模块开发 | Grill Me 的进阶版，规约驱动场景下比原版更稳（Pachakutiq 推荐） |
| Sequential Thinking | MCP | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking | 将复杂问题拆解为可执行的分步推理过程，并允许中途修正或回溯推理链 | 用过一段时间还可以，不过现在有些 Agent 里已预置分步思考能力了 |

## **二、开发 / 编程辅助类**

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| Context7 | MCP | https://mcp.context7.com/mcp | 为模型提供最新的框架和库文档上下文，解决模型知识过时问题 | 我在 opencode 里用过一段时间，提升好像没那么明显 |
| Supabase MCP | MCP | https://mcp.supabase.com/mcp | 提供数据库 schema 查询、SQL 分析、权限策略检查等能力 | Supabase 有免费在线数据库，可以用来存一下个人的结构化数据 |
| Exa Search MCP | MCP | https://mcp.exa.ai/mcp | 高质量语义搜索（`npx -y @filiksyos/mcptoskill https://mcp.exa.ai/mcp --name=exa` 可转成 skill） | 比让 AI 瞎琢磨各种 CURL 好用；有并发限制，登录 exa.ai 建自己的凭证后可提高并发，个人自用够用 |
| Superpowers | Skill 框架 | https://github.com/obra/superpowers （中文增强版： https://github.com/jnMetaCode/superpowers-zh ） | 一整套"代理式编程"方法论 + 可组装 skills 框架，覆盖头脑风暴、spec、TDD、代码评审等多个开发阶段 | 社区热度极高（主仓 100k+ ⭐，中文版 6k+ ⭐），相当于 skills 的"全家桶"，按需取用（Berton_Wang 推荐） |
| OpenSpec | Skill / 工作流 | https://github.com/Fission-AI/OpenSpec | 规约驱动开发（Spec-Driven Development）：把大模块先写成结构化 spec，再交给 Agent 按 spec 实现 | 大模块完整开发用 spec 模式最稳，小改动可以头脑风暴一下直接写（Berton_Wang 提到的 "opensec/spec 开发模式"） |
| Ponytail | Skill | https://github.com/alonbaron/claude-skills （打包在 claude-skills 插件里） | "只改我让你改的地方"——约束 Agent 只触碰明确指定的代码范围，避免误伤无关逻辑 | 每次改代码都让他别改到其他的，治好了我的合并冲突恐惧症（chopin2077 推荐） |
| Impeccable（含 Webdesign Agency Skills） | Skill | https://github.com/peterhadorn/webdesign-agency-skills | 前端设计审计与改进闭环：诊断设计问题 → 给出建议 → 直接修复，定位"client-ready"的交付质量 | 前端代码审计/审美提升用这套（Berton_Wang 推荐的"前端 impeccable"） |

## **三、浏览器 / 自动化类**

|名称 | 类型 | 地址 | 作用 | 评价|
|--- | --- | --- | --- | ---|
|Playwright MCP | MCP | https://github.com/microsoft/playwright | 提供浏览器自动化能力，包括页面操作、UI 测试、数据抓取等 | AI 需要浏览器能力时的默认推荐|
|Kimi WebBridge | Skill | https://linux.do/t/topic/（Kimi WebBridge - 让 AI Agent 可以使用浏览器） | 专为 AI Agent 设计的浏览器插件，让 AI 帮你打开网页、点击按钮、填写表单、提取信息 | 我在 codex 里用还挺好用的，可以直接操作一些登录过的网站。点名批评 codex 内置浏览器能力——对于需要认证的网站直接报错不给访问|
| Agent Browser | CLI / Skill | https://github.com/vercel-labs/agent-browser | Vercel 出品的浏览器自动化 CLI，专为 AI agent 设计；给出场景描述，agent 自动编排并跑通流程，无需手写脚本 | 3.8w+ ⭐，浏览器自动化的「原生 agent 友好」方案；自动化测试前端功能时很灵活（izayo、xuanaixuan 多次推荐） |
| Android MCP Server | MCP | https://github.com/minhalvp/android-mcp-server | 通过 ADB 让 AI Agent 程序化控制 Android 设备：截图、UI 布局分析、应用包管理、任意 ADB 命令执行，支持多设备 | 770+ ⭐；⚠️ 推荐者提醒：手机 APP UI 点击层级藏太深，低配模型容易卡死，能用浏览器就别让 Agent 操作手机（MagicMonkey 推荐） |

## **四、工程平台 / DevOps 类**

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| GitHub MCP | MCP | https://mcp.directory/ | 访问 GitHub 资源，包括 issue、PR、代码仓库分析等 | 使用率最高的 MCP 之一，但部分功能可被 GitHub CLI 替代，按需安装 |
| Notion MCP | MCP | https://www.notion.so/ | 知识库管理、文档组织和项目记录自动化 | Notion 算是知识管理代表，少量个人数据放这也没问题 |
| maton（聚合 API） | MCP | https://maton.ai/ | 一个 API 同时接入 Notion、OneDrive 等多个平台，免去逐个配置凭证 | 通过 maton 的 api 一次性接入了 Notion 和 OneDrive，使用起来还算方便（mjj7458 推荐） |
| 飞书 Lark-CLI | Skill 集合 | https://www.feishu.cn/feishu-cli | 飞书官方开源的 AI Agent 操作工具，让 AI 直接读消息、查日历、写文档、建表格、发邮件；`npm` 一行命令安装，Claude Code / Cursor / Trae 等主流 AI 工具均支持 | 一个 CLI 里打包了多个飞书相关 skill，国内协同场景刚需（Corgier 推荐） |
| Figma MCP（Dev Mode） | MCP | https://mcp.com.figma.com/mcp （Figma 官方） | 从 Figma 设计稿直接生成/对齐前端代码，打通"设计 → 代码"环节 | "从设计到代码"整套方案的不错选择（Corgier 推荐） |
| OfficeCLI | CLI / Skill | https://github.com/iOfficeAI/OfficeCLI | 专为 AI agent 打造的 Office 套件：用单条命令直接读写 Word/Excel/PowerPoint，单二进制无需安装 Office，避免现场造 Python 胶水轮子损坏文件 | 9.5k+ ⭐，C# 编写，下载 exe 配环境变量即可用；Word/Excel 效果好，PPT 闭环需要多模态模型（MagicMonkey 推荐） |

## **五、知识系统 / 记忆类**

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| Obsidian | Skill / MCP 接入 | https://obsidian.md/ | 作为本地知识库系统，实现长期知识存储与检索 | Obsidian 可以算是个人知识管理的代表，不过需要一定的动手能力进行配置和搭建 |
| GitNexus | 工具（本地知识图谱） | https://github.com/abhigyanpatwari/GitNexus | 纯浏览器端运行的代码知识图谱引擎：丢入任意 git 仓库（GitHub/GitLab/Azure/本地）或 ZIP，生成交互式知识图谱 + 内置 Graph RAG Agent，适合代码探索 | 4.3w+ ⭐，零服务器、本地运行；代码库理解/重构时很好用（Shawn_Aaron 推荐） |
| Mem0 | MCP / 记忆层 | https://github.com/mem0ai/mem0 （MCP 封装：coleam00/mcp-mem0） | AI agent 的通用记忆层：跨会话持久化记忆，让 agent 记住用户偏好、历史决策、项目上下文 | 6w+ ⭐，记忆类的事实级标准方案；想让 agent「长记性」时首选（Shawn_Aaron 推荐） |

## 六、审美 / 去 AI 味类

### 6.1 UI / 视觉去 AI 味

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| Taste-Skill | Skill | https://github.com/Leonxlnx/taste-skill | 让 AI 拥有"好品味"：阻止生成千篇一律、通用化的样板 UI，生成前先做审美与原创性校验 | 5.8w+ ⭐，是给 UI "去 AI 味" 这方面热度最高的 skill（wxpp 推荐） |
| UI/UX Pro Max | Skill | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill （中文版：https://github.com/bbylw/ui-ux-pro-max-skill-cn ） | 跨平台 UI/UX 设计智能 skill，提供专业级设计决策（配色、布局、组件、交互），覆盖 Web/移动/桌面多端 | **10w+ ⭐**（中文版 1.1k ⭐），UI 设计 skill 现象级项目；codex 给你做的 UI 太丑时，装这个立竿见影（xuanaixuan 推荐） |

### 6.2 文案 / 写作去 AI 味

| 名称 | 语言 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| **qu-ai-wei（去 AI 味）** | **中文** | https://github.com/LifelongLazyLearner/qu-ai-wei | 专攻**简体中文** AI 写作痕迹：清理"赋能/打造/极致/无缝"等空泛营销词、对仗堆砌、AI 腔句式 | 中文场景首选；170+ ⭐，我在 hermes 当中用过，效果还不错 |
| Humanizer | 英文 | https://github.com/blader/humanizer | 移除英文文本中的 AI 生成痕迹（Claude Code skill） | **2.7w+ ⭐**，英文去 AI 味最知名的 skill |

## 七、学术 / 科研类

| 名称 | 类型 | 地址 | 作用 | 评价 |
|------|------|------|------|------|
| Academic Research Skills | Skill 套件 | https://github.com/Imbad0202/academic-research-skills （Codex 原生版：https://github.com/Imbad0202/academic-research-skills-codex ） | 科研全流程 skill：找参考文献、格式化引用、验证数据、检查逻辑一致性、同行评议式追问；定位是「AI 是副驾驶不是飞行员」——不替你写论文，而是帮你写**更好的**论文 | 3.6w+ ⭐（Codex 版 5.6k ⭐）；评审阶段类似 Grill Me 会反复追问暴露论点漏洞，科研党强推（MuYukki 推荐） |

## 八、安全 / 防注入检测

### 8.1 Skill 安装前审计

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| **SkillGuard** | Skill 扫描器 | https://github.com/obielin/skillguard | 安装前扫描 AI agent skill，检测 prompt injection、数据外泄、恶意 payload | **专门针对 skill 文件**的静态扫描器，装新 skill 前都可以跑跑扫描下 |
| Skill-Sentinel | Skill 扫描器 | https://github.com/EvolutionUnleashed/skill-sentinel | 针对 `SKILL.md` 文件的安全扫描：恶意代码、prompt injection、数据外泄、供应链威胁 | SkillGuard 的同类替代，规则集不同，可以交叉验证 |

### 8.2 MCP / Agent 运行时与综合扫描

| 名称 | 类型 | 地址 | 作用 | 评价 |
|----|----|----|----|----|
| **MCP Scanner（Cisco AI Defense）** | MCP 扫描器 | https://github.com/cisco-ai-defense/mcp-scanner | 扫描 MCP server 潜在威胁与安全发现 | 思科官方出品，**近 1k ⭐**，企业级，应该可靠性还是有保障的 |
| **Snyk Agent Scan** | Agent+MCP+Skill 扫描器 | https://github.com/snyk/agent-scan | 为 AI agent、MCP server、agent skill 提供**一体化**安全扫描 | **2.7k+ ⭐**，Snyk 出品，**一个工具覆盖 skill + mcp + agent**，适合想一条龙服务的 |

## 参考链接

- https://linux.do/t/topic/2533306