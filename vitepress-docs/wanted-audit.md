---
description: 需求反馈的审计入口，维护者使用。查看全部明细、改处理状态、删除垃圾提交，也可以把结果导出成 Markdown。页面本身不含数据，明细需要口令登录后才会拉取。文档站打不开时，也可以用本地脚本直接读。
tags:
  - 知识库
  - 维护
authors:
  - liugu2023
head:
  - - meta
    - name: robots
      content: noindex, nofollow
---

# 反馈审计

维护者用。口令在部署环境里，变量名 `FEEDBACK_ADMIN_PASSWORD`。

页面本身是公开的静态页，不含任何反馈数据；明细要登录后才由浏览器去拉。会话是个 HttpOnly Cookie，作用域只限 `/api/feedback`。连续输错 5 次会锁 15 分钟。

<FeedbackAudit />

文档站或接口打不开的时候，本机跑脚本也能看：

```sh
node scripts/feedback-report.mjs          # 计数 + 明细
node scripts/feedback-report.mjs --write  # 顺便更新状态页的兜底数据
```

需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 两个环境变量。

提交入口在[告诉我们缺什么](/wanted)。
