/**
 * sessionDriver.js —— 前端会话**契约**（只有形状，没有实现）
 *
 * 移植自参照项目 pi-gui 的 `packages/session-driver/src/types.ts`（MIT）。
 * 它把 UI 与 runtime 之间的边界收窄到「6 个方法 + 8 个事件」，
 * 目的是当上游换实现（pi-gui 那边预判的是官方 WebSocket server）时，
 * UI 一行都不用改。
 *
 * 本工程的 runtime 是自研的 `modules/agent-harness`，因此：
 *   · 只借它的**契约形状**（状态枚举、事件命名、投递语义），
 *   · **不借**它针对 `@earendil-works/pi-coding-agent` 具体版本的任何实现细节。
 *
 * ---------------------------------------------------------------------------
 * 三条关键设计（都是 pi-gui 踩过坑之后收敛出来的，不要"顺手简化"）
 * ---------------------------------------------------------------------------
 *
 * 1. 状态只有三态：idle | running | failed。
 *    排队**不占用状态位**，而是由 `runningRunId` + `queuedMessages[]` 表达。
 *    反例：用 `pending` 同时表示"还没开始"和"排队中"，会让"现在有没有在跑"
 *    这个判断要在多个地方列举多个状态值 —— 那就是同一事实两处推导，
 *    必然漂移（pi-gui 的 sidebar-unseen 复盘记录的就是这类事故）。
 *    推论：判断"是否正在运行"永远只看 `runningRunId !== null`。
 *
 * 2. 消息投递有且只有两种语义，不是一种：
 *      steer    —— 插话：把内容注入**当前这一轮**运行，马上生效；
 *      followUp —— 排队：等当前运行结束后作为**新一轮**发出。
 *    把两者挤成一个"发送"，运行中发消息的语义就是未定义的。
 *
 * 3. 会话记录是**唯一事实来源**：UI 不另存一份可写的副本。
 *    本文件里的 `SessionRecord` 形状即该来源的投影。
 */

/** 会话状态：只有三态 */
export const SessionStatus = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  FAILED: 'failed',
})

/** 状态 -> 展示文案与语义色令牌（color = state, never decoration） */
export const SESSION_STATUS_META = Object.freeze({
  [SessionStatus.IDLE]: { label: 'Idle', tone: 'neutral' },
  [SessionStatus.RUNNING]: { label: 'Running', tone: 'running' },
  [SessionStatus.FAILED]: { label: 'Failed', tone: 'error' },
})

/** 消息投递语义 */
export const DeliverAs = Object.freeze({
  /** 运行中插话：立即注入当前运行 */
  STEER: 'steer',
  /** 排队：等当前运行结束后再发 */
  FOLLOW_UP: 'followUp',
})

/** Driver 事件类型（8 种）。字符串集中在此，避免散落字面量。 */
export const SessionEvent = Object.freeze({
  SESSION_OPENED: 'sessionOpened',
  ASSISTANT_DELTA: 'assistantDelta',
  TOOL_STARTED: 'toolStarted',
  TOOL_UPDATED: 'toolUpdated',
  TOOL_FINISHED: 'toolFinished',
  RUN_COMPLETED: 'runCompleted',
  RUN_FAILED: 'runFailed',
  HOST_UI_REQUEST: 'hostUiRequest',
})

/**
 * Driver 方法清单（6 个）。
 *
 * 这不是可运行的接口，而是**边界说明**：任何实现都必须只通过这 6 个动作
 * 与 8 个事件与 UI 交互。`createSessionDriver()` 返回的对象应逐项对应。
 */
export const SESSION_DRIVER_METHODS = Object.freeze([
  'createSession',
  'openSession',
  'sendUserMessage',
  'cancelCurrentRun',
  'subscribe',
  'closeSession',
])

/**
 * 判空的安全入口：动态断言一个对象是否满足契约。
 *
 * 用途是接真实后端时**尽早失败**——如果后端的 driver 少了 `subscribe`，
 * 我们希望在创建时就报出来，而不是等某个面板静默不刷新。
 *
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkDriverShape(driver) {
  const missing = []
  if (!driver || typeof driver !== 'object') {
    return { ok: false, missing: [...SESSION_DRIVER_METHODS] }
  }
  SESSION_DRIVER_METHODS.forEach((name) => {
    if (typeof driver[name] !== 'function') missing.push(name)
  })
  return { ok: missing.length === 0, missing }
}

/**
 * 会话记录形状（仅作类型文档用，JS 侧不产生运行时开销）。
 *
 * @typedef {Object} SessionRecord
 * @property {string} id
 * @property {string} title
 * @property {string} preview          列表第二行预览
 * @property {string} workspace        所属工作区（侧栏分组依据）
 * @property {string} status           SessionStatus 之一
 * @property {string|null} runningRunId 当前运行的 id；null 表示没有运行在跑
 * @property {QueuedMessage[]} queuedMessages 排队中的用户消息
 * @property {boolean} unseen          是否有未读更新
 * @property {string|null} lastError   最近一次失败原因
 * @property {number} updatedAt        最后更新时间戳（毫秒）
 * @property {'today'|'yesterday'|'earlier'} group 侧栏时间分节
 * @property {TimelineItem[]} items    时间线项（5 类，见下）
 * @property {Artifact[]} artifacts    产出的文件
 * @property {DiffFile[]} diff         涉及的文件差异
 * @property {ContextStats} stats      上下文统计
 *
 * @typedef {Object} QueuedMessage
 * @property {string} id
 * @property {string} text
 * @property {DeliverAs} deliverAs
 * @property {number} queuedAt
 *
 * @typedef {Object} TimelineItem
 * @property {'user'|'assistant'|'activity'|'tool'|'summary'} kind
 *
 * @typedef {Object} ContextStats
 * @property {number} totalTokens
 * @property {number} cachedTokens
 * @property {number} rounds
 * @property {number} windowTotal
 */
