/**
 * 后端 DTO -> 前端视图模型适配层
 *
 * 把 agent-harness 的观测中心数据翻译成工作台需要的三种结构：
 *   1. 用例树（ObservTestCase[] -> Suite->Case 树 + 扁平索引）
 *   2. 对话消息（ObservTrace + ObservTraceStep -> User/Agent/ToolCall/Error 卡片）
 *   3. 执行流图（ObservTraceStep[] -> Start -> … -> End 的力导向图数据）
 *
 * 所有字段名均以后端实体实际返回值为准（ObservTraceService / TestRunnerService）。
 */

/** category -> 套件中文名（后端 observ_test_case.category 枚举） */
export const CATEGORY_LABELS = {
  intent: '意图准确率',
  recall: '知识召回',
  hallucination: '幻觉检测',
  pressure: '异常压力',
  boundary: '边界场景',
}

/** 无 category 时的兜底套件名 */
const FALLBACK_SUITE = '未分类'

/** stepType -> 图节点类型（NODE_COLORS 仅支持 start/llm/tool/end/error） */
const STEP_KIND = {
  intent: 'llm',
  generation: 'llm',
  llm: 'llm',
  plan: 'llm',
  tool: 'tool',
  retrieval: 'tool',
  error: 'error',
}

/* ======================= 1. 用例 ======================= */

/**
 * 后端用例 -> 前端用例记录。
 * 状态不在用例表里，由最近一次批次的 results 回填，故此处固定 idle。
 */
export function toCaseRecord(dto) {
  const category = dto.category || ''
  const suiteLabel = CATEGORY_LABELS[category] || category || FALLBACK_SUITE
  return {
    id: String(dto.id),
    label: dto.name || `用例 ${dto.id}`,
    category,
    suiteKey: `suite-${category || 'other'}`,
    suiteLabel,
    path: `${suiteLabel} / ${dto.name || dto.id}`,
    input: dto.input || '',
    expected: dto.expected || '',
    agentId: dto.agentId || '',
    enabled: dto.enabled !== false,
    status: 'idle',
  }
}

/** 用例记录数组 -> Map<id, 记录>，供 O(1) 查元信息 */
export function indexCases(records) {
  return new Map(records.map((r) => [r.id, r]))
}

/** 用例记录数组 -> NaiveUI NTree 数据（按 category 聚成两层） */
export function buildTreeData(records) {
  const suites = new Map()
  records.forEach((r) => {
    if (!suites.has(r.suiteKey)) {
      suites.set(r.suiteKey, { label: r.suiteLabel, key: r.suiteKey, children: [] })
    }
    suites.get(r.suiteKey).children.push({
      label: r.label,
      key: r.id,
      status: r.status,
      isLeaf: true,
    })
  })
  return [...suites.values()]
}

/**
 * 最近一次批次的 results -> { caseId: 'pass' | 'fail' }。
 * 同用例多次出现时以最后一条为准（results 按执行顺序返回）。
 */
export function toStatusMap(results) {
  const map = {}
  ;(results || []).forEach((r) => {
    if (r?.caseId != null) map[String(r.caseId)] = r.passed ? 'pass' : 'fail'
  })
  return map
}

/** 批次报告 -> 指标三件套（与前端 metrics 字段对齐） */
export function toMetrics(report) {
  const total = report?.total ?? 0
  const passed = report?.passed ?? 0
  return { total, passed, failed: Math.max(total - passed, 0) }
}

/* ======================= 2. 对话消息 ======================= */

/**
 * 解析后端时间字符串。
 *
 * 后端返回 `2026-08-24T16:54:32.677007500` 这类**纳秒**精度、且**不带时区**的字面量：
 *  - 小数位超过 3 位时部分运行时无法解析 -> 截断到毫秒
 *  - 不带时区 -> 按本地时间解析（与后端同机部署，本地即业务时区）
 */
export function parseTime(text) {
  if (!text) return Date.now()
  if (typeof text === 'number') return text
  const normalized = String(text).replace(/(\.\d{3})\d+/, '$1')
  const ts = new Date(normalized).getTime()
  return Number.isNaN(ts) ? Date.now() : ts
}

/**
 * 后端返回体里已经内嵌了失败文案（此时 HTTP 仍是 200），识别出来降级为 Error 卡片。
 * 导出供 sessionDriverHttp 等同样消费 /chat 的调用方复用 —— 判定口径只此一份。
 */
export function isFailureText(text) {
  if (!text) return false
  return text.startsWith('AI 智能体调用失败') || text.startsWith('调用异常')
}

/** stepType -> 消息类型 */
function stepMessageType(stepType) {
  if (stepType === 'tool') return 'ToolCall'
  if (stepType === 'error') return 'Error'
  return 'Agent'
}

/** 安全解析 JSON 字符串，失败则原样返回（后端 outputJson 可能是裸文本） */
function tryJson(text) {
  if (text == null || text === '') return text
  if (typeof text === 'object') return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** generation 步骤的 outputJson 里包了一层 {"response": "..."} */
function extractStepText(step) {
  const out = tryJson(step.outputJson)
  if (out && typeof out === 'object') return out.response ?? out.content ?? JSON.stringify(out, null, 2)
  return out == null ? '' : String(out)
}

/**
 * 单步 -> 一条消息卡片。
 *
 * 工具调用（stepType=tool）会拆成 ToolCall 卡片，参数/返回分别落到
 * toolArgs / toolResult，交给 MessageCard 的折叠区渲染。
 */
function stepToMessage(step, traceKey) {
  const type = stepMessageType(step.stepType)
  const base = {
    id: `${traceKey}-s${step.seq}`,
    type,
    timestamp: parseTime(step.createdAt),
    tokens: step.tokens ?? null,
    durationMs: step.latencyMs ?? null,
  }
  if (type === 'ToolCall') {
    return {
      ...base,
      toolName: step.name || step.stepType,
      toolArgs: tryJson(step.inputJson),
      toolResult: tryJson(step.outputJson),
      content: step.name || '工具调用',
    }
  }
  return { ...base, content: `${step.name ? `【${step.name}】` : ''}${extractStepText(step)}` }
}

/**
 * 链路 + 步骤 -> 消息列表。
 *
 * 以链路为骨架（User -> 各步骤 -> 最终回复），末尾按链路状态补一条收尾消息；
 * 步骤缺失时退化为「一问一答」，保证任何用例都有内容可看。
 */
export function toMessages(trace, steps) {
  if (!trace) return []
  const key = trace.traceKey || String(trace.id)
  const messages = []

  messages.push({
    id: `${key}-u`,
    type: 'User',
    content: trace.prompt || '(空输入)',
    timestamp: parseTime(trace.startedAt),
    tokens: null,
    durationMs: null,
  })

  const ordered = [...(steps || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  ordered.forEach((s) => messages.push(stepToMessage(s, key)))

  // 末尾回复：已由 generation 步骤承载时不再重复，避免内容翻倍
  const hasFinal = ordered.some((s) => s.stepType === 'generation')
  if (!hasFinal && trace.response) {
    const failed = trace.status === 'failed' || isFailureText(trace.response)
    messages.push({
      id: `${key}-r`,
      type: failed ? 'Error' : 'Agent',
      content: trace.response,
      timestamp: parseTime(trace.endedAt),
      tokens: trace.tokens ?? null,
      durationMs: trace.latencyMs ?? null,
    })
  }
  return messages
}

/**
 * 评测结果 -> 收尾消息，把「这次评测判了什么」显式呈现出来。
 * 与链路消息并存时作为最后一条，标注为评测结论而非模型输出。
 */
export function toResultMessage(result) {
  if (!result) return null
  const passed = !!result.passed
  const parts = [
    passed ? '评测结论：PASS' : '评测结论：FAIL',
    result.expected ? `期望：${result.expected}` : '期望：未设置',
    result.error ? `原因：${result.error}` : '',
  ].filter(Boolean)
  return {
    id: `result-${result.caseId}-${result.id ?? 'last'}`,
    type: passed ? 'Agent' : 'Error',
    content: parts.join('\n'),
    timestamp: parseTime(result.createdAt),
    tokens: null,
    durationMs: result.latencyMs ?? null,
  }
}

/* ======================= 3. 执行流图 ======================= */

/** 把步骤串成 Start -> … -> End 的节点链（节点 id 用序号，保证与 links 对齐） */
export function toGraph(trace, steps) {
  const ordered = [...(steps || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const nodes = [{ id: 'n0', label: 'Start', kind: 'start' }]
  ordered.forEach((s, i) => {
    nodes.push({
      id: `n${i + 1}`,
      label: s.name || s.stepType || `Step ${s.seq}`,
      kind: STEP_KIND[s.stepType] || 'llm',
    })
  })
  const failed = trace?.status === 'failed' || ordered.some((s) => s.status === 'failed')
  nodes.push({
    id: `n${nodes.length}`,
    label: failed ? 'Error' : 'End',
    kind: failed ? 'error' : 'end',
  })

  const links = nodes.slice(1).map((node, i) => [nodes[i].id, node.id])
  return { nodes, links }
}
