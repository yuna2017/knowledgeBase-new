---
description: 学生包、Pages 建站和开源软件这些内容都默认你有 GitHub 账号、会基本的 Git 操作。本文只讲最常用的部分：Git 的安装与初始配置、第一次提交、把本地仓库连到 GitHub，以及之后往哪个方向继续学。
tags:
  - Git
  - GitHub
  - 开发入门
authors:
  - liugu2023
  - HaoxiangXia
---

# Git 与 GitHub 入门

> 本板块的很多内容（学生包、Pages 建站、开源软件）都默认你有 GitHub 账号、会基本的 Git 操作。这页只写最常用的部分。

## 为什么要学

- 不知道每次修改了什么——代码版本管理，避免**大作业_v1.zip、大作业_v2_最终版.zip、"最终版_v2_真最终版.zip"、大作业_v3_真·打死不改版.zip**
- 多人同时修改同一个文件
- 恢复到之前的版本/误删的内容
- 申请 [GitHub 学生包](./tech-student-pack.md)的前提是有 GitHub 账号
- 对部分技术岗位，整理良好的公开仓库可以作为作品展示；课程代码和含敏感信息的项目不要为了求职全部公开
- 用 [Cloudflare Pages](./tech-cloudflare.md) / GitHub Pages 部署网站都从 Git 仓库开始

## 安装与初始配置

本教程使用 [VS Code](https://code.visualstudio.com/) 作为 Git 图形化界面，安装时全部点 Next 保持默认即可。

### 安装Git
[https://git-scm.com/downloads](https://git-scm.com/downloads)（在安装过程中勾选“使用VSCode作为Git的默认编辑器”，其他默认）
### 配置git身份：（唯一需要敲终端的一步）

```bash
git config --global user.name "你的名字"
git config --global user.email "你的GitHub邮箱"
```

## Git核心概念
- 工作区（Working Directory）：你正在编辑的项目文件
- 暂存区（Staging Area）：临时存放改动的地方
- 版本库（Repository）：存放所有版本信息的历史快照
```
[你编辑的文件]  -- 点击文件旁的 (+) -->  [暂存的更改]  -- 输入信息点 Commit -->  [生成不可篡改的存档点]
 (工作区)                                 (暂存区)                                (版本库)

```

## Git工作流程
- 流程：工作区 → 暂存区 → 版本库
- 核心操作（通过VSCode图形化界面完成）：
  - `git init`：初始化一个新的Git仓库
  - `git clone`：克隆远程仓库到本地
  - `git status`：查看当前工作区和暂存区状态
  - `git add`：将工作区的改动添加到暂存区
  - `git commit`：将暂存区的内容提交到版本库
  - `git push`：将本地版本库的内容推送到远程仓库

> tip：中国大陆访问 GitHub 可能出现连接或下载不稳定。不要在来源不明的“镜像加速”网站输入 GitHub 凭据，也不要默认镜像内容与原仓库同步。只需要最新代码时，可用 `git clone --depth 1 <官方仓库地址>` 减少下载量。

## 第一次提交

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

### 进阶使用说明：这三种东西严禁提交！

1. **密码与密钥**：`.env`、API Key、Token、服务器私钥。
2. **本地环境与庞大依赖**：Python 的虚拟环境文件夹（`.venv/`）、Node 的依赖包（`node_modules/`）。
3. **临时编译产物**：`__pycache__/`、`.exe`、`.log`。

> **解法**：在项目根目录新建一个 `.gitignore` 文件，把不需要上传的文件夹名字写进去（例如在里面写一行 `.env`），VS Code 会自动将它变灰忽略。

> 如果密钥或访问令牌已经提交，即使随后删除文件也不够。应立即到对应平台撤销并更换密钥，再处理 Git 历史。



## 连接 GitHub：零命令一键推送到云端（5 min）

- 注册GitHub账号（https://github.com/join）（注册一个简短的英文用户名）

### 回到VS Code：

1. 确保左侧源代码管理面板显示当前分支为 `main`。
2. 点击醒目的蓝色按钮 **“Publish Branch（发布分支到 GitHub）”**。
3. 浏览器会自动弹出 GitHub 网页授权窗口，点击 **Authorize** 允许 VS Code 访问。
4. 随后在 VS Code 顶部弹出的选择框中：
* 选择 **Publish to GitHub public repository**（公开仓库，方便展示）。


5. 推送完成后，右下角弹窗点击 **“Open on GitHub”**，即可在浏览器中看到自己的代码仓库已成功上线！

> 💡 **后续同步日常**：
> 以后在本地每次写完代码，只要点击“暂存(+) → 提交(Commit)”，然后点击编辑器左下角的 **“同步更改（↻ 环形箭头）”**，修改就会一键同步上云。

---


### 进阶：网络与连接方式
#### 什么是 SSH？
连接 GitHub 主要有两种方式：HTTPS 和 SSH。

- HTTPS（钥匙串认证）：每次通信像用账号密码登录（VS Code 会借助系统凭据管理器自动帮你记住，体验也很顺畅，但偶发凭据失效）。

- SSH（门禁卡认证）：它会生成一对密钥——私钥（保存在你的电脑里，绝对不能给别人）和公钥（上传贴到 GitHub 网页上）。两边像“对暗号”一样直接验证，安全、稳定，且一劳永逸无需反复输入凭据，还能有效避开国内部分运营商对 HTTPS 网页端口的干扰。

---


## 进阶路线

- **分支与合并**：`git branch` / `git merge`，多人协作或试验性改动时用
- **Pull Request**：参与开源项目（包括给本知识库[投稿](/CONTRIBUTING)）的标准流程
- **GitHub Pages**：仓库设置里开启，免费托管个人主页
- **GitHub Actions**：自动跑测试、自动部署

---

## 推荐学习资源

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)：官方书，免费在线阅读
- [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)：可视化交互练习，分支概念一玩就懂
- [GitHub Skills](https://skills.github.com/)：官方互动教程
- [GitHub 身份验证说明](https://docs.github.com/en/authentication)
- [GitHub SSH over 443](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)