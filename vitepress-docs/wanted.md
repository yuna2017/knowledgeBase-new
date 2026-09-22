---
description: 没找到想要的内容，或者发现哪篇写错了、过时了，都可以在这里说一声。不用会 Git，也不用注册账号。页面上还列了不收的几类内容、联系方式的用途，以及提交之后去哪里看进度。
authors:
  - liugu2023
# Turnstile 的资源提示。
#
# 脚本是在组件挂载之后才由 JS 注入的——在那之前，浏览器根本不知道还要连
# challenges.cloudflare.com。于是「DNS → TCP → TLS → api.js → 真正的验证包」
# 这一整串都排在页面加载**之后**才开始，白等一两秒。
#
# 这里先把能提前做的两件事做掉（都不执行脚本，所以不会在 hydrate 之前动 DOM）：
#   preconnect / dns-prefetch：提前握手，省掉一整轮 DNS + TLS
#   prefetch api.js：把那个 302 引导页先拿下来（它之后才会去拉真正的验证包）
#
# 只放在这一页：别的页面用不到验证，没必要替它们连第三方。
head:
  - - link
    - rel: preconnect
      href: https://challenges.cloudflare.com
  - - link
    - rel: dns-prefetch
      href: https://challenges.cloudflare.com
  - - link
    - rel: prefetch
      href: https://challenges.cloudflare.com/turnstile/v0/api.js
---

# 告诉我们缺什么

没找到想要的东西，或者看到哪篇内容过时了、写错了，都可以在这里说一声。不用会 Git，也不用注册。

写的时候麻烦带一句**你是在什么情况下碰到的**。

有几类事情我们做不了，请别提交：盗版软件和破解工具、绕过校园网或教务系统的办法、需要登录才能看到且不便公开的内部信息、查别人的成绩或联系方式。

联系方式可以不填。填了也只是用来跟你核对细节，不会出现在任何公开页面上。

<FeedbackForm />

提交之后可以去[反馈执行状态](/wanted-status)看看它有没有被记上。
