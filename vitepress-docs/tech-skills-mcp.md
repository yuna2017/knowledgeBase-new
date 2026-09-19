---
description: Skill 与 MCP 的基础概念：Skill 是 AI Agent 可调用的能力单元，MCP 是连接外部工具与数据的协议，本页说明两者的定义与关系，概念详解见 LLM 术语页，按用途分类的推荐清单见 MCP 与 Skills 推荐页。
tags:
  - Skills
  - MCP
  - AI工具
authors:
  - HaoxiangXia
---

# AI Skill 与 MCP 基础

## 什么是 Skill

Skill 是 AI Agent 可调用的能力单元。它把某一项具体能力（例如查询天气、操作 Git、读取数据库）封装成 Agent 能理解和调用的接口。Agent 通过 Skill 扩展自己的功能，而不需要重新训练模型。

## 什么是 MCP

MCP（Model Context Protocol，模型上下文协议）是由 Anthropic 提出的一种开放标准，用来让 AI 模型安全地访问外部工具、数据源和系统。它相当于 AI 应用与外部世界之间的“通用接口”：只要服务端实现了 MCP，客户端模型就能动态发现和使用这些能力。

Host / Client / Server 的角色、Resource / Tool / Prompt 三类能力，以及 MCP 与 API、RAG、Agent 的区别，见 [LLM 常用术语解释](./tech-llm-glossary.md#mcp)。

## Skill 与 MCP 的关系

- Skill 描述的是“能力”本身。
- MCP 描述的是“能力如何被暴露和调用”的协议。
- 一个 Skill 可以通过 MCP 协议提供给 AI 模型使用。

## 推荐清单

按用途分类的 MCP Server 与 Skills 清单见 [MCP 与 Skills 推荐](./mcp-recommendation.md)。

Anthropic 官方 Skill 示例：

- [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- [doc-coauthoring](https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring)
