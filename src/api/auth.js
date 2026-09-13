/**
 * 鉴权接口封装（agent-auth）
 *
 * 后端 /api/** 默认全部要求登录（AuthProperties.Interceptor.includePaths），
 * 观测中心 `/api/biz/ai/observ/**` 不在白名单内，因此联调前必须先登录拿 token。
 *
 * 凭证：本地开发由 agent-application 的 DataInitializer 内置 admin/admin（部门需命中
 * DepartmentOptions 白名单）。生产环境请改用环境变量注入，不要把凭证写进代码。
 */
import { clearToken, getToken, request, setToken } from './client'

/** 部门白名单，与后端 DepartmentOptions.ALL 保持一致 */
export const DEPARTMENTS = ['采购部', '行政', '设计部', '生产部']

/** 本地开发默认凭证（可通过 .env 的 VITE_HARNESS_USER / VITE_HARNESS_PWD / VITE_HARNESS_DEPT 覆盖） */
export const DEV_CREDENTIALS = {
  username: import.meta.env.VITE_HARNESS_USER || 'admin',
  password: import.meta.env.VITE_HARNESS_PWD || 'admin',
  department: import.meta.env.VITE_HARNESS_DEPT || '行政',
}

/**
 * 登录并把 token 落到本地。
 *
 * @param {{username?:string, password?:string, department?:string}} [credentials]
 * @returns {Promise<{token:string, username:string, nickname:string, department:string, userId:any, permissions:string[]}>}
 */
export async function login(credentials = {}) {
  const payload = { ...DEV_CREDENTIALS, ...credentials }
  const data = await request('/api/auth/login', { method: 'POST', body: payload })
  if (data?.token) setToken(data.token)
  return data
}

/** 退出登录：仅清本地 token（sa-token 服务端会话保留，避免影响其它端） */
export function logout() {
  clearToken()
}

export { getToken, setToken, clearToken }
