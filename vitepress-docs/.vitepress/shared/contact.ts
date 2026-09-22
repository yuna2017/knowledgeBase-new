/**
 * 协会联系方式 / 反馈入口 / 招新文案的**唯一出处**。
 *
 * 引用它的地方（改这里一处，全都跟着动）：
 *   - `config.mts` 的页脚：ORGANIZATION、QQ_GROUP、FEEDBACK
 *   - `theme/RecruitBanner.vue`：RECRUITMENT
 *   - `theme/Layout.vue`：导航条上那个「缺什么？告诉我们」按钮（FEEDBACK.path / FEEDBACK.label）
 *   - `theme/FeedbackForm.vue`、`theme/FeedbackLookup.vue`：提交不上时的退路（QQ_GROUP）
 *   - `theme/FeedbackStatus.vue`：空状态里的「说一句就行」（FEEDBACK.path）
 *
 * 别在这些组件里再抄一份群号或路径：抄了就会各走各的，
 * 而且不会有任何报错（`scripts/test-feedback-api.mjs` 里有一条断言盯着这件事）。
 *
 * 放群号而不是二维码：QQ / 微信群二维码会失效（微信群码只有 7 天），
 * 而站点是 git + CI 构建的，失效后不会有任何报错——图片照常显示，
 * 只是扫不出来，没人会发现。群号是永久有效的。
 */
export const QQ_GROUP = {
  name: '2026燕山大学大学生网络信息协会交流群',
  number: '978801324',
  /** 一键加群链接。链接万一失效，页面上的群号仍然可以手动搜索加入 */
  joinUrl: 'https://qm.qq.com/q/1DSuxKBV5a'
}

// 对外邮箱暂时不在页脚展示，等自定义域名邮箱（xxx@yuna.team）配好后
// 在这里加回 CONTACT_EMAIL，并在 config.mts 的 footer.message 里补一段。

export const ORGANIZATION = '燕山大学大学生网络信息协会'

/**
 * 需求反馈入口。
 *
 * 和群号放在同一个文件里：页脚、导航和正文都指向这里，
 * 改一处全站生效，不会出现某处还指着旧路径的情况。
 *
 * 收集页用原生表单提交（见 theme/FeedbackForm.vue），接口是文档站同源的
 * /api/feedback —— 只要文档站能打开，接口域名就是可达的。
 */
export const FEEDBACK = {
  /** 收集页 */
  path: '/wanted',
  /** 公开的执行状态页 */
  statusPath: '/wanted-status',
  /** 页脚那一行和导航条按钮上显示的文字 */
  label: '缺什么？告诉我们'
}

/**
 * 首页顶部招新横幅。
 *
 * 横幅组件（theme/RecruitBanner.vue）和需要展示招新信息的地方都读这里，
 * 改一处即可。招募季结束把 enabled 改成 false，横幅全站消失，不用动组件。
 * 文案里沿用永久有效的群号 + 一键加群链接（见上方 QQ_GROUP 的说明）。
 */
export const RECRUITMENT = {
  enabled: false,
  text: '协会招新进行中：加入 QQ 群 ' + QQ_GROUP.number + '，共建 YUNA 知识库',
  link: QQ_GROUP.joinUrl
}
