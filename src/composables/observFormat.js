/**
 * 可观测模块的纯展示工具（无副作用、无状态）。
 *
 * 抽出来是为了让多个子组件（列表/拓扑树/抽屉/调试台）共用同一套格式化口径，
 * 避免同一种"耗时/时间"在各处显示成不同样子。
 */

/** 毫秒 → 人类可读（>1s 转秒，保留两位）。 */
export function fmtMs(ms) {
  const n = Number(ms) || 0
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`
  return `${n}ms`
}

/** 大数字千分位。 */
export function fmtNum(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('zh-CN')
}

/** 百分比（入参已是 0-100 时不再乘 100）。 */
export function fmtPct(v, digits = 2) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

/** 0-1 分值 → 两位小数。 */
export function fmtScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

/**
 * 后端返回的 LocalDateTime 字符串（如 2026-09-13T18:13:36.9710918）转显示串。
 * 注意：该字符串**不带时区**，直接用 Date 解析会被当成本地时间，
 * 这里按字面解析以避免时区偏移。
 */
export function fmtDateTime(raw) {
  if (!raw) return '—'
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return String(raw)
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
}

/** 只取时分秒。 */
export function fmtClock(raw) {
  const s = fmtDateTime(raw)
  const m = s.match(/(\d{2}:\d{2}:\d{2})$/)
  return m ? m[1] : '—'
}

/** 相对时间（多久之前），用于列表的"时间"列。 */
export function fmtAgo(raw) {
  const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return '—'
  const then = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  const diff = Date.now() - then
  if (diff < 0) return '刚刚'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s 前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m 前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h 前`
  return `${Math.floor(hr / 24)}d 前`
}

/** 从 JSON 串里尽力取一个字段（取不到返回 null）。 */
export function pickJson(raw, key) {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj[key] ?? null : null
  } catch {
    return null
  }
}

/** JSON 美化；非 JSON 时原样返回（错误堆栈等多是纯文本）。 */
export function prettyJson(raw) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return String(raw)
  }
}

/** 质量分色带：>=0.85 绿、>=0.6 黄、其余红。 */
export function scoreColor(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'var(--text-faint)'
  if (n >= 0.85) return 'var(--pass)'
  if (n >= 0.6) return 'var(--running)'
  return 'var(--fail)'
}

/** 延迟分色带：>2s 告警色。 */
export function latencyColor(ms) {
  const n = Number(ms) || 0
  return n > 2000 ? 'var(--running)' : 'var(--text-sub)'
}
