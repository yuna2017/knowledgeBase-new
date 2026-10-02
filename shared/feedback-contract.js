/** Public feedback vocabulary, shared by the browser and Pages Functions. */
export const CATEGORIES = Object.freeze([
  '校园网', '一卡通', '图书馆', '宿舍', '食堂快递',
  '教务学籍', '校医院', '安全防骗', '技术资源', '其他'
])
export const FEEDBACK_STATUSES = Object.freeze([
  { key: 'new', label: '未看' },
  { key: 'planned', label: '计划中' },
  { key: 'done', label: '已上线' },
  { key: 'rejected', label: '不采纳' }
])
export const STATUS_LABEL = Object.freeze(Object.fromEntries(
  FEEDBACK_STATUSES.map(({ key, label }) => [key, label])
))
export const FEEDBACK_KINDS = Object.freeze(['gap', 'fix'])
export const REQUEST_ID_RE = /^[a-zA-Z0-9_-]{16,80}$/
export const TICKET_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/
