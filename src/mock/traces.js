/**
 * 对话 Trace 与执行流图（mock）
 *
 * 仅覆盖部分用例，其余用例回落为空 trace / DEFAULT_GRAPH。
 * 消息 type: User | Agent | ToolCall | Error
 */

/** 各用例的对话 Trace */
export const MOCK_TRACES = {
  'case-tool-1': [
    {
      id: 'm1', type: 'User', content: '帮我查一下订单 A10086 的物流状态。',
      timestamp: Date.now() - 42000, tokens: 26, durationMs: null,
    },
    {
      id: 'm2', type: 'Agent', content: '好的，我先调用订单查询工具获取该订单当前状态。',
      timestamp: Date.now() - 40000, tokens: 48, durationMs: 812,
    },
    {
      id: 'm3', type: 'ToolCall', toolName: 'query_order_status',
      toolArgs: { orderId: 'A10086', withLogistics: true, trace: false },
      toolResult: {
        code: 0, status: 'IN_TRANSIT', carrier: 'SF-Express',
        lastUpdate: '2026-09-10 09:12:33', eta: '2026-09-11',
      },
      timestamp: Date.now() - 38000, tokens: 92, durationMs: 344,
    },
    {
      id: 'm4', type: 'Agent',
      content: '订单 A10086 当前状态为「运输中」，承运商顺丰速运，最新轨迹更新于 09:12，预计 9 月 11 日送达。',
      timestamp: Date.now() - 36000, tokens: 74, durationMs: 1105,
    },
  ],
  'case-tool-3': [
    {
      id: 'm1', type: 'User', content: '把这段文本翻译成日语并写入 /tmp/out.txt。',
      timestamp: Date.now() - 30000, tokens: 31, durationMs: null,
    },
    {
      id: 'm2', type: 'Agent', content: '即将调用文件写入工具。',
      timestamp: Date.now() - 28000, tokens: 22, durationMs: 420,
    },
    {
      id: 'm3', type: 'ToolCall', toolName: 'write_file',
      toolArgs: { path: '/tmp/out.txt', content: 'こんにちは', overwrite: 'yes' },
      toolResult: {
        code: 422, error: 'SchemaValidationError',
        detail: "field 'overwrite' expected boolean, got string 'yes'",
      },
      timestamp: Date.now() - 27000, tokens: 88, durationMs: 96,
    },
    {
      id: 'm4', type: 'Error',
      content: '工具调用失败：write_file 入参 schema 校验不通过（overwrite 应为 boolean）。断言 [tool.args.overwrite] 检查失败 → 用例判定 FAIL。',
      timestamp: Date.now() - 26000, tokens: 55, durationMs: 210,
    },
  ],
}

/** 各用例的执行流图 */
export const MOCK_GRAPHS = {
  'case-tool-1': {
    nodes: [
      { id: 'n1', label: 'Start', kind: 'start' },
      { id: 'n2', label: 'LLM 规划', kind: 'llm' },
      { id: 'n3', label: 'query_order_status', kind: 'tool' },
      { id: 'n4', label: 'LLM 总结', kind: 'llm' },
      { id: 'n5', label: 'End', kind: 'end' },
    ],
    links: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5']],
  },
  'case-tool-3': {
    nodes: [
      { id: 'n1', label: 'Start', kind: 'start' },
      { id: 'n2', label: 'LLM 解析意图', kind: 'llm' },
      { id: 'n3', label: 'write_file', kind: 'tool' },
      { id: 'n4', label: 'SchemaValidationError', kind: 'error' },
    ],
    links: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4']],
  },
  'case-basic-1': {
    nodes: [
      { id: 'n1', label: 'Start', kind: 'start' },
      { id: 'n2', label: 'LLM 单轮生成', kind: 'llm' },
      { id: 'n3', label: 'End', kind: 'end' },
    ],
    links: [['n1', 'n2'], ['n2', 'n3']],
  },
}

/** 用例无专属图时的兜底执行流 */
export const DEFAULT_GRAPH = {
  nodes: [
    { id: 'n1', label: 'Start', kind: 'start' },
    { id: 'n2', label: 'LLM 规划', kind: 'llm' },
    { id: 'n3', label: 'tool_call', kind: 'tool' },
    { id: 'n4', label: 'LLM 反思', kind: 'llm' },
    { id: 'n5', label: 'End', kind: 'end' },
  ],
  links: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5']],
}

/** 取某用例的 trace（深拷贝，防外部改写源数据） */
export function getTrace(caseId) {
  return (MOCK_TRACES[caseId] || []).map((m) => ({ ...m }))
}

/** 取某用例的执行流图 */
export function getGraph(caseId) {
  return MOCK_GRAPHS[caseId] || DEFAULT_GRAPH
}

/** 图例（与 NODE_COLORS 保持一致，颜色在组件侧注入） */
export const LEGEND_ITEMS = [
  { label: 'Start', kind: 'start' },
  { label: 'LLM', kind: 'llm' },
  { label: 'Tool', kind: 'tool' },
  { label: 'End / Error', kind: 'end' },
]
