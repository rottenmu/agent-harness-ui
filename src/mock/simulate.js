/**
 * 运行期模拟消息工厂 —— 只产出数据，不含任何调度逻辑。
 *
 * 与 `mock/traces.js` 的区别：
 *  - traces.js 提供「加载用例时就已存在」的静态历史 Trace；
 *  - 本文件提供「Step Run / Run Selected 过程中新增」的运行期消息。
 *
 * 之所以独立成文件：消息体是纯数据契约（字段与后端 SSE 返回保持一致），
 * 放在 mock 层便于后续对接真实接口时直接替换，钩子层只保留编排代码。
 */

/** Agent 规划阶段的回复 */
export function buildPlanMessage(t0) {
  return {
    id: `m-${Date.now()}-a1`,
    type: 'Agent',
    content: '收到，正在分析你的请求并选择合适的工具。',
    timestamp: Date.now(),
    tokens: 24,
    durationMs: Date.now() - t0,
  }
}

/** 工具调用阶段（入参取自用户输入前 60 字符，避免超长回显） */
export function buildToolCallMessage(input) {
  return {
    id: `m-${Date.now()}-t`,
    type: 'ToolCall',
    toolName: 'mock_tool_call',
    toolArgs: { query: input.slice(0, 60), topK: 5, rerank: true },
    toolResult: {
      code: 0,
      items: [{ id: 'doc-1', score: 0.91 }, { id: 'doc-2', score: 0.87 }],
    },
    timestamp: Date.now(),
    tokens: 76,
    durationMs: 288,
  }
}

/** Agent 总结阶段 */
export function buildSummaryMessage(t0) {
  return {
    id: `m-${Date.now()}-a2`,
    type: 'Agent',
    content: '已完成本轮执行：工具返回 2 条候选结果，置信度最高的为 doc-1（0.91）。',
    timestamp: Date.now(),
    tokens: 62,
    durationMs: Date.now() - t0,
  }
}

/** 用户提交的 Prompt 落成的 User 消息 */
export function buildUserMessage(text, tokens) {
  return {
    id: `m-${Date.now()}-u`,
    type: 'User',
    content: text,
    timestamp: Date.now(),
    tokens,
    durationMs: null,
  }
}
