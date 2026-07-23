---
tags:
  - 自托管
  - 云服务
  - 内网穿透
authors:
  - liugu2023
---

# 自托管入门

## 你需要什么

- **云主机**：不用放在宿舍，适合长期在线。海外免费资源存在注册、容量、回收和网络限制，不能当成稳定保证，见[免费云资源指南](./tech-free-cloud.md)
- **宿舍闲置电脑 / 树莓派**：适合内网练习，但受断电、校园网规则和上行带宽限制
- **旧手机**：Termux 可以运行轻量服务，但 Android 后台限制、休眠和电池状态会影响长期运行

有自己的[域名](./tech-domain.md)会更方便访问和管理。

## 核心问题：校园网没有公网 IP 怎么办

宿舍设备在校园网 NAT 之后，外网无法直接访问。常见做法是**内网穿透**：

- **Cloudflare Tunnel**：不需要公网 IP，设备主动连接 Cloudflare。Tunnel 不等于私网，公开域名仍需配置 Cloudflare Access 或应用自身认证。**校园网环境下的校园网服务无法使用cf tunnel，中国电信等运营商服务可以使用**
- **Tailscale**：适合只有自己或少量成员访问的场景。免费用户数和设备数以[当前定价页](https://tailscale.com/pricing)为准，校园网 NAT 和中继速度需实测
- **frp 自建**：需要一台有公网 IP 的服务器做中转，控制力较强，但安全配置和维护门槛也更高

## 适合先试的服务

按从易到难：

| 服务 | 用途 | 部署难度 |
|------|------|----------|
| **Uptime Kuma** | 网站/服务在线状态监控 | ⭐ 一行 Docker 命令 |
| **Memos** | 轻量碎片笔记（类似私有微博） | ⭐ |
| **RustDesk Server** | 自建远程桌面中继 | ⭐⭐ |
| **Alist / OpenList** | 聚合网盘挂载与文件分享 | ⭐⭐ |
| **Immich** | 私人相册（谷歌相册替代） | ⭐⭐⭐ 吃内存 |
| **Nextcloud** | 全功能私有云盘 | ⭐⭐⭐ |

如果项目官方提供并维护 Compose 配置，可以优先使用 Docker Compose。启动前仍要检查镜像来源、挂载目录、数据库密码、端口和升级说明，不能只复制一条 `docker compose up -d`。

## 安全底线（必读）

1. Tunnel 也可能把服务公开到互联网。配置 Access、Tailscale ACL 或应用认证，只开放必要用户。
2. 改掉默认密码，定期更新系统与镜像；容器尽量不以 root 运行，只挂载必要目录。
3. **遵守校园网使用规定**：未经许可，不在宿舍网络对外提供公开服务、端口转发或流量转售。
4. 若网站部署在中国大陆服务器并向公众开放，先确认 ICP 备案等要求。境外托管也要遵守内容和数据处理规定。
5. 网盘、相册等服务必须另做备份，并实际测试恢复流程。自托管不等于不会丢数据。

## 学习资源

- [Awesome-Selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted)：自托管软件大全（英文）
- [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- 各项目的官方文档、发行说明和安全公告
