/**
 * 出站消息组装：把「输出语言」约束注入到用户消息前。
 *
 * 背景（联调实测结论）：
 *  后端 `POST /api/biz/ai/chat` 的请求体只接受 agentId / message / sessionId / tenantId / userId，
 *  **没有 systemPrompt 入参**；模型的语言行为完全由 `ai_managed_agent.persona` 决定。
 *  而库里多个智能体的 persona 为空（RAG知识库测试 / 工具调用测试 / 计划执行测试 /
 *  图任务流测试 / 时间排序验证），这类智能体按模型默认语言作答，实测返回英文。
 *  评测工作台需要稳定的中文输出，故在发送前追加一段极短的语言指令。
 *
 * 设计取舍：
 *  - 只注入到**出站请求**，界面消息卡片展示的仍是用户原文，不污染评测记录；
 *  - 指令用【】包裹并独占一行，避免被模型当作正文的一部分；
 *  - 后端补齐 persona 后可关闭（选「跟随智能体」），此时不做任何包装。
 */

/** 语言选项；value 为空串表示不注入任何指令 */
export const LANGUAGE_OPTIONS = [
  { label: '简体中文（默认）', value: 'zh-CN' },
  { label: '跟随智能体 persona', value: '' },
]

/** 语言 -> 指令前缀 */
const DIRECTIVES = {
  'zh-CN': '【输出语言】请始终使用简体中文回答，术语可保留英文原词。',
}

/**
 * 按语言选项包装出站消息。
 *
 * @param {string} text 用户原始输入
 * @param {string} language 语言选项 value（见 LANGUAGE_OPTIONS）
 * @returns {string} 包装后的消息；未配置或未知语言时原样返回
 */
export function withLanguageDirective(text, language) {
  const directive = DIRECTIVES[language]
  if (!directive || !text) return text
  return `${directive}\n\n${text}`
}
