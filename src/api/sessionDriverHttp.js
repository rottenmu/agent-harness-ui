/**
 * sessionDriverHttp.js —— 会话契约（api/sessionDriver.js）的 **HTTP 实现**
 *
 * 传输通道是现有的 `POST /api/biz/ai/chat`（同步返回完整回复）。
 * 契约定义了 8 种事件，其中流式类事件（assistantDelta 连续增量、tool* 三件套）
 * 在同步后端下只会以"一次性全量"的形态出现：
 *
 *   · ASSISTANT_DELTA —— 到且只到一次，携带完整回复文本；
 *   · TOOL_*          —— 当前 /chat 不暴露中间工具调用，不会发出；
 *   · RUN_COMPLETED / RUN_FAILED —— 正常收尾。
 *
 * 这不是妥协而是**占位**：等后端补上 SSE（api/harness.js 的 attachSse 接入位）
 * 后，只需把本文件的 sendUserMessage 换成事件流消费，事件消费方
 * （usePiSession 的 onDriverEvent）一行都不用改 —— 这正是契约层存在的意义。
 *
 * 契约遵守三条纪律（见 sessionDriver.js 头注释）：
 *   · 失败也走事件（RUN_FAILED），不用异常打断 UI 的状态机；
 *   · cancelCurrentRun 只取消传输层，不产生 RUN_FAILED 事件（用户主动取消
 *     不是失败，状态机在取消时已自行把 runningRunId 置空）；
 *   · createSession/openSession/closeSession 在纯前端会话模型下是空实现，
 *     保留方法形状以满足 checkDriverShape 的契约校验。
 */
import { chatWithAgent } from './observ'
import { isFailureText } from './adapters'
import { SessionEvent } from './sessionDriver'

/** 每个前端会话对应的后端 chat sessionId 前缀（后端按 sessionId 保留多轮记忆） */
const CHAT_SESSION_PREFIX = 'pi-'

/**
 * 创建基于 /chat 的会话驱动。
 *
 * @param {{ agentId?: string }} [defaults] 默认执行目标；后续可用 configure() 更新
 */
export function createHttpSessionDriver(defaults = {}) {
  const config = {
    agentId: defaults.agentId || '',
  }
  const handlers = new Set()
  /** 当前在途请求的取消控制器（同一时刻至多一个运行在跑，由状态机保证） */
  let abortCtl = null

  /** 事件广播：单个 handler 异常不阻断其它 handler（否则一个面板出错全场静默） */
  function emit(event) {
    handlers.forEach((handler) => {
      try {
        handler(event)
      } catch (err) {
        console.error('[sessionDriver] handler error', err)
      }
    })
  }

  /**
   * 发送一条用户消息并驱动一轮运行。
   *
   * @param {{ sessionId: string, text: string, agentId?: string }} msg
   *   agentId 优先取消息级（调用方逐会话指定），回落到驱动级默认值
   * @returns {Promise<{ok: boolean, reply?: string, cancelled?: boolean, error?: string}>}
   */
  async function sendUserMessage(msg) {
    const { sessionId, text } = msg || {}
    const agentId = msg?.agentId || config.agentId
    if (!agentId) {
      const error = '未配置运行时执行 Agent：请在控制台顶栏选择一个智能体'
      emit({ type: SessionEvent.RUN_FAILED, sessionId, error })
      return { ok: false, error }
    }

    abortCtl = new AbortController()
    const t0 = Date.now()
    try {
      const data = await chatWithAgent(
        { agentId, message: text, sessionId: `${CHAT_SESSION_PREFIX}${sessionId}` },
        { signal: abortCtl.signal },
      )
      const content = data?.reply || '(后端返回空回复)'
      const durationMs = Date.now() - t0
      // 同步通道：完整回复一次性送达。失败文案藏在 HTTP 200 里（isFailureText），
      // 按契约降级为 RUN_FAILED，让状态机落到 Failed 而不是把失败当回答展示
      if (isFailureText(content)) {
        emit({ type: SessionEvent.RUN_FAILED, sessionId, error: content })
        return { ok: false, error: content }
      }
      emit({ type: SessionEvent.ASSISTANT_DELTA, sessionId, text: content, durationMs })
      const agentLabel = data?.agentName || agentId
      emit({
        type: SessionEvent.RUN_COMPLETED,
        sessionId,
        summary: `已回复（${agentLabel} · ${(durationMs / 1000).toFixed(1)}s）`,
      })
      return { ok: true, reply: content }
    } catch (err) {
      // 用户主动取消：不发事件（状态机已收场），静默返回
      if (err?.aborted) return { ok: false, cancelled: true }
      emit({ type: SessionEvent.RUN_FAILED, sessionId, error: err?.message || String(err) })
      return { ok: false, error: err?.message || String(err) }
    } finally {
      abortCtl = null
    }
  }

  return {
    /** 契约方法：本工程的会话记录由前端状态机持有，此处仅回执形状 */
    createSession: ({ id, title, workspace } = {}) => ({ id, title, workspace }),
    openSession: async () => ({ ok: true }),
    sendUserMessage,
    /** 只取消传输层；不发 RUN_FAILED —— 用户取消不是运行失败 */
    cancelCurrentRun: () => {
      abortCtl?.abort()
      abortCtl = null
    },
    /** @returns {() => void} 退订函数 */
    subscribe: (handler) => {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    closeSession: () => {},

    /** 非契约的配置入口：运行时 Agent 选择器变化时由调用方同步进来 */
    configure: (next = {}) => {
      if (next.agentId !== undefined) config.agentId = next.agentId
      return { ...config }
    },
  }
}
