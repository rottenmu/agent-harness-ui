/**
 * 资源管理接口封装：智能体 / MCP 配置 / 技能
 *
 * 后端（agent-application :9900，经 Vite 代理）已有三套现成 CRUD：
 *  - /api/biz/ai/agents        AiAgentAdminController（AgentScope 装配中心的数据源）
 *  - /api/biz/ai/mcp-configs   AiMcpConfigController
 *  - /api/biz/ai/skills        AiSkillAdminController（内置 Bean 技能 + 自定义 API 技能）
 *
 * 鉴权走 sa-token：请求头 Authorization 放裸 token（client.js 已统一处理）。
 * 侧栏的资源管理弹窗打开时若本地无 token，用 DEV_CREDENTIALS 静默登录一次；
 * 登录失败把原因交给弹窗展示，而不是让列表区空转。
 */
import { DEV_CREDENTIALS, login } from './auth'
import { getToken, request } from './client'

/* ---------------- 智能体 ---------------- */

export function listAgents() {
  return request('/api/biz/ai/agents')
}

/** @param {object} body AiManagedAgentRequest：name/desc/persona/model/agentType/enabled… */
export function createAgent(body) {
  return request('/api/biz/ai/agents', { method: 'POST', body })
}

export function deleteAgent(id) {
  return request(`/api/biz/ai/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- MCP 配置 ---------------- */

export function listMcpConfigs() {
  return request('/api/biz/ai/mcp-configs')
}

/** @param {object} body AiMcpConfig：name/description/mcpType(http|sse|stdio)/endpoint/transportConfig/enabled */
export function createMcpConfig(body) {
  return request('/api/biz/ai/mcp-configs', { method: 'POST', body })
}

export function deleteMcpConfig(id) {
  return request(`/api/biz/ai/mcp-configs/${id}`, { method: 'DELETE' })
}

/* ---------------- 模型配置 ---------------- */

/** 列表（响应的 apiKey 只含脱敏的 apiKeyMasked，明文永远不出后端） */
export function listModelConfigs() {
  return request('/api/biz/ai/model-configs')
}

/** @param {object} body AiModelConfigRequest：configName/provider/endpoint/apiKey/modelId/env/enabled/temperature/topP/maxTokens */
export function createModelConfig(body) {
  return request('/api/biz/ai/model-configs', { method: 'POST', body })
}

export function deleteModelConfig(id) {
  return request(`/api/biz/ai/model-configs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- 技能 ---------------- */

export function listSkills() {
  return request('/api/biz/ai/skills')
}

/**
 * 创建自定义 API 技能。
 *
 * @param {object} body AiManagedSkillRequest：name/description/readOnly/
 *   apiConfig:{enabled,baseUrl,path,method,headers,timeoutMillis,apiRegistryId}
 */
export function createSkill(body) {
  return request('/api/biz/ai/skills', { method: 'POST', body })
}

/** 技能按 name 定位（不是 id）；内置 Bean 技能后端会拒删。 */
export function deleteSkill(name) {
  return request(`/api/biz/ai/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

/* ---------------- 数据源 ---------------- */

/** 数据源列表（DsDataSource：id/name/type/description/configJson/enabled/createdAt） */
export function listDataSources() {
  return request('/api/biz/ds/datasources')
}

/** @param {object} body { name, type, description, configJson }；type 见 /types 目录 */
export function createDataSource(body) {
  return request('/api/biz/ds/datasources', { method: 'POST', body })
}

/** 数据源按数值 id 定位；删除为软删除 */
export function deleteDataSource(id) {
  return request(`/api/biz/ds/datasources/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- 静默鉴权 ---------------- */

/**
 * 保证本地已有可用 token：没有就用开发凭证登录一次。
 * 已登录直接通过；登录失败把错误原样交回（弹窗里展示「连接后端失败：…」）。
 *
 * @returns {Promise<{ok:boolean, user?:string, error?:string}>}
 */
export async function ensureBackendAuth() {
  if (getToken()) return { ok: true }
  try {
    const session = await login(DEV_CREDENTIALS)
    return { ok: true, user: session?.nickname || session?.username || 'admin' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
