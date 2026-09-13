/**
 * Harness 评测接口（SSE 预留）
 *
 * 当前工作台全部为前端模拟，本文件把「将来接后端」的契约先固定下来：
 * 后端按这些事件类型推送，前端把 simulateAgentStep 换成 attachSse 即可。
 *
 * 后端约定：
 *   GET /api/harness/stream?caseId=<id>   （text/event-stream）
 *   事件负载均为 JSON，含 type 字段：
 *     message  -> { type:'message', data: <同 MessageCard 的 message 结构> }
 *     tool_call-> { type:'tool_call', data: <ToolCall 消息> }
 *     error    -> { type:'error', data: <Error 消息> }
 *     metric   -> { type:'metric', data: { passed, failed, total } }
 *     done     -> { type:'done', data: { caseId, status } }
 *
 * 其余 REST 契约：
 *   GET  /api/harness/cases                 用例树（替代 mock/cases.js）
 *   GET  /api/harness/cases/:id/trace       某用例对话轨迹
 *   GET  /api/harness/cases/:id/graph       某用例执行流图
 *   POST /api/harness/run                   { caseIds, agentConfig } 触发批量评测
 *   POST /api/harness/stop                  { runId } 中断
 */

/** 事件类型常量，避免字符串散落 */
export const HARNESS_EVENT = {
  MESSAGE: 'message',
  TOOL_CALL: 'tool_call',
  ERROR: 'error',
  METRIC: 'metric',
  DONE: 'done',
}

/**
 * 接入后端 SSE 流。
 *
 * @param {string} caseId 用例 ID
 * @param {object} handlers 各事件回调：{ onMessage, onToolCall, onError, onMetric, onDone }
 * @returns {EventSource} 调用方需在停止时 es.close()
 */
export function attachSse(caseId, handlers = {}) {
  const es = new EventSource(`/api/harness/stream?caseId=${encodeURIComponent(caseId)}`)

  es.onmessage = (e) => {
    let payload
    try {
      payload = JSON.parse(e.data)
    } catch (err) {
      handlers.onError?.({ type: 'error', data: { content: `SSE 负载解析失败：${err.message}` } })
      return
    }

    switch (payload.type) {
      case HARNESS_EVENT.MESSAGE:
        handlers.onMessage?.(payload.data)
        break
      case HARNESS_EVENT.TOOL_CALL:
        handlers.onToolCall?.(payload.data)
        break
      case HARNESS_EVENT.METRIC:
        handlers.onMetric?.(payload.data)
        break
      case HARNESS_EVENT.ERROR:
        handlers.onError?.(payload.data)
        break
      case HARNESS_EVENT.DONE:
        handlers.onDone?.(payload.data)
        es.close()
        break
      default:
        break
    }
  }

  es.onerror = () => es.close()
  return es
}
