/**
 * 默认 Agent 配置与编辑器模板（mock）
 */

/** Agent 类型选项 */
export const AGENT_TYPE_OPTIONS = [
  { label: 'ReAct Agent', value: 'react' },
  { label: 'Plan-and-Execute', value: 'plan-execute' },
  { label: 'Tool-Calling Agent', value: 'tool-calling' },
  { label: 'Reflection Agent', value: 'reflection' },
]

/** 模型选项 */
export const MODEL_OPTIONS = [
  { label: 'deepseek-v3 (128k)', value: 'deepseek-v3' },
  { label: 'qwen-max (32k)', value: 'qwen-max' },
  { label: 'gpt-4o-mini (128k)', value: 'gpt-4o-mini' },
  { label: 'ernie-4.0-8k', value: 'ernie-4.0' },
]

/** Agent 配置初始值 */
export const DEFAULT_AGENT_CONFIG = {
  /** 执行目标智能体（联调后由后端 /agents 列表填充） */
  agentId: '',
  agentType: 'react',
  model: 'deepseek-v3',
  /** 出站消息的输出语言约束，详见 utils/prompt.js */
  language: 'zh-CN',
  temperature: 0.2,
  maxIterations: 6,
}

/** System Prompt 默认内容 */
export const DEFAULT_SYSTEM_PROMPT = `你是企业内部的智能体助手，遵循以下准则：
1. 优先调用可用工具获取事实，不臆测数据；
2. 工具调用入参必须严格匹配 JSON Schema；
3. 回答使用简体中文，结论先行，必要时附数据来源。`

/** 用例输入 Prompt 默认内容 */
export const DEFAULT_CASE_PROMPT = `帮我查一下订单 A10086 的物流状态。`

/** 预期断言默认内容（JSON 字符串） */
export const DEFAULT_CASE_ASSERT = `{
  "assertions": [
    { "type": "tool_called", "target": "query_order_status", "weight": 1 },
    { "type": "path_exists", "target": "tool.result.code", "expect": 0 },
    { "type": "contains", "target": "agent.final_answer", "value": "运输中" }
  ],
  "timeoutMs": 30000,
  "maxIterations": 6
}`
