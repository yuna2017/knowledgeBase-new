---
tags:
  - 域名
  - 学生权益
  - Cloudflare
authors:
  - liugu2023
---

# 域名申请与管理

## 学生包域名权益

通过 [GitHub 学生包](./tech-student-pack.md)认证后，可以在 Pack 页面查看当前域名合作商。2026 年 7 月核验时：

- 仍可核验到 `.TECH` 和 Name.com 的部分权益；
- 旧教程常写的 Namecheap 免费 `.me` 已不在当前学生包页面中；
- 可选域名、免费期、领取期限和排除项，以[学生包页面](https://education.github.com/pack)中每张优惠卡片的条款为准。

通常需要从学生包页面进入合作商专属入口，再按注册商要求注册或登录。不要从搜索结果中的陌生“代领”页面提交 GitHub 凭据。

> 很多活动只减免首年，续费、隐私保护和转出费用可能另算。下单前先找续费价格和转移规则，并给到期日设置日历提醒。

## 长期使用：Cloudflare Registrar 成本价

打算长期持有域名，可以比较 [Cloudflare Registrar](https://developers.cloudflare.com/registrar/) 和其他正规注册商：

- **按公布成本定价**：Cloudflare 表示按注册局和 ICANN 成本收费。价格会随注册局、汇率和税费变化，请查看实时价格
- 自带免费 DNS、CDN、SSL、DNSSEC、域名锁
- 限制：只支持其列表中的后缀，且注册在 Cloudflare 的域名必须使用 Cloudflare 权威 DNS
- 注册和转入是否可用，还取决于域名状态、后缀规则、付款方式和账户地区

如果使用学生优惠，先确认域名能否转出、需要等待多久，以及目标注册商是否支持该后缀。也可以跳过首年优惠，直接选择续费价格、支付方式和客服更适合长期使用的注册商。

## 域名能拿来干什么

- **个人主页 / 博客**：配合 Cloudflare Pages 或 GitHub Pages 使用
- **自定义收件地址**：Cloudflare Email Routing 可以把 `me@你的域名` 收到的邮件转发到现有邮箱，但它不提供用这个地址发信的完整邮箱服务
- **给自托管服务一个固定入口**：见[自托管入门](./tech-self-hosting.md)
- **统一个人入口**：简历、主页、邮箱后缀都可以放在同一个域名下

## 避坑提醒

1. **不要用来路不明的"永久免费域名"**（如某些免费二级域分发站）：随时可能被回收，做正经站点不可靠。
2. 查看注册商是否为该后缀提供 WHOIS 隐私保护；不同后缀的公开信息规则并不相同。
3. 域名续费记得设自动续费或日历提醒。开启自动续费前，也要确认国际银行卡、币种转换和余额是否可用。
4. 域名注册和 ICP 备案是两件事。是否需要备案主要看服务是否部署在中国大陆并向公众提供，不只看是不是 `.cn`。
5. 使用中国大陆服务器时，接入商通常会核验实名信息和域名注册服务机构。境外注册商持有的域名可能需要转入工信部批准的境内注册服务机构后才能完成备案，办理前先问云厂商。
6. 服务部署在中国大陆以外通常不办理 ICP 备案，但仍要考虑大陆访问速度、跨境数据和个人信息处理要求。`.cn` 等域名本身还可能有额外的实名或注册规则。

## 参考链接

- [GitHub 学生包官方页面](https://education.github.com/pack)
- [Cloudflare Registrar 官方文档](https://developers.cloudflare.com/registrar/)
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- [工信部 ICP/IP 地址/域名信息备案管理系统](https://beian.miit.gov.cn/)
