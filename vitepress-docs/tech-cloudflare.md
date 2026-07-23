---
tags:
  - Cloudflare
  - 免费资源
  - 建站
authors:
  - liugu2023
---

# Cloudflare 免费额度说明

Cloudflare 是常见的 DNS、CDN 和边缘计算服务商。它有免费计划，适合个人网站、博客和小型 API；域名注册、超出免费计划或启用部分付费功能时，仍可能要求账单资料。

## 核心免费服务一览

| 服务 | 用途 | 免费计划说明 |
| --- | --- | --- |
| CDN + DNS | 网站加速、域名解析 | 免费计划不按普通 CDN 流量的 GB 数计费，但受缓存规则、合理使用政策和服务条款约束 |
| Pages | 静态网站托管 | 有免费计划；构建次数、函数调用等限制查看 [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Workers | 边缘无服务器函数 | 有免费计划；请求量、CPU 时间等限制查看 [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| R2 | 对象存储（兼容 S3） | 有免费用量，Internet egress 不收费；存储、操作请求和其他功能看 [R2 定价](https://developers.cloudflare.com/r2/pricing/) |
| D1 / KV | 数据库与键值存储 | 均有免费用量，读写、存储等限制分别以产品文档为准 |
| Tunnel | 将内网服务接入 Cloudflare | 可免费使用基础功能，但公开服务仍需自己配置鉴权和安全策略 |
| Turnstile | 验证码 | 有免费计划，使用范围和限制看官方文档 |
| Email Routing | 自定义域名收件转发 | 可把收到的邮件转发到现有邮箱，不提供以该域名发信的完整邮箱服务 |
| Zero Trust / Access | 身份验证和访问控制 | 有免费计划，人数和功能限制查看 [Zero Trust 定价](https://www.cloudflare.com/plans/zero-trust-services/) |

## 常见用法

### 1. 免费托管个人网站 / 博客

用 **Cloudflare Pages** 托管静态网站（Hexo、Hugo、VitePress、Astro 等构建产物）：

1. 把项目推到 GitHub
2. 在 Cloudflare Dashboard 中创建 Pages 项目，关联仓库
3. 配置构建命令和输出目录，之后每次 push 自动部署
4. 免费获得 `*.pages.dev` 域名，也可绑定自己的域名

### 2. 免费运行后端逻辑

**Workers** 可以在边缘节点运行 JavaScript/TypeScript，也提供受支持范围内的 Python 运行时；Rust 等语言通常编译为 WebAssembly。它适合小型 API、Webhook 和定时任务，但并不等同于一台可以任意安装依赖的普通服务器，使用前应检查运行时兼容性。

### 3. 免费对象存储

**R2** 兼容 S3 API，传到公网的 Internet egress 不收费，适合放图床、静态资源和备份文件。不过，存储容量、A/B 类操作、数据取回和其他功能可能计入账单，使用前应看当前定价页并设置账单提醒。

### 4. 内网穿透

**Cloudflare Tunnel**（`cloudflared`）可以让 Cloudflare 连接本地或校园网内的服务，不要求用户持有公网 IP，也不需要在路由器上开放入站端口。

Tunnel 不是自动的安全屏障。没有配置 Cloudflare Access 或应用自身登录时，服务仍可能直接暴露给公网；部署前还要确认校园网规定，及时更新系统，并避免公开管理后台、文件共享和没有密码的开发服务。**注意：校园网环境下的校园网服务无法使用该服务，中国电信等运营商服务可以使用。**

### 5. 域名相关

- **Cloudflare Registrar** 按其公布的注册局和 ICANN 成本定价。它不是免费服务，支持的后缀和实时价格见官方页面。
- 在其他注册商购买的域名，只有在后缀受支持、注册商允许修改权威 DNS 等条件满足时，才能完整接入 Cloudflare。部分功能还要求把域名设为 Cloudflare 的权威 DNS。

## 注意事项

- 普通 Free / Pro 计划不包含 [Cloudflare China Network](https://developers.cloudflare.com/china-network/)，不能据此承诺中国大陆低延迟或境内节点。China Network 是单独的企业服务，并要求满足 ICP 备案等条件。
- Cloudflare 免费 CDN 不能替代中国大陆服务器所需的备案，也不能解决跨境访问和数据合规问题。面向大陆公众长期提供服务时，应单独评估部署区域、备案和个人信息处理要求。
- 免费计划受服务条款和合理使用政策约束，不适合把视频代理、文件分发等高流量场景默认当成“无限流量”。
- Workers 免费计划有 CPU 时间等限制，不适合重计算任务；具体限制以当前文档为准。

## 参考链接

- [Cloudflare 开发者文档](https://developers.cloudflare.com/)
- [Cloudflare R2 定价](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Registrar](https://developers.cloudflare.com/registrar/)
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- [Cloudflare China Network](https://developers.cloudflare.com/china-network/)
