---
tags:
  - AI工具
  - 入门
  - 术语
authors:
  - liugu2023
---

# LLM 常用术语解释

刚接触 AI 工具时，经常会同时碰到 Prompt、Token、RAG、Agent 和 MCP。它们不在同一个层面：有的是模型概念，有的是应用设计，有的是连接外部工具的协议。

这篇文档按实际使用过程解释这些词。

## 先看整体流程

```text
用户输入 Prompt
       ↓
应用整理上下文：规则、聊天记录、文件、检索结果、工具结果
       ↓
LLM 进行 inference（推断运行）
       ↓
直接回答，或请求调用工具
       ↓
应用执行工具，再把结果交给模型继续处理
```

RAG 负责在回答前找资料，工具调用让模型请求外部能力，MCP 则为 AI 应用连接这些资料和工具提供一套通用协议。

## 从一个实际任务走一遍

假设你刚入学，手里有一份几十页的选课说明，想让 AI 帮你找出退补选时间，再把日期写进日历。

第一步，你输入：

```text
阅读这份选课说明，找出退补选开始和结束时间。
请标出原文页码，不确定的地方不要猜。
```

这段话是 Prompt。你上传的 PDF、系统给模型的规则和当前聊天记录共同组成 Context。PDF 会被转换并占用 Token；如果文件太长，应用可能只截取一部分，或者先把文档分块后检索相关段落。

模型从文档中找片段再回答，属于 RAG 或类似的检索流程。要求它附页码，是在做 Grounding：让结论尽量能回到原始材料核验。

如果你还要求“把这两个日期加入日历”，模型仅靠生成文字做不到。应用需要给它一个日历 Tool。模型生成调用参数，应用让你确认，然后由日历服务真正创建事件。

日历能力可以由应用自己写死，也可以通过 MCP Server 接入。如果系统允许模型根据中间结果自行决定“先读文件、再查校历、最后写日历”，它就比较接近 Agent；如果步骤由程序提前规定，则更像 Workflow。

这一条任务已经串起了本页最常见的概念：

```text
Prompt → Context/Token → RAG/Grounding → Tool calling → MCP → Agent 或 Workflow
```

## 你会在哪些场景碰到这些词

| 你想做什么 | 最相关的概念 |
|------------|--------------|
| 让 AI 修改一段文字 | Prompt、Context、Token |
| 根据课件或校内文件回答问题 | RAG、Chunking、Embedding、Grounding |
| 查询最新天气、比赛结果或软件版本 | Tool calling、联网搜索、Knowledge cutoff |
| 让 AI 编程工具读文件、运行测试、提交代码 | Agent、Tool、MCP、Human-in-the-loop |
| 在自己电脑上运行开源模型 | Inference、Quantization、Context window |
| 让模型长期保持固定格式或分类标准 | Fine-tuning、LoRA、Eval |

## 对话与模型基础

### LLM

LLM 是 Large Language Model，即大语言模型。它根据已经出现的 Token 计算后续 Token 的概率，再逐步生成内容。

“语言模型”不表示它只能处理文字。许多新模型也能接收图片、音频或视频，这类系统通常称为多模态模型。

### Prompt

Prompt 常译为“提示词”或“提示”。它是交给模型、用于引导本次输出的输入，可以包含任务、背景资料、限制条件、示例和待处理的数据。

Prompt 不是什么固定咒语。同一段提示在不同模型上可能得到不同结果；任务复杂时，比起堆砌“请认真思考”之类的话，明确目标、输入格式和验收标准通常更有效。

Prompt engineering（提示工程）是设计、测试和迭代 Prompt 的过程。正式项目还会配合 eval（评测），检查改动是否真的提高了稳定性。

例如，“帮我写一下”缺少目标和边界，模型只能猜。可以改成：

```text
把下面的社团招新通知改成 300 字以内的微信公众号正文。
保留时间、地点和报名方式，不要虚构福利。
语气自然，不使用表情符号。最后列出你删掉的信息。
```

一个实用 Prompt 通常回答四个问题：要做什么、材料是什么、有哪些限制、结果怎样算合格。并不是每次都要写得很长；简单问题一句话就够。

### System、Developer 和 User message

一些 API 会给消息区分角色。下面只展示常见 API 角色的入门简化形式。完整指令层级、API 字段和优先级会随厂商及产品变化。

| 角色 | 谁提供 | 常见内容 |
|------|--------|----------|
| System | 平台或系统 | 安全边界和最高层规则，用户通常看不到 |
| Developer | 应用开发者 | 产品行为、业务规则、输出格式 |
| User | 最终用户 | 本次问题或任务 |

其他厂商的名称和优先级不一定相同。角色也不是安全沙箱：网页内容、上传文件和工具返回值都可能夹带恶意指令，应用仍需做权限控制和输入隔离。

### Token

Token 是模型处理和计量信息的基本单位。Tokenizer 会把文字切成字符、词或词片段；图片、音频等输入也可能按各自规则折算成 Token。

Token 和汉字、英文单词都不是一一对应的。切分方式取决于模型和语言，因此估算费用或上下文占用时，应使用对应模型的计数工具。

你可以把 Token 暂时理解成模型的“阅读计量单位”。同一份中英文混排的实验报告，在不同模型里可能得到不同 Token 数，所以不要用“一个汉字等于一个 Token”来估算。

### Context window

Context window 是上下文窗口，也就是模型一次生成时能够参考的工作区。系统规则、聊天记录、文件、检索结果、工具返回值和本轮输出都可能占用它。

上下文窗口不是长期记忆，也不是训练数据。窗口更大只表示能放入更多内容，不代表模型能同样准确地利用每个位置的信息。资料过多、重复或互相冲突时，效果反而可能下降。

可以把上下文窗口想成考试桌面：桌子再大，也不等于你会自动理解桌上的每本书。如果一次上传几十份课件，最好先说明当前问题与哪门课程、哪一章有关。

### Inference

Inference 指模型训练完成后的运行阶段：读取输入，使用已经学到的参数计算并生成输出。中文里也常译为“推理”或“推断”。

这里的“推理”是工程术语，不等于模型一定具备可靠的逻辑推理能力。

### Temperature 和 Top-p

这两个参数都影响采样方式：

- Temperature 较高时，输出通常更随机；较低时更集中、更稳定。
- Top-p 只从累计概率达到指定范围的候选 Token 中采样。

通常不需要同时调整两者。低温度也不会自动提高事实准确性，而且部分推理模型不开放这些参数。

### Hallucination

Hallucination（幻觉）指模型生成了错误、无依据或前后矛盾的内容，却仍以正常语气表达。它不是模型“故意撒谎”。

联网、RAG 和工具调用能提供更多证据，但不能保证零幻觉。涉及政策、价格、论文、代码安全或真实人物时，仍应查看原始来源。

例如，询问“燕大现在允许用 MOOC 抵学分吗”，模型可能根据其他学校的规定拼出一个听起来合理的答案。正确做法是让它查找教务处现行文件、给出链接和发布日期，再由你核对原文。

### Reasoning model

Reasoning model 常译为推理模型或思考模型。这类模型会在最终作答前使用额外计算处理多步问题，适合复杂编码、数学、科研分析和 Agent 任务。

它仍然会出错。较高的 reasoning effort 通常还会增加 Token 消耗、费用和等待时间，简单分类或资料摘取未必需要它。

### Multimodal

Multimodal 即多模态，表示模型或系统能处理不止一种信息形式，例如文字、图片、音频和视频。

“支持多模态”不代表支持所有输入输出组合。能看图的模型未必能生成图片，能听音频的模型也未必能实时语音对话，使用前仍要看具体接口说明。

## 检索、知识库与 RAG

### Embedding

Embedding（嵌入）把文本、图片等内容转换成一串数字，也就是向量。含义较接近的内容，其向量通常也更接近，因此可以用来做语义检索、聚类和推荐。

Embedding 不是可逆压缩，也不表示向量相近的两段话事实完全相同。不同嵌入模型生成的向量通常不能直接混用。

例如，资料里写的是“补考安排”，你搜索“考试没过以后什么时候重考”，关键词并不相同，但语义检索仍可能通过 Embedding 找到它。

### Vector database

Vector database 是向量数据库，针对高维向量的存储、索引和相似度查询做了优化，通常还会保存原文编号、来源和其他元数据。

小型项目不一定要部署独立向量数据库。普通数据库扩展或搜索引擎也能完成向量检索。

### Semantic search

Semantic search（语义检索）按内容的含义和意图查找结果，而不只匹配相同关键词。向量检索是常见实现，但不是唯一实现；实际系统也会把关键词、向量和过滤条件混合使用。

### Chunking

Chunking（分块）是把长文档切成较小片段，再分别建立索引。片段太小容易丢失上下文，太大则会混入无关信息并浪费 Token。

分块没有通用的最佳长度。技术文档通常适合按标题和段落切分，表格、代码与扫描 PDF 还要单独处理。

以学生手册为例，如果把“奖学金申请条件”和下一章“宿舍纪律”切在同一个片段里，检索结果就容易夹带无关内容。只按固定字数硬切，还可能把一条规定从句子中间截断。

### Reranking

Reranking（重排）发生在初步检索之后。系统先快速找出一批候选结果，再用更精确、也更慢的模型重新计算相关性，把更有用的片段排到前面。

### RAG

RAG 是 Retrieval-Augmented Generation，即检索增强生成。常见流程如下：

```text
文档 → 分块 → 建立索引 → 检索候选 → 重排
                                      ↓
问题 + 检索结果 → 放入上下文 → LLM 回答
```

RAG 不是某一种数据库，也不是微调。检索来源可以是向量库、关键词索引、网页、业务数据库或 API。检索到资料后，模型仍可能理解错误，因此最好保留来源和引用。

做一个“校园规章问答助手”时，可以把学生手册和教务处通知建成索引。用户提问后，系统只取回相关条款交给模型，而不是每次把全部文件塞进对话。这就是很典型的 RAG。

### Grounding

Grounding 可译为“依据约束”或“基于资料生成”，意思是让回答尽量建立在可验证的数据源上。RAG、联网搜索和数据库查询都可以用于 Grounding。

它比 RAG 范围更宽，但同样不能保证回答绝对正确。

### Knowledge cutoff

Knowledge cutoff 是知识截止日期，表示模型训练知识大致覆盖到什么时间。它不是模型发布日期，也不表示截止日期之前的所有事实模型都知道。

联网搜索、上传文件和工具调用可以向模型提供更新的信息。

## 工具调用、工作流与 Agent

### Tool calling 和 Function calling

Tool calling（工具调用）指模型根据任务生成结构化调用请求，由应用执行外部能力，再把结果返回模型。例如搜索网页、查询天气、运行代码或读取数据库。

模型通常不会亲自执行本地函数。它负责提出调用名称和参数，宿主应用负责校验参数、检查权限并真正执行。

Function calling（函数调用）通常指开发者用名称、说明和 JSON Schema 声明的自定义函数，是工具调用的一种。网页搜索、文件搜索、计算机操作和 MCP 工具则不一定属于“函数”。

模型产生的调用请求可能类似下面这样：

```json
{
  "name": "create_calendar_event",
  "arguments": {
    "title": "退补选截止",
    "date": "2026-09-18"
  }
}
```

这段 JSON 只是请求，不代表日历事件已经创建。应用还要检查日期格式、当前账号和用户授权，执行成功后再把结果告诉模型。

### Workflow

Workflow（工作流）由程序预先规定步骤，例如“先检索资料，再总结，最后存入数据库”。模型可能参与其中，但执行路径主要由代码控制。

### Agent

Agent（智能体）没有全行业统一定义。比较实用的判断方式是：如果模型能根据中间结果自行决定下一步、选择工具、重试或结束，这套系统就更接近 Agent。

接入一个工具并不自动变成 Agent。固定工作流也不比 Agent 低级；步骤明确、风险较高的任务，固定流程通常更容易测试和审计。

举个例子：

- 程序固定执行“读取成绩表 → 计算平均分 → 生成报告”，这是 Workflow。
- 模型先查看文件类型，发现缺列后询问用户，再决定用表格工具还是代码计算，这是 Agent 式过程。

现实产品经常把两者混在一起：外层是固定流程，只有某几个步骤允许模型自由选择工具。

### Memory

模型本身没有无限记忆。应用常把 Memory 分成两类：

- 短期记忆：当前上下文窗口里的聊天记录和工作状态。
- 长期记忆：应用保存到数据库、文件或向量索引中的信息，需要时再取回。

长期记忆本质上是应用功能，保存什么、何时读取、能否删除，都应由产品明确控制。

### Guardrail 和 Human-in-the-loop

Guardrail 是应用设置的约束和检查，例如参数校验、敏感操作拦截、输出审核和权限控制。

Human-in-the-loop 表示关键步骤需要人确认。发送邮件、付款、删除数据或公开发布内容时，不应只依赖模型自行判断。

对新生来说，最简单的判断是：如果操作做错后不能轻易撤销，就应该要求确认。让 AI 阅读文件可以自动进行，替你提交申请、给老师发邮件或删除云盘内容则应停下来让你检查。

## MCP

### MCP 是什么

MCP 是 Model Context Protocol，即模型上下文协议。它规定 AI 应用怎样用统一方式连接外部数据、工具和可复用提示模板。协议基于 JSON-RPC，并维护客户端与服务器之间的会话。

MCP 不是模型，也不是 Agent 框架。它更像 AI 应用与外部能力之间的通用接口：支持 MCP 的应用可以按同一套协议发现和调用不同服务器提供的能力。

截至 2026 年 7 月 10 日，MCP 官网标注的当前稳定规范版本是 `2025-11-25`。官网和仓库中还可能出现候选版或开发中的功能，不能只按网页更新时间判断协议版本。

### Host、Client 和 Server

| 组件 | 作用 | 常见误解 |
|------|------|----------|
| Host | 承载 AI 的完整应用，负责权限、生命周期、用户确认和上下文汇总 | Claude Desktop、Codex 或 IDE 在严格术语中通常是 Host，不只是一个 Client |
| Client | Host 内部的协议连接组件，与一个 Server 保持一对一会话 | 用户平时不一定能直接看到它 |
| Server | 对外提供资料、工具或提示模板的程序 | Server 可以在本机运行，不一定是一台云服务器 |

一个 Host 可以创建多个 Client，分别连接文件系统、数据库、GitHub 或浏览器等 MCP Server。

以 AI 编程工具为例：编辑器或命令行应用是 Host；它内部为每个连接创建 MCP Client；文件系统、数据库和浏览器自动化程序分别作为 MCP Server 提供能力。日常交流里，人们有时会把整个应用简称为“MCP 客户端”，但规范里的 Client 只是 Host 内部的一层连接组件。

### Resource、Tool 和 Prompt

MCP Server 主要可以暴露三类能力：

| 类型 | 人话解释 | 例子 |
|------|----------|------|
| Resource | 可读取的内容 | 文件、数据库记录、Git 历史、接口返回的数据 |
| Tool | 可执行的能力 | 搜索、写文件、运行命令、创建工单 |
| Prompt | Server 提供的可复用交互模板 | “分析这个仓库”“生成周报”等菜单或斜杠命令 |

这里的 MCP Prompt 不是所有用户输入的统称，而是 Server 发布的一类可发现模板。规范把 Resource、Tool、Prompt 分别概括为应用控制、模型控制和用户控制，但 Host 仍应对实际访问和执行保留权限检查。

可以用图书馆做类比：

- Resource 像馆藏资料，重点是“读什么”。
- Tool 像借书、续借和检索操作，重点是“做什么”。
- Prompt 像已经设计好的检索表单或办事模板，重点是“怎样发起一次任务”。

类比只帮助入门。真正使用时，能否读取文件、执行命令或访问账号，仍由 Host、Server 配置和用户授权共同决定。

### MCP 和 API 有什么区别

API 是软件之间交换数据或执行操作的接口。MCP 没有取代 API；MCP Server 往往就是把已有 API、数据库或本地程序包装成 AI 应用容易发现和调用的形式。

### MCP 和 RAG 有什么区别

RAG 是“先检索资料，再交给模型回答”的应用方法。MCP 是连接能力的协议。MCP Resource 或 Tool 可以为 RAG 提供资料，但二者不是同一个概念。

### MCP 和 Agent 有什么区别

MCP 解决“怎样接入外部能力”，Agent 解决“由谁决定下一步做什么”。Agent 可以使用 MCP 工具，也可以直接调用普通 API。

## 训练与本地部署

### Training 和 Fine-tuning

Training（训练）让模型从大量数据中学习参数。Pre-training（预训练）通常指基础模型的大规模初始训练。

Fine-tuning（微调）是在已有模型上继续训练，使它更稳定地遵循特定格式、风格或任务标准。微调不是把文档上传后自动变成知识库；经常变化的事实通常更适合 RAG。不同平台当前是否开放微调，需要查看其最新模型文档。

### LoRA

LoRA 是 Low-Rank Adaptation，一种参数高效微调方法。它冻结基础模型的大部分原始权重，只训练体积较小的低秩更新矩阵。

LoRA 文件虽小，运行时仍需要对应的基础模型。LoRA 也不等于量化；QLoRA 才是把量化基础模型与 LoRA 训练结合起来的方法。

### Quantization

Quantization（量化）用更低精度保存或计算模型权重，有时也包括激活值和 KV cache。常见目标是降低显存占用，让模型能在消费级显卡或本地设备上运行。

量化不一定无损，也不保证在所有硬件上更快。位宽越低，越需要检查输出质量是否明显下降。

如果你只是使用网页上的 ChatGPT、Claude 或 Gemini，通常不用关心量化。准备在笔记本上运行开源模型时，模型名称里的 `8-bit`、`4-bit`、`GGUF` 等词才会经常出现。

## 最容易混淆的几组词

| 容易混淆 | 区别 |
|----------|------|
| Prompt 与 Context | Prompt 是引导模型的输入；Context 是本次生成能看到的全部内容，范围更大 |
| Token 与字数 | Token 是模型切分后的单位，不能按固定汉字数或单词数换算 |
| RAG 与微调 | RAG 在运行时取资料；微调会改变模型参数或适配器 |
| Embedding 与 LLM | Embedding 模型负责生成向量；LLM 主要负责理解和生成内容 |
| Tool calling 与 Agent | 工具调用是一种能力；Agent 会根据结果持续决定下一步 |
| Function calling 与 MCP | Function calling 描述一次结构化工具调用；MCP 规定应用如何发现、连接和使用一组外部能力 |
| MCP 与 API | MCP 常包装和组织 API，不取代 API |
| MCP 与 RAG | MCP 是连接协议；RAG 是检索增强生成流程 |

## 进阶：A2A

A2A 是 Agent2Agent Protocol，用于独立 Agent 之间发现能力、通信和管理任务。它与 MCP 解决的问题不同：MCP 主要连接工具和数据，A2A 主要连接彼此独立的 Agent。

不是所有多 Agent 项目都需要 A2A。同一应用内部的简单任务转交，通常可以直接由现有代码或 Agent 框架处理。截至核对日期，A2A 官方规范页标注的 Latest Released Version 为 1.0.0；项目仓库的最新发行标签为 v1.0.1。规范版本与实现仓库的发行标签不是同一套编号。

## 官方资料

> 以下均为官方来源。部分网站在中国大陆可能无法稳定直连，不建议用来源不明的镜像替代。

- [OpenAI：Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [OpenAI：Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Model Spec](https://model-spec.openai.com/)
- [Anthropic：Context windows](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
- [Anthropic：Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [Google Gemini API：Tokens](https://ai.google.dev/gemini-api/docs/tokens)
- [Google Gemini API：Embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Google Cloud：RAG overview](https://cloud.google.com/vertex-ai/generative-ai/docs/rag-overview)
- [Google Cloud：Grounding overview](https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview)
- [MCP 当前稳定规范](https://modelcontextprotocol.io/specification/latest)
- [MCP 架构](https://modelcontextprotocol.io/specification/latest/architecture)
- [MCP Server 能力](https://modelcontextprotocol.io/specification/latest/server)
- [Hugging Face PEFT：LoRA](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora)
- [Hugging Face Transformers：Quantization](https://huggingface.co/docs/transformers/main/en/quantization/overview)
- [A2A Protocol specification](https://a2a-protocol.org/latest/specification/)
- [A2A Releases](https://github.com/a2aproject/A2A/releases/latest)
