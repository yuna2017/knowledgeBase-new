---
tags:
  - Git
  - GitHub
  - 开发入门
authors:
  - liugu2023
---

# Git 与 GitHub 入门

> 本板块的很多内容（学生包、Pages 建站、开源软件）都默认你有 GitHub 账号、会基本的 Git 操作。这页只写最常用的部分。

## 为什么要学

- 课程大作业 / 毕设的代码需要版本管理，避免 "最终版_v2_真最终版.zip"
- 申请 [GitHub 学生包](./tech-student-pack.md)的前提是有 GitHub 账号
- 对部分技术岗位，整理良好的公开仓库可以作为作品展示；课程代码和含敏感信息的项目不要为了求职全部公开
- 用 [Cloudflare Pages](./tech-cloudflare.md) / GitHub Pages 部署网站都从 Git 仓库开始

## 安装与初始配置

Windows 用户直接安装 [Git for Windows](https://git-scm.com/download/win)（自带 Git Bash）。装完先配置身份：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

> 中国大陆访问 GitHub 可能出现连接或下载不稳定。不要在来源不明的“镜像加速”网站输入 GitHub 凭据，也不要默认镜像内容与原仓库同步。只需要最新代码时，可用 `git clone --depth 1 <官方仓库地址>` 减少下载量。

## 第一次提交

先在项目根目录创建 `.gitignore`，排除 `.env`、密钥、构建产物和不该上传的大文件。然后逐步检查和提交：

```bash
git init                       # 把当前文件夹变成 Git 仓库
git status                     # 查看哪些文件发生了变化
git add README.md src/main.py  # 只暂存准备提交的文件
git diff --staged              # 提交前检查暂存区内容
git commit -m "添加课程作业框架"
git log --oneline              # 查看提交历史
```

日常循环是“修改 → `git status` → 选择性 `git add` → `git diff --staged` → `git commit`”。`git add .` 会暂存当前目录下的全部改动，新手先不要把它当默认操作。

如果只是查看旧提交，用 `git show <提交号>`。`git checkout <提交号>` 会进入 detached HEAD 状态，不等于安全地“回到历史版本”。已经提交并推送的错误通常用 `git revert <提交号>` 生成反向提交；未提交的改动在删除前先复制、提交或暂存，不要直接照抄 `git restore .`。

> 如果密钥或访问令牌已经提交，即使随后删除文件也不够。应立即到对应平台撤销并更换密钥，再处理 Git 历史。

## 连接 GitHub

1. 注册 [GitHub](https://github.com/) 账号（建议用户名取得正式一点，以后简历要写）
2. 开启两步验证（2FA）。GitHub 会对部分用户强制启用，但不应理解为所有新账号在同一时点强制。中国大陆手机号接收短信可能不稳定，优先使用通行密钥或身份验证器，并保存恢复码
3. 配置 SSH 密钥、使用 HTTPS + Git Credential Manager，或使用 [GitHub Desktop](https://desktop.github.com/)
4. 推送代码：

```bash
git remote add origin git@github.com:用户名/仓库名.git
git branch -M main
git push -u origin main
```

GitHub 不接受账户密码作为 Git 的 HTTPS 密码。命令行可使用 Git Credential Manager 或 personal access token；使用 SSH 时，若网络阻断默认端口，可按 [GitHub 官方文档](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)配置 SSH over 443，不要改用要求上传私钥的第三方中转。

## 进阶路线

- **分支与合并**：`git branch` / `git merge`，多人协作或试验性改动时用
- **Pull Request**：参与开源项目（包括给本知识库[投稿](/CONTRIBUTING)）的标准流程
- **GitHub Pages**：仓库设置里开启，免费托管个人主页
- **GitHub Actions**：自动跑测试、自动部署

## 推荐学习资源

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)：官方书，免费在线阅读
- [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)：可视化交互练习，分支概念一玩就懂
- [GitHub Skills](https://skills.github.com/)：官方互动教程
- [GitHub 身份验证说明](https://docs.github.com/en/authentication)
- [GitHub SSH over 443](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)
