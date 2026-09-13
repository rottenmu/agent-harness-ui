/**
 * HTTP 客户端：统一处理鉴权头、ApiResponse 解包与错误语义。
 *
 * 后端约定（agent-application，默认 :9900）：
 *  - 统一返回体 { code, msg, data }，code === 200 表示成功，其余为业务失败
 *  - 鉴权用 sa-token，token-name 配置为 `Authorization`，**直接放裸 token，不加 Bearer 前缀**
 *  - 未登录返回 { code: 401 }，此时清掉本地 token 让调用方降级
 */

/** localStorage 键名 */
const TOKEN_KEY = 'harness.token'
/** 默认超时：普通查询足够；模型调用类接口由调用方传入更长时间 */
const DEFAULT_TIMEOUT = 20000

/** 业务/网络错误统一类型，便于调用方区分「后端返回失败」与「代码异常」 */
export class ApiError extends Error {
  constructor(message, meta = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = meta.code
    this.status = meta.status
    /** true = 调用方主动取消（signal 触发）；超时不算取消 */
    this.aborted = meta.aborted === true
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * 发起请求并解包 ApiResponse。
 *
 * @param {string} path 以 / 开头的接口路径
 * @param {object} [options]
 * @param {string} [options.method] 默认 GET
 * @param {object} [options.body] 对象则 JSON 序列化；undefined 表示无请求体
 * @param {object} [options.query] 查询参数对象，值为 undefined/null 的键会被剔除
 * @param {number} [options.timeout] 超时毫秒
 * @param {AbortSignal} [options.signal] 外部取消信号（批量评测逐例停止用）。
 *   触发后请求以「请求已取消」失败，`err.aborted === true`，与超时（也是 AbortError
 *   但外部信号未触发）可区分 —— 调用方据此决定"静默收场"还是"报错"。
 * @param {boolean} [options.unwrap] 是否解包统一响应体取 `data`，默认 true。
 *   后端**直返裸 JSON** 的接口（如 agent-memory 的 List/Map）必须传 false。
 *   漏传不再静默拿 undefined：request 会对响应做**包络嗅探**，unwrap=true 但
 *   响应不含 code/msg 字段时当场抛 ApiError 并带上 URL —— 这类错误过去只表现
 *   为"页面是空的"且无任何报错，排查成本极高（见 memory.js 头注释）。
 * @returns {Promise<any>} 默认返回解包后的 data；unwrap=false 时返回原始 payload
 */
export async function request(path, options = {}) {
  const { method = 'GET', body, query, timeout = DEFAULT_TIMEOUT, unwrap = true, signal } = options
  const url = buildUrl(path, query)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  // 外部信号 → 内部 controller：超时与外部取消共用一次 fetch abort
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    const cancelled = signal?.aborted === true
    const aborted = err?.name === 'AbortError'
    throw new ApiError(
      cancelled
        ? `请求已取消：${path}`
        : aborted
          ? `请求超时（${timeout}ms）：${path}`
          : `无法连接后端：${err?.message || err}`,
      { code: -1, aborted: cancelled },
    )
  } finally {
    clearTimeout(timer)
  }

  const payload = await readJson(res)
  if (!res.ok) {
    throw new ApiError(payload?.msg || `HTTP ${res.status}`, { code: payload?.code, status: res.status })
  }
  if (payload && typeof payload.code === 'number' && payload.code !== 200) {
    if (payload.code === 401) clearToken()
    throw new ApiError(payload.msg || '后端返回业务失败', { code: payload.code, status: res.status })
  }
  if (!payload) return null
  // 包络嗅探：统一响应体走 .data；裸 JSON 接口必须显式 unwrap:false。
  // 漏传时过去会取不存在的 `.data` 得到 undefined 且不报错，页面只表现为
  // "空的" —— 现在当场抛错并把 URL 带上，把静默失败变成响亮失败。
  if (unwrap) {
    if (!isEnvelope(payload)) {
      throw new ApiError(
        `接口返回了裸 JSON 而非统一响应体（应传 unwrap:false）：${path}`,
        { code: -2, status: res.status },
      )
    }
    return payload.data
  }
  return payload
}

/** 判定 payload 是否为统一响应体 { code, msg, data }（裸 JSON/数组都没有 code/msg 键） */
function isEnvelope(payload) {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    ('code' in payload || 'msg' in payload)
  )
}

/** 拼接查询串，剔除空值，避免后端把 "undefined" 当字符串解析 */
function buildUrl(path, query) {
  if (!query) return path
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, value)
  })
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** 容忍非 JSON 响应（如网关返回 HTML 错误页），避免 JSON 解析异常掩盖真实状态码 */
async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}
