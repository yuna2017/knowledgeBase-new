---
tags:
  - AI工具
  - 免费资源
  - API
authors:
  - liugu2023
---

# 免费 AI API 额度

## 中国大陆使用前先看

OpenAI、Anthropic 和 Google Gemini API 的官方支持地区目前均不包含中国大陆。即使某个地址技术上能够连接，也不代表账号注册、付款方式或使用方式符合平台条款。

第三方中转只能改变请求经过的线路，不能消除账号、隐私、资金、模型真实性和数据跨境风险。使用前请阅读 [API 中转站简介](./tech-relay.md)。不要向不清楚数据政策的平台发送身份证号、成绩、未公开论文、实验数据、实习代码、密码或 API Key。

官方地区说明：

- [OpenAI API 支持地区](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories)
- [Anthropic 支持地区](https://www.anthropic.com/supported-countries)
- [Gemini API 可用地区](https://ai.google.dev/gemini-api/docs/available-regions)

## 海外平台

### Google Gemini（AI Studio）

Gemini API 提供免费层，适合小规模试验。免费层能调用的模型和 RPM、TPM、RPD 等限制会调整，应以官方页面和账户后台为准。

免费层提交的内容可能被 Google 用于改进产品，因此不要上传敏感材料。中国大陆不在 Gemini API 官方可用地区，不能把它当作境内校园网默认可用的方案。

- [Gemini API 定价](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API 速率限制](https://ai.google.dev/gemini-api/docs/rate-limits)

### OpenRouter

OpenRouter 用一套兼容接口聚合多家模型。部分模型 ID 带有 `:free` 变体，但免费模型的数量和名单会变化，请在模型页实时筛选。

免费模型有分钟和每日请求限制。累计购买额度后，每日上限可能提高；具体规则以官方限制页为准。`HTTP-Referer` 和 `X-OpenRouter-Title` 用于应用归属和统计，不是普通 API 请求的必填项。

- [OpenRouter 免费模型列表](https://openrouter.ai/models?fmt=table&max_price=0)
- [OpenRouter API 限制](https://openrouter.ai/docs/api-reference/limits)
- [OpenRouter 应用归属请求头](https://openrouter.ai/docs/app-attribution)

### Groq

GroqCloud 以低延迟推理为主要特点，并提供免费计划。不同模型的 RPM、RPD、TPM 和 TPD 不同，平台也会调整模型名单。精确限制应查看账户的 Limits 页面，不要依赖固定数字。

- [Groq 模型列表](https://console.groq.com/docs/models)
- [Groq 速率限制](https://console.groq.com/docs/rate-limits)

### Cerebras

Cerebras Inference 提供 Free Trial。限制按模型区分，并可能同时计算每分钟、每小时和每日请求或 Token 数。适合试验高速推理，但不应把试用层当作生产环境配额。

- [Cerebras 模型目录](https://inference-docs.cerebras.ai/models/overview)
- [Cerebras 速率限制](https://inference-docs.cerebras.ai/support/rate-limits)

## 国内平台

国内平台通常更适合中国大陆网络、人民币支付和实名认证流程，但免费模型、注册送额和活动期限同样会变化。下面只保留官方入口，不承诺具体赠送数量或“永久免费”。

- **智谱 AI（GLM）**：[开放平台](https://open.bigmodel.cn/) / [价格说明](https://open.bigmodel.cn/pricing)
- **硅基流动（SiliconCloud）**：[模型广场](https://cloud.siliconflow.cn/models)
- **月之暗面（Moonshot / Kimi）**：[开放平台](https://platform.moonshot.cn/) / [定价文档](https://platform.moonshot.cn/docs/pricing/chat)
- **火山方舟**：[产品页](https://www.volcengine.com/product/ark)
- **百度智能云千帆**：[产品页](https://cloud.baidu.com/product/wenxinworkshop)

网页端产品的免费聊天次数不等于 API 免费额度。例如 Kimi 网页或客户端的使用规则，不能直接套用到 Moonshot API；API 是否收费应查看开放平台定价。

## 选择平台时看什么

1. **支持地区和注册条件**：是否支持你所在地区，是否需要实名认证、信用卡或企业认证。
2. **数据使用政策**：免费层内容是否用于训练，日志保存多久，能否申请删除。
3. **实际限制**：除了 RPM / RPD，还要看 TPM、并发数、上下文长度和单次输出限制。
4. **接口兼容性**：标称“OpenAI 兼容”不表示完整支持 Responses API、工具调用、流式事件和结构化输出。
5. **费用保护**：设置预算和用量告警，为不同项目创建独立 Key，不要多人共用。

## 编程时的基本做法

- 遇到 `429 Too Many Requests` 时读取响应头和错误信息，按平台建议退避重试，不要无限循环请求。
- API Key 放在环境变量或专用密钥管理工具中，不要写进代码、截图、聊天记录或 Git 仓库。
- `.env` 文件应加入 `.gitignore`，提交前先运行 `git status` 检查。
- 免费层只适合学习、原型和测试。正式服务还要考虑 SLA、并发、账单、数据协议和故障切换。
- 多平台切换可以使用 [cc-switch](./tech-cc-switch.md) 等配置管理工具，但这类工具不提供模型服务，也不替供应商的合规性背书。
