/**
 * sessionVisibility.js —— 会话「可见/状态」类事实的**唯一推导源**
 *
 * 移植自参照项目 pi-gui 的 `plans/sidebar-unseen-notification-consistency/plan.md`（MIT）。
 * 那份复盘记录了一次真实事故，值得原文照搬其教训：
 *
 *   · 「通知抑制」与「侧栏未读蓝点」各自维护了一份谓词，于是漂移；
 *   · `hasUnseenUpdate` 在两处分别推导，改了一处忘了另一处；
 *   · `agent_end` 事件里没有推进 `updatedAt`，导致「有更新」判不出来。
 *   修法不是"两边都改对"，而是**抽出 `session-visibility.ts` 作为唯一来源**。
 *
 * 本文件就是那个唯一来源。它遵守两条硬规则：
 *
 *   1. **只有纯函数，没有状态。** 没有任何 `ref`，因此不存在"谁的副本更新了"的问题。
 *      调用方每次渲染都重新问一次，答案必然自洽。
 *   2. **派生字段一律不落库。** `status` / `unseen` / `lastError` 这三项
 *      都不允许出现在会话记录里（mock 与后端响应都遵守）。
 *      `status` 由 `runningRunId` + `lastError` 推出，不占独立字段。
 *
 * ⚠️ 反模式（写代码时不要这样）：
 *     `if (session.status === 'pending' || session.status === 'running')`
 *   一旦要判断"是否正在跑"，永远只看 `isRunning()` / `runningRunId !== null`。
 *   两个状态值表达同一件事，就是漂移的起点。
 */
import { SessionStatus } from '@/api/sessionDriver'

/**
 * 是否正有一次运行在跑。
 *
 * 这是**唯一**的"在跑"判据。UI 中任何"禁用发送 / 显示停靠按钮 / 是否跟随底部"
 * 的决策都应从这里出发，不要各自去比较状态字符串。
 */
export function isRunning(session) {
  return Boolean(session && session.runningRunId)
}

/**
 * 推导三态状态。
 *
 * 优先级：正在跑 > 有失败原因 > 空闲。
 * 「正在跑」优先于「上次失败」是刻意的：一次失败后重跑，界面必须立刻显示 Running，
 * 而不是等运行结束才把 Failed 换掉。
 */
export function deriveStatus(session) {
  if (!session) return SessionStatus.IDLE
  if (isRunning(session)) return SessionStatus.RUNNING
  if (session.lastError) return SessionStatus.FAILED
  return SessionStatus.IDLE
}

/**
 * 推导"是否存在未读更新"。
 *
 * `session.unseen` 是后端给的**原始事实**（"有过更新且用户没看到"）；
 * 而"是否应该亮蓝点"是**视图谓词**，还要减去"用户此刻正在看这条会话"这一条。
 * 两者被明确分成两个函数，就是为了避免它们再次合并成一个两边各自实现的谓词。
 */
export function hasUnseenUpdate(session, viewedSessionId) {
  if (!session || !session.unseen) return false
  // 正在被查看的会话不亮未读点 —— 这是"是否正在被查看"的唯一判定
  return session.id !== viewedSessionId
}

/**
 * 推导应该展示的失败原因。
 *
 * 只有处于 Failed 态时才展示：一次运行成功后，旧的 `lastError` 仍留在记录里
 * （保留是为了排查），但不应该继续出现在界面上。
 */
export function deriveLastError(session) {
  return deriveStatus(session) === SessionStatus.FAILED ? session.lastError || null : null
}

/**
 * 推导侧栏行的状态色调名（供 CSS 类与色点使用）。
 *
 * 与 `SESSION_STATUS_META` 同源，不另立一套映射。
 */
export function deriveStatusTone(session) {
  const status = deriveStatus(session)
  if (status === SessionStatus.RUNNING) return 'running'
  if (status === SessionStatus.FAILED) return 'error'
  return 'neutral'
}

/**
 * 侧栏排序：**排序必须是稳定的、且是纯函数**，否则每次 tick 顺序都可能变。
 *
 * 规则：置顶的永远在前 → 然后按 updatedAt 倒序 → id 兜底保证完全确定性。
 */
export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    return String(a.id).localeCompare(String(b.id))
  })
}

/**
 * 按工作区分组（pi-gui 侧栏的分组维度）。
 *
 * 保持传入顺序，不做二次排序 —— 调用方先 `sortSessions` 再分组，
 * 组内顺序即全局顺序，避免"排序在两处各做一次"。
 */
export function groupByWorkspace(sessions) {
  const groups = new Map()
  sessions.forEach((s) => {
    const key = s.workspace || 'default'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  })
  return [...groups.entries()].map(([workspace, list]) => ({ workspace, sessions: list }))
}
