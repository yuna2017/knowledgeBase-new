/**
 * Turnstile 机器人验证的**公开**配置。
 *
 * site key 本来就是公开的——它会出现在每个用到它的页面的 HTML 里，而且和域名绑定，
 * 所以写进仓库没有风险。**secret key 不能进仓库**，放在 Cloudflare Pages 项目的
 * 环境变量 `TURNSTILE_SECRET_KEY` 里。
 *
 * 两边必须成对配置，否则会静默失真：
 *
 *   - 只配了 site key：页面出验证，服务端不验 → 形同虚设
 *   - 只配了 secret：服务端要求令牌，而页面拿不出来 → **所有提交都被标成可疑**
 *     （不会丢数据，但统计里什么都看不到）
 *
 * 所以顺序是：先去 Cloudflare Dashboard 建好 widget、把 secret 配到 Pages 环境变量，
 * 再把下面的 site key 填上。**留空 = 整个功能关闭**：页面不加载任何第三方脚本，
 * 服务端也不做验证，回到蜜罐 + 耗时 + 限频那三样。
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAE-_0QdRKfmzxgR3'

/**
 * 与 functions/api/feedback/[[path]].js 里的 TURNSTILE_ACTION 必须一致。
 * 令牌是按 action 签的，对不上就说明是别处的令牌被拿来重放，接口会直接拒。
 */
export const TURNSTILE_ACTION = 'feedback'
