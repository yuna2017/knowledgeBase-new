---
tags:
  - 云服务
  - 免费资源
  - 建站
authors:
  - liugu2023
---

# 免费云资源指南

## 按需求选

| 需求 | 推荐 |
|------|------|
| 静态网站 / 博客 / 课程作业展示 | Cloudflare Pages、GitHub Pages、Vercel、Netlify |
| Next.js 应用 | Vercel |
| 需要一台可自行管理的服务器 | Oracle Cloud Free Tier（能否创建取决于区域容量） |
| 数据库 + 登录鉴权 + 存储 | Supabase |
| 只要一个 Postgres 数据库 | Neon |
| 容器 / 后端服务托管 | Render、Koyeb（有冷启动限制） |

## 静态托管

GitHub Pages、Cloudflare Pages、Netlify 和 Vercel 都有免费使用方式，但账户要求、可接受用途和计费模型不同，不能一概理解为“无需信用卡、长期不限量”。

- **Cloudflare Pages**：有免费计划，适合个人静态站点。限制见 [Cloudflare 免费额度说明](./tech-cloudflare.md)。
- **GitHub Pages**：适合公开项目文档、个人主页和静态站点，使用范围受 [GitHub Pages 条款](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)约束。
- **Vercel Hobby**：面向个人、非商业用途。团队或商业项目应先查看 [Vercel 计划说明](https://vercel.com/docs/plans/hobby)。
- **Netlify Free**：新账户采用 credit-based 计费模型。构建、带宽等会消耗 credits，规则见 [Netlify 计费文档](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)。

> Heroku 普通免费层已经取消，但 GitHub 学生包可能提供单独的学生优惠；Fly.io、Railway 等服务也不应按旧教程默认存在长期免费层。每次部署都从官方定价页开始确认。

## Oracle Cloud Always Free：免费 VPS

Oracle Cloud Free Tier 包含部分 Always Free 资源，适合练习 Linux、Docker 和服务器运维，但注册成功不代表一定能创建想要的实例。

- **Ampere A1 Flex（ARM）** 的免费资源是账户总配额，不等于保证提供一台达到上限配置的主机；能否创建受 home region 库存影响。
- 未升级的 Free Tier tenancy 与主动升级为付费账户的计费行为不同。注册时可能有银行卡预授权；升级账户、创建付费资源或超出适用范围后，仍可能产生费用。
- Oracle 没有面向普通用户的中国大陆 OCI 公有云区域。大陆访问延迟、注册验证、国际银行卡和跨境数据都需要单独评估。
- 云主机的系统更新、防火墙、密钥、备份和被入侵后的费用风险都由使用者负责。

## 数据库与后端即服务（BaaS）

- **Supabase**：有免费计划，包含数据库、鉴权、存储等能力。项目数量、暂停策略和各项额度查看 [Supabase 定价页](https://supabase.com/pricing)。
- **Neon**：Serverless Postgres，适合开发测试；计算休眠、存储和流量限制查看 [Neon 定价页](https://neon.com/pricing)。
- **其他可选**：MongoDB Atlas、Turso、Upstash、Firebase / Firestore。它们的免费项目、休眠和超额计费规则各不相同。

## 学生专属云额度

- **DigitalOcean**：GitHub 学生包可能提供新用户优惠，但有截止日期、使用期限和排除服务。详见[GitHub 学生包与教育优惠](./tech-student-pack.md)和学生包实时页面。
- **Azure for Students**：全球版 Azure 提供学生优惠，具体额度和服务以 [Azure for Students](https://azure.microsoft.com/en-us/free/students)为准。它不是世纪互联运营的 Azure 中国。

## 注意事项

1. **先弄清账户是否已经升级为付费**。GCP Free Trial 在用户没有手动升级时不会自动收费；AWS 新 Free account plan 到期或用完也不会自动转成付费计划。其他平台的逻辑不能照搬，逐家阅读官方说明。
2. **绑定银行卡后设置预算和用量告警**，但不要把告警当成自动断电开关。预算提醒通常不会替你停止资源。
3. **删除测试资源时检查附属项目**，例如磁盘、快照、固定 IP、对象存储和数据库备份；关机不一定停止计费。
4. **免费计划不适合关键生产服务**：可能没有 SLA，资源会休眠、回收或随政策调整。
5. 多数上述海外平台没有普通中国大陆区域，可能要求国际支付方式，访问速度和注册验证也不稳定。Cloudflare 免费 CDN 不会自动提供中国大陆节点。
6. 面向中国大陆公众的网站如果部署在大陆服务器，应向接入商确认 ICP 备案；处理个人信息或把数据传到境外时，还要评估隐私和数据合规要求。

## 参考链接

- [Oracle Cloud Free Tier 官方文档](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [Vercel Hobby 计划](https://vercel.com/docs/plans/hobby)
- [Netlify credit-based pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [Google Cloud 免费计划](https://cloud.google.com/free/docs/free-cloud-features)
- [AWS Free Tier](https://aws.amazon.com/free/)
- [工信部备案系统](https://beian.miit.gov.cn/)
