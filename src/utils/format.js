/**
 * 纯函数格式化工具（无状态，供组件与 composable 共用）
 */

/** 时间戳 -> HH:mm:ss */
export function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 时间戳 -> HH:mm（时间线元信息用）。
 *
 * 与 `formatTime` 分开而不是加参数：日志区要秒级精度（排查用），
 * 时间线元信息只要分钟级（阅读用），两种精度混在一个函数里迟早会被写错。
 */
export function formatClock(ts) {
  if (!ts) return '--:--'
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 任意值 -> 缩进 JSON 文本（用于代码块展示） */
export function prettyJson(v) {
  if (v == null) return '// (空)'
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  } catch (e) {
    return String(v)
  }
}

/** 用例状态 -> 展示文案 */
export function statusText(status) {
  return { pass: 'PASS', fail: 'FAIL', running: 'RUNNING', idle: 'IDLE' }[status] || 'IDLE'
}

/**
 * 用例状态 -> NaiveUI NTag 的 color 对象
 *
 * 直接返回 CSS 变量引用而不是字面量：设计令牌定义在 :root 上，任何内联样式都能解析到，
 * 因此主题切换时标签会跟着翻，不需要 JS 侧再维护一份色值副本。
 */
export function statusTagColor(status) {
  const map = {
    pass: { color: 'var(--success-tint-bg)', textColor: 'var(--pass)', borderColor: 'var(--success-tint-border)' },
    fail: { color: 'var(--danger-tint-bg)', textColor: 'var(--fail)', borderColor: 'var(--danger-tint-border)' },
    running: { color: 'var(--warning-tint-bg)', textColor: 'var(--running)', borderColor: 'var(--warning-tint-border)' },
    idle: { color: 'var(--overlay-subtle)', textColor: 'var(--text-sub)', borderColor: 'var(--border-heavy)' },
  }
  return map[status] || map.idle
}

/** 概要文本 -> token 数（粗略估算，仅用于 mock 展示） */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 2)
}
