---
description: 学生包、Pages 建站和开源软件这些内容都默认你有 GitHub 账号、会基本的 Git 操作。本文按难度分级（入门 → 进阶 → 挑战），带你逐步掌握现代代码版本控制与开源协作流程。
tags:
  - Git
  - GitHub
  - 开发入门
authors:
  - HaoxiangXia
---

# Git 与 GitHub 实战教程

> 本板块的很多内容（学生包、Pages 建站、开源软件）都默认你有 GitHub 账号、会基本的 Git 操作。本文按任务难度分级（**入门 → 进阶 → 挑战**），带你从本地基础操作起步，逐步掌握代码上云、分支合并与开源协作。

---

## 入门难度：本地版本控制与基础操作

### 为什么要用版本控制？

- **杜绝混乱**：代码版本管理，彻底告别 **`大作业_v1.zip`、`大作业_v2_最终版.zip`、`"最终版_v2_真最终版.zip"`、`大作业_v3_真·打死不改版.zip`** 的繁琐命名。
- **版本回溯**：随时恢复到历史版本，找回误删或修改前的内容。
- **多人协作**：允许多人同时修改同一个工程而不互相覆盖。
- **账号权益**：拥有 GitHub 账号是申请 [GitHub 学生包](../../tech-student-pack.md) 的前置条件。
- **成果展示**：整理良好的公开仓库可以作为个人技术作品集展示（注意：敏感信息与课程专属代码切勿公开）。
- **云端部署**：使用 [Cloudflare Pages](../../tech-cloudflare.md) 或 GitHub Pages 部署网站，均从 Git 仓库开始。

---

### 任务 1：注册 GitHub 账号

> 建议在开始编写代码前提前完成注册，以便后续顺利连接云端。

1. **访问官网**：打开 [https://github.com/join](https://github.com/join)。
2. **用户名规范**：个人主页地址为 `github.com/你的用户名`，建议使用简短规范的英文名或拼音缩写，避免随意输入的无意义字符。
3. **邮箱选择**：
   - 优先使用常用个人邮箱（如 QQ、163、Gmail）完成初始注册，确保能正常接收激活邮件。
   - 如已有学校认证邮箱（`@edu.cn`），注册后可在 Settings → Emails 中追加绑定，后续用于免审核领取 [GitHub 学生包](../../tech-student-pack.md)。
4. **注意事项**：
   - 注册时的人机验证对网络质量有一定要求，若图片加载较慢可尝试切换手机热点。
   - 提交注册后，需前往邮箱点击验证链接激活账号。

---

### 任务 2：安装 VS Code 与 Git

本教程使用 [VS Code](https://code.visualstudio.com/) 作为 Git 图形化操作界面，安装时保持默认选项即可。

#### 1. 安装 Git
访问 [https://git-scm.com/downloads](https://git-scm.com/downloads) 下载并安装（安装过程中建议勾选“Use Visual Studio Code as Git's default editor”，其余设置保持默认）。

#### 2. 配置 Git 身份（唯一需要终端命令的初始步骤）
打开系统终端（Windows 可按 `Win+X` 打开终端/PowerShell，macOS 打开 Terminal），执行以下命令配置用户名与邮箱：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的GitHub邮箱"
```

---

### 任务 3：理解核心概念——快照与哈希值

#### 1. 什么是快照（Snapshot）？
Git 不记录琐碎的行级差量补丁，而是把工程作为一个整体管理：**每次提交（Commit），都相当于为整个目录拍摄一张完整的“快照”**。
- **改动过的文件**：完整保存改动后的新版本。
- **未改动的文件**：仅保留指向已有快照的链接，不浪费额外磁盘空间。
- **优势**：回溯历史时无需像倒带一样逐行计算累加差异，而是直接切换到对应快照的完整状态。

#### 2. 为什么每次提交都有哈希值（如 `7f3a8b2`）？
每次执行 Commit 时，Git 会把该次提交的文件内容、元数据及上一次提交的引用打包，通过哈希算法（SHA-1）计算出一串 40 位的十六进制字符串（通常简写为前 7 位，如 `3b1a7d6`）。

哈希值的核心作用：
- **内容一致则哈希必相同**：文件内容只要未变，计算出的哈希完全一致。
- **内容微变则哈希剧变**：哪怕仅改动一个字符或空格，哈希值都会完全不同。
- **秒级比对匹配**：在比对本地代码与远程代码是否一致时，Git 无需逐行扫描海量文件，只需比对两端哈希值即可在毫秒级内确认是否匹配，同时也保障了历史记录不可被篡改。

#### 3. 三大区域与流转关系
```text
[编辑的文件]  -- 点击文件旁 (+) -->  [挑选好的变更]  -- 输入说明并点 Commit -->  [生成带唯一哈希的快照]
  (工作区)                              (暂存区)                                   (版本库)
```
- **工作区（Working Directory）**：当前在电脑磁盘和 VS Code 编辑器中直接读写的文件。
- **暂存区（Staging Area）**：快照的预备区。在真正存盘前，选择本次需要提交的具体改动。
- **版本库（Repository）**：本地 `.git` 目录维护的快照数据库，保存不可篡改的历史快照与哈希索引。

---

### 任务 4：完成本地首次提交

在终端或 VS Code 集成终端中执行基础提交流程：

```bash
git init                       # 初始化当前目录为 Git 仓库
git status                     # 查看当前工作区与暂存区状态
git add README.md src/main.py  # 将指定文件加入暂存区
git diff --staged              # 提交前检查暂存区内容
git commit -m "添加课程作业框架"  # 提交生成版本快照
git log --oneline              # 查看单行历史提交记录
```

> **日常建议**：标准循环为 `修改 → git status → 选择性 git add → git diff --staged → git commit`。`git add .` 会暂存当前目录下的全部改动，初学阶段建议按需暂存指定文件。
>
> 查验旧版本建议使用 `git show <提交号>`。`git checkout <提交号>` 会进入 detached HEAD 状态，并不等同于安全的历史回退。如需撤销已推送的提交，推荐使用 `git revert <提交号>` 生成反向提交。

---

## 进阶难度：代码上云与 SSH 连接

### 任务 5：配置 .gitignore（严禁提交的三类文件）

在实际项目中，以下三类内容不应提交至版本库：

1. **凭据与敏感密钥**：`.env`、API Key、Token、私钥证书。
2. **本地环境与第三方依赖**：Python 虚拟环境（`.venv/`）、Node 依赖包（`node_modules/`）。
3. **临时编译与日志文件**：`__pycache__/`、`.exe`、`.log`。

> **处理方式**：在项目根目录新建 `.gitignore` 文件，将需忽略的文件或目录名称写入其中（例如写入一行 `.env`），VS Code 会自动将其置灰并忽略跟踪。
>
> **安全警告**：若密钥已误提交并推送至公开仓库，仅在后续提交中删除文件并不能消除安全隐患（历史快照中仍存留原文件）。需立即在对应服务平台吊销更换密钥，再处理 Git 提交历史。

---

### 任务 6：将本地仓库推送到 GitHub

通过 VS Code 图形界面一键推送到远程仓库：

1. **打开源代码管理面板**：点击 VS Code 左侧活动栏的**第 3 个图标**（分叉分支形状图标，快捷键 `Ctrl+Shift+G`），确认左侧面板当前分支为 `main`。
2. **发布分支**：点击醒目的蓝色按钮 **“Publish Branch（发布分支到 GitHub）”**。
3. **完成授权**：浏览器弹出 GitHub 授权窗口后，点击 **Authorize** 允许 VS Code 访问账号。
4. **选择仓库属性**：在 VS Code 顶部提示栏中选择 **Publish to GitHub public repository**（公开仓库）。
5. **查验上线**：推送完成后，点击右下角提示中的 **“Open on GitHub”** 即可在浏览器中查验代码。

> **后续日常同步**：后续本地写完代码后，点击“暂存(+) → 提交(Commit)”，再点击 VS Code 状态栏左下角的 **“同步更改（↻ 环形箭头）”**，即可将修改推送到云端。

---

### 任务 7：配置 SSH 密钥连接（推荐）

#### 1. 什么是 SSH？
**SSH（Secure Shell）** 是一种网络加密协议，类似于一套非对称验证机制：
- **公钥（Public Key）**：文件名为 `id_ed25519.pub`，可公开上传并配置在 GitHub 网页后台。
- **私钥（Private Key）**：文件名为 `id_ed25519`，妥善存放在本地电脑的 `~/.ssh/` 目录，绝对不可外传。

推送代码时，GitHub 会利用公钥发起校验，本地私钥在后台完成静默解密对齐，无需每次输入密码。

#### 2. 主流使用 SSH 的原因
- **密码推送已被官方废弃**：GitHub 不再支持直接通过账号密码执行 `git push`；使用 HTTPS 若凭据失效需重新配置 Personal Access Token（PAT），流程繁琐。
- **免密静默体验**：单台设备配置一次 SSH 公钥后，后续无论在 VS Code 还是终端操作均无需重复验证。
- **生产与服务器环境标配**：云服务器与容器多为无图形界面环境，SSH 密钥是通用的标准方案。
- **网络稳定性更佳**：避开部分网络环境下 HTTPS 端口的证书波动，配合 443 端口连接更顺畅。

#### 3. 配置步骤

##### 第一步：生成密钥对（单台电脑配置一次即可）
在终端中执行以下命令（将邮箱替换为你自己的 GitHub 注册邮箱）：

```bash
ssh-keygen -t ed25519 -C "你的GitHub邮箱@example.com"
```
提示输入保存路径与密码时，**连续回车 3 次** 保持默认（不设置 passphrase）。

##### 第二步：复制公钥文本
- **Windows（PowerShell）**：
  ```powershell
  Get-Content ~/.ssh/id_ed25519.pub
  ```
- **macOS / Linux**：
  ```bash
  cat ~/.ssh/id_ed25519.pub
  ```
复制输出中以 `ssh-ed25519` 开头整行字符。

##### 第三步：将公钥添加至 GitHub
1. 打开 GitHub，点击右上角头像 → **Settings**。
2. 左侧导航进入 **SSH and GPG keys**。
3. 点击 **New SSH key**，填写 Title（如 `Laptop`），将复制的文本粘贴进 Key 输入框后保存。

##### 第四步：切换本地仓库为 SSH 地址
在 VS Code 终端中执行：

```bash
git remote set-url origin git@github.com:你的GitHub用户名/你的仓库名.git
git remote -v               # 确认地址变更为 git@github.com:...
ssh -T git@github.com       # 首次连通性校验，提示输入 yes 并回车
```
若终端返回 `Hi 你的用户名! You've successfully authenticated...`，即说明 SSH 配置成功。

---

## 挑战难度：分支管理与开源协作

### 挑战 1：分支管理与合并冲突（Branch & Merge）

单人简单任务通常可在 `main` 分支完成，但在团队协作或尝试大型重构时，分支是隔离风险的关键工具。

#### 1. 为什么要使用分支？
- **痛点**：若直接在 `main` 主干上编写尚未测试完成的新功能，代码中途损坏会导致无法交作业或阻断他人。
- **解法**：从主干拉出独立**分支（Branch）**。在分支上尽情改动，即便出现错误也不会影响 `main` 主线的稳定性。
- **本质**：在 Git 的快照模型中，分支并非对所有文件进行物理拷贝，而是一个极其轻量的**可移动引用指针**，指向当前最新的一张快照，创建和切换成本极低。

#### 2. 合并操作（Merge）
新功能开发并验证无误后，将分支改动合并入主干：

```text
[main 分支]      C1 ─── C2 ─────────── C4 ─────── C5 (合并后的新快照)
                          \                     /
[feature 分支]             ─── C3 (开发新特性) ───
```

#### 3. 解决合并冲突（Conflict）
当两个分支同时修改了**同一个文件的相同行**时，Git 无法自动合并，会产生冲突标记。

VS Code 提供了直观的冲突解决方案，在冲突代码块上方可直接点击选择：
- **Accept Current Change**（保留当前分支改动）
- **Accept Incoming Change**（保留并入分支改动）
- **Accept Both Changes**（同时保留双方改动）

挑选确认后保存文件，重新将文件暂存(+)并提交(Commit)，即可完成冲突化解。

#### 4. 分支常用操作

##### 方式 A：VS Code 图形界面操作
1. **新建与切换**：点击 VS Code 左下角当前分支名（`main`），在顶部弹出框输入新分支名（如 `dev`），按回车自动创建并切换。
2. **代码提交**：在当前分支下正常修改并提交。
3. **分支合并**：
   - 点击左下角切回 `main` 分支。
   - 点击左侧源代码管理面板右上角 `...` → **分支 (Branch)** → **合并分支... (Merge Branch...)**。
   - 选择要并入的分支名称即可完成合并。

##### 方式 B：终端命令
```bash
git switch -c feature-test   # 创建并切换到新分支（等价于旧命令 git checkout -b）
# ... 修改文件并执行提交 ...
git switch main              # 切回主分支
git merge feature-test       # 将 feature-test 分支合并到当前 main 分支
git branch -d feature-test   # 合并完成后清理临时分支
```

---

### 挑战 2：开源协作标准流程（Issue 与 PR）

在开源社区（或向本知识库[投稿](/CONTRIBUTING)）协作时，核心机制为 **Issue** 与 **Pull Request（PR）**。

#### 1. 什么是 Issue？
Issue 是开源项目的公开工单与讨论区：
- **Bug 报告**：运行项目时遇到异常（如“在 Windows 11 下启动报 404”）。
- **功能建议**：向作者提议新特性支持。
- **任务管理**：项目作者拆分需求并分配责任人。

> **规范**：提 Issue 时应包含基础三要素：**运行环境**（系统、语言版本）、**复现步骤**与**完整错误日志/截图**。

#### 2. 什么是 Pull Request（PR）？
外部开发者不具备直接向他人仓库推代码的权限。你在自己名下完成修改后，向原作者发起正式申请：**“请求（Request）项目作者拉取（Pull）我的代码合并入主干”**。

#### 规范贡献 5 步流程：
1. **Fork**：在目标仓库主页点击右上角 **Fork**，在自己账号下生成完整独立的副本仓库。
2. **克隆并建分支**：将自己名下的 Fork 仓库克隆到本地，新建功能分支：
   ```bash
   git switch -c fix-typo
   ```
3. **修改与推送**：本地完成修改与测试后，正常 Commit 并推送到自己的 GitHub 仓库。
4. **发起 PR**：访问原项目页面，点击醒目的 **“Compare & pull request”** 按钮，填写改动说明并提交。
5. **代码评审（Code Review）与合入**：原作者在线审查差异后点击 **Merge**，你的改动即正式并入项目主干，个人头像将永久进入贡献者列表。

> **提示**：在 PR 描述中写入 `Fixes #12`，当 PR 合并时，GitHub 会自动关联关闭对应的第 12 号 Issue。

---

### 挑战 3：持续学习路线

- **分支保护规则（Branch Protection）**：团队协作中锁定 `main` 分支，强制要求通过 PR 和至少一人代码审查后方可合入。
- **GitHub Pages**：在仓库设置中开启，免费托管静态个人主页与技术文档。
- **GitHub Actions**：自动化 CI/CD 工作流，实现提交代码后自动执行测试与站点构建。

---

## 推荐学习资源

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)：官方权威指南，免费在线阅读
- [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)：可视化交互式分支练习网站
- [GitHub Skills](https://skills.github.com/)：官方互动教程
- [GitHub 身份验证说明](https://docs.github.com/en/authentication)
- [GitHub SSH over 443](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)
- [Missing Semester：版本控制与 Git 数据模型](https://missing-semester-tw.github.io/2026/version-control/)：MIT 经典公开课，适合希望深入理解底层 DAG 图结构与对象存储的同学课后选读。
