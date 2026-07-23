---
tags:
  - 科研工具
  - 文献
  - 学习资源
authors:
  - liugu2023
---

# 文献与科研工具指南

## 文献管理：Zotero

[Zotero](https://www.zotero.org/) 是免费开源的文献管理器，浏览器插件一键抓取文献、自动生成参考文献格式（支持国标 GB/T 7714）、配合 Word / WPS 插件在论文里插入引用。

**免费扩容同步（坚果云 WebDAV）：**

Zotero 的文献条目、标签和笔记通过数据同步保存；附件同步则使用 Zotero Storage 或 WebDAV。占用附件空间的不只是 PDF，还包括图片、EPUB、网页快照和其他同步文件。Zotero Storage 免费层的当前容量见[官方存储页面](https://www.zotero.org/storage)。

个人文献库可以把附件同步改为坚果云 WebDAV：

1. 坚果云官网 → 账户信息 → 安全选项 → 添加应用密码（注意：用生成的应用密码，不是登录密码）
2. Zotero → 设置 → 同步 → 文件同步方式改为 WebDAV，按坚果云当前帮助页填写服务器地址、账户和应用密码
3. 点 Verify Server 验证通过即可

- WebDAV 只替代附件文件同步，不替代 Zotero 的条目数据同步。
- Zotero 的 WebDAV 附件同步只适用于个人文献库，不支持 group library 的附件。需要小组共享附件时，应使用 Zotero Storage 或另行确认团队方案。
- 坚果云免费账户的上传、下载和存储限制可能变化，使用前查看其实时套餐说明。
- 不要安装来源不明的“一键配置”插件。手动配置失败时，先检查 WebDAV 地址、应用密码和 Zotero 官方故障排查说明。

**推荐插件**：Zotero 中文社区（[zotero-chinese.com](https://zotero-chinese.com/)）维护了插件商店和中文文档，翻译、茉莉花（中文文献元数据）、Better BibTeX 等按需安装。

## 论文排版：LaTeX / Typst

**Overleaf（在线 LaTeX）**

- 免费版适合单人课程论文和中小项目。当前免费计划通常只允许 **1 位协作者**，编译超时为 **10 秒**；限制可能调整，使用前查看官方计划页
- 超时的应对：草稿模式、压缩图片，或者把项目下载到本地用 TeX Live + VS Code 编译（完全免费且无限制）
- Overleaf 是境外在线服务，中国大陆连接不稳定时要定期下载项目备份。涉及未公开研究数据或个人信息时，先确认课题组和学校的数据要求

**Typst（排版工具）**

- 语法比 LaTeX 更简洁，编译速度快，官方在线编辑器 [typst.app](https://typst.app/) 免费用
- 中文社区已有不少大学论文模板和简历模板；写简历、作业报告、笔记非常合适
- 局限：部分期刊 / 学校只收 LaTeX 或 Word 格式，投稿前先确认要求

## 找文献

- **[Google Scholar](https://scholar.google.com/)**：覆盖面广，但在中国大陆不能作为稳定入口。不要使用要求登录、安装脚本或输入学校账号的第三方镜像
- **[arXiv](https://arxiv.org/)**：物理、数学、计算机领域的预印本，全部免费
- **[Semantic Scholar](https://www.semanticscholar.org/) / [Crossref](https://search.crossref.org/) / [OpenAlex](https://openalex.org/)**：查题名、DOI、作者和引用关系，可作为 Google Scholar 不稳定时的补充
- **[Connected Papers](https://www.connectedpapers.com/)**：用引用关系可视化相关论文，免费使用范围以网站当前说明为准
- **校内数据库**：优先从[燕山大学图书馆](https://library.ysu.edu.cn/)进入知网、万方、Web of Science 等数据库。能否访问取决于学校当年的采购范围，校外访问方式见[一网通办](./campus-service-index.md)

## 参考链接

- [Zotero 中文社区同步指南](https://zotero-chinese.com/user-guide/sync)
- [Zotero 官方同步说明](https://www.zotero.org/support/sync)
- [Zotero Storage](https://www.zotero.org/storage)
- [坚果云 WebDAV 配置官方帮助](https://help.jianguoyun.com/?p=3168)
- [Overleaf 免费版限制官方文档](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits)
- [Typst 官网](https://typst.app/)
- [燕山大学图书馆](https://library.ysu.edu.cn/)
