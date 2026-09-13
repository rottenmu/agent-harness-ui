/**
 * 观测中心接口封装（agent-harness 的 ObservController）
 *
 * 前缀 /api/biz/ai/observ，与后端 ObservController 一一对应。
 * 所有写法均以实际运行的接口实测确认过（见同目录 adapters.js 的字段映射）。
 */
import { request } from './client'

const BASE = '/api/biz/ai/observ'

/* ---------------- 评测用例 ---------------- */

/** 用例列表，可按 category 过滤 */
export function fetchTestCases(category) {
  return request(`${BASE}/test-cases`, { query: { category } })
}

/** 新建用例：body 支持 name/category/input/expected/agentId/tags/enabled */
export function createTestCase(body) {
  return request(`${BASE}/test-cases`, { method: 'POST', body })
}

/** 更新用例 */
export function updateTestCase(id, body) {
  return request(`${BASE}/test-cases/${id}`, { method: 'PUT', body })
}

/** 删除用例（后端为逻辑删除） */
export function deleteTestCase(id) {
  return request(`${BASE}/test-cases/${id}`, { method: 'DELETE' })
}

/* ---------------- 批量评测 ---------------- */

/**
 * 触发批量测评（同步执行，逐个用例真实调用 Agent）。
 *
 * 逐用例可中断模式：`caseIds` 只传一个 id 即"单用例批次"，前端批量运行
 * 改为逐例调用本接口（见 useCaseRunner.runRemoteBatch），因此每例都是
 * 独立 HTTP、用例之间可响应停止；`signal` 用于中断当前在途的这一例。
 * 后端为同步阻塞：pressure 类每例 5 次调用，单例可能数分钟，故给 10 分钟超时。
 *
 * @param {number[]|string[]} caseIds
 * @param {string} name
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{total:number, passed:number, rate:number, categories:object, runId:number}>}
 */
export function runTestCases(caseIds, name, options = {}) {
  return request(`${BASE}/test-runs`, {
    method: 'POST',
    body: { caseIds, name },
    timeout: 600000,
    signal: options.signal,
  })
}

/** 历史批次列表 */
export function fetchTestRuns(limit = 20) {
  return request(`${BASE}/test-runs`, { query: { limit } })
}

/** 批次报告：{ run, results:[{ caseId, category, input, expected, actual, passed, score, error, latencyMs }] } */
export function fetchTestRunReport(id) {
  return request(`${BASE}/test-runs/${id}/report`)
}

/* ---------------- 执行链路 Trace ---------------- */

/** 链路列表，支持 agentId / status / traceKey / limit */
export function fetchTraces(params = {}) {
  return request(`${BASE}/traces`, { query: params })
}

/** 链路详情：{ trace, steps }；id 可传主键或 traceKey */
export function fetchTraceDetail(id) {
  return request(`${BASE}/traces/${id}`)
}

/** 追加式会话事件日志（BEGIN → STEP… → END） */
export function fetchTraceEvents(traceId) {
  return request(`${BASE}/events/${traceId}`)
}

/** 链路 token 计量 */
export function fetchTokenSummary(traceId) {
  return request(`${BASE}/events/${traceId}/token-summary`)
}

/* ---------------- 数据大盘 ---------------- */

/** 大盘：{ summary, trend, byAgent } */
export function fetchDashboard(days = 7) {
  return request(`${BASE}/dashboard`, { query: { days } })
}

/* ---------------- 关联的 harness 接口 ---------------- */

/** 已装配的智能体列表（用于右键配置区与用例绑定的 agentId 下拉） */
export function fetchAgents() {
  return request('/api/biz/ai/agents')
}

/** 模型配置列表（用于模型下拉） */
export function fetchModelConfigs() {
  return request('/api/biz/ai/model-configs')
}

/**
 * 与指定智能体对话（Step Run 与运行时控制台驱动的真实执行入口）。
 *
 * @param {{agentId:string, message:string, sessionId?:string, userId?:string, tenantId?:string}} body
 * @param {{ signal?: AbortSignal }} [options] signal 用于控制台 Stop 真实中断在途请求
 * @returns {Promise<{reply:string, agent:string, agentName:string, agentType:string, intent:object}>}
 */
export function chatWithAgent(body, options = {}) {
  return request('/api/biz/ai/chat', { method: 'POST', body, timeout: 180000, signal: options.signal })
}
