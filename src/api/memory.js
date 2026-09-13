/**
 * 内存（agent-memory）只读接口封装
 *
 * 这里的「内存」= 后端 **agent-memory 模块**（智能体四层记忆 L0~L3 +
 * OLTP/OLAP 双存储），不是浏览器或 JVM 的运行内存 —— 仓库里该模块的中文口径
 * 就是「内存」（见全局记忆 `memory-stack` 一条自述）。
 *
 * ⚠️ 与 `/api/biz/ai/**` 的三套 CRUD 不同，这批接口**不走统一 ApiResponse**：
 * Controller 直接返回 `List` / `Map`（AiMemoryController、MemoryArchController），
 * 所以每处都要传 `unwrap: false`。少了这个参数不会报错，只会静默拿到
 * undefined，表现为"内存节永远是空的"。
 *
 * 数据来源（均只读，不在此层做增删改 —— 内存页只做展示）：
 *  - /api/agent-memory/arch/stats            五维统计（人格 / 画像 / 日志 / 蒸馏）
 *  - /api/agent-memory/arch/configs?type=    L2/L3 记忆条目（SOUL=人格 / USER=画像）
 *  - /api/ai/memory/policy                   记忆策略（白名单 + 敏感过滤规则）
 *  - /api/ai/memory/global                   全局持久记忆（跨会话共享）
 *  - /api/ai/memory/session/{id}             单个会话的业务变量（L1）
 *  - /api/agent-memory/analytics/messages    L0 原始日志（OLAP 分页）
 */
import { request } from './client'
// 复用资源模块的静默登录：凭证与登录流程只应存在一份，否则两处迟早走岔
import { ensureBackendAuth } from './resources'

/** 五维统计：soulConfigCount / userProfileCount / todayDialogues / totalDialogues / extracted */
export function fetchMemoryStats() {
  return request('/api/agent-memory/arch/stats', { unwrap: false })
}

/** 记忆策略：whitelistCategories / whitelistEnabled / sensitiveFiltering / sensitiveRules */
export function fetchMemoryPolicy() {
  return request('/api/ai/memory/policy', { unwrap: false })
}

/** 全局持久记忆（跨会话、跨智能体共享），按后端默认顺序取前 limit 条 */
export function fetchGlobalMemory(limit = 6) {
  return request('/api/ai/memory/global', { query: { limit }, unwrap: false })
}

/** 单会话业务变量。sessionId 为空时直接给空数组，避免打一条必然无意义的请求 */
export function fetchSessionMemory(sessionId, limit = 50) {
  if (!sessionId) return Promise.resolve([])
  return request(`/api/ai/memory/session/${encodeURIComponent(sessionId)}`, {
    query: { limit },
    unwrap: false,
  })
}

/**
 * 分层记忆条目（L3 人格 / L2 画像共用一张表，按 type 区分）。
 * 返回 `{ rows, total, page, size }`。
 */
export function fetchArchConfigs(type = 'USER', page = 0, size = 50) {
  return request('/api/agent-memory/arch/configs', {
    query: { type, page, size },
    unwrap: false,
  })
}

/** L0 原始日志（OLAP 落库的对话轮次），返回 `{ rows, total, page, size }` */
export function fetchL0Messages(page = 0, size = 50) {
  return request('/api/agent-memory/analytics/messages', {
    query: { page, size },
    unwrap: false,
  })
}

/* ================= 可观测页面（/api/agent-memory/analytics OLAP 只读报表） ================= */

/** 会话聚合统计：[{ session_id, message_count, total_tokens, active_duration_ms }] */
export function fetchSessionStats() {
  return request('/api/agent-memory/analytics/session-stats', { unwrap: false })
}

/** 用户行为时序：近 days 天逐日消息量 [{ day(ms), message_count }]；days 上限 90 */
export function fetchUserActivity(days = 14) {
  return request('/api/agent-memory/analytics/user-activity', {
    query: { days },
    unwrap: false,
  })
}

/** L0 事件构成（role 分布）：[{ role, event_count }] */
export function fetchDistillationStats() {
  return request('/api/agent-memory/analytics/distillation-stats', { unwrap: false })
}

/** 按 traceId 溯源完整事件链：[{ trace_id, session_id, user_id, ts, role, content, tokens }] */
export function fetchTraceEvents(traceId) {
  return request('/api/agent-memory/analytics/trace', {
    query: { traceId },
    unwrap: false,
  })
}

/**
 * 文件存储配置（设置面板「内存管理」节）。
 * 返回 `{ mode, baseDir, layout, persisted }`；mode=rocksdb 时 baseDir 不参与定位。
 */
export function fetchMemoryFileConfig() {
  return request('/api/agent-memory/file/config', { unwrap: false })
}

/**
 * 修改文件存储根目录（立即生效并持久化，重启保留）。
 * 失败时后端返回 `{ ok:false, error }`（HTTP 仍是 200），这里转成异常抛给调用方。
 */
export async function updateMemoryFileConfig(baseDir) {
  const res = await request('/api/agent-memory/file/config', {
    method: 'PUT',
    body: { baseDir },
    unwrap: false,
  })
  if (res && res.ok === false) throw new Error(res.error || '保存失败')
  return res
}
