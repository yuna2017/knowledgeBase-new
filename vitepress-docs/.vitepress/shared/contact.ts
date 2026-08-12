/**
 * 协会联系方式。
 *
 * 页脚（.vitepress/config.mts）和首页的「加入我们」区块（theme/JoinUs.vue）
 * 都引用这里，改一处即可，不会出现两边不一致。
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
