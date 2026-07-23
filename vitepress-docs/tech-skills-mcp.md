---
tags:
  - Skills
  - MCP
  - AI工具
authors:
  - HaoxiangXia
---

# AI Skill 与 MCP 基础

> 本文待完善。

## 什么是 Skill

Skill 是 AI Agent 可调用的能力单元。它把某一项具体能力（例如查询天气、操作 Git、读取数据库）封装成 Agent 能理解和调用的接口。Agent 通过 Skill 扩展自己的功能，而不需要重新训练模型。

## 什么是 MCP

MCP（Model Context Protocol，模型上下文协议）是由 Anthropic 提出的一种开放标准，用来让 AI 模型安全地访问外部工具、数据源和系统。它相当于 AI 应用与外部世界之间的“通用接口”：只要服务端实现了 MCP，客户端模型就能动态发现和使用这些能力。

## Skill 与 MCP 的关系

- Skill 描述的是“能力”本身。
- MCP 描述的是“能力如何被暴露和调用”的协议。
- 一个 Skill 可以通过 MCP 协议提供给 AI 模型使用。

## Skill推荐：

https://github.com/anthropics/skills/tree/main/skills/frontend-design

https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring

---

## 补充方向（供参考）

- 常见 MCP Server 示例（文件系统、GitHub、数据库、浏览器等）。
- 在 Claude Code / Cursor 等工具中使用 MCP 的方法。
- 如何为个人工作流编写一个简单 MCP Server。
- 燕大校园网或本地环境部署 MCP 时的注意事项。
