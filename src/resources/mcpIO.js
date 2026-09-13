/**
 * mcpIO.js —— MCP 配置的「标准 mcpServers JSON」导入 / 导出
 *
 * 目标格式（与 Claude/Cursor 等主流客户端一致，用户可直接粘贴现成配置）：
 *   { "mcpServers": { "<name>": { "type": "http", "url": "...", "disabled": false, ... } } }
 *
 * 兼容三种输入形状（粘贴时不去苛求外层包裹）：
 *   1. 完整包裹：{ mcpServers: { ... } }           （标准）
 *   2. 裸映射  ：{ "<name>": { ... }, ... }        （有人会删掉外层）
 *   3. 数组    ：[ { name: "...", ... }, ... ]
 *
 * 与后端 AiMcpConfig（name/description/mcpType/endpoint/transportConfig/enabled）的字段映射：
 *   type          -> mcpType（streamableHttp/http -> http；sse -> sse；stdio -> stdio）
 *   url           -> endpoint（stdio 用 command+args 拼接）
 *   disabled      -> enabled 取反
 *   其余字段（timeout/headers/env…）原样收进 transportConfig，不丢信息 —— 导出时再展开
 */

/** 保留键：不进 transportConfig 的标准字段 */
const STANDARD_KEYS = new Set(['type', 'url', 'description', 'disabled', 'command', 'args', 'name'])

/**
 * 解析 mcpServers JSON 文本。
 *
 * @param {string} text 用户粘贴的 JSON
 * @returns {{ ok: boolean, error?: string, servers?: Array<{ name: string, cfg: object }> }}
 */
export function parseMcpServersJson(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `不是合法 JSON：${err?.message || err}` }
  }

  let entries
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.mcpServers && typeof raw.mcpServers === 'object') {
    entries = Object.entries(raw.mcpServers)
  } else if (Array.isArray(raw)) {
    // 数组形状：name 在对象内部
    entries = raw.map((it) => [it?.name, it])
  } else if (raw && typeof raw === 'object') {
    // 裸映射形状：键即名称；值必须是对象，否则不是合法的 server 定义
    entries = Object.entries(raw).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
  } else {
    return { ok: false, error: '无法识别的结构：应为 { "mcpServers": { ... } } 或同名映射/数组' }
  }

  const servers = []
  const seen = new Set()
  for (const [name, cfg] of entries) {
    if (!name || !cfg || typeof cfg !== 'object') {
      return { ok: false, error: '存在缺少名称或配置为空的条目' }
    }
    if (seen.has(name)) continue // 同名重复只取第一个，不当作错误
    seen.add(name)
    servers.push({ name: String(name).trim(), cfg })
  }
  if (!servers.length) return { ok: false, error: '没有解析到任何 MCP 服务条目' }
  return { ok: true, servers }
}

/**
 * 单个 server 定义 → 后端 AiMcpConfig 创建体。
 *
 * @param {string} name 服务名（导入场景取映射键）
 * @param {object} cfg server 定义
 */
export function toBackendConfig(name, cfg) {
  const rawType = String(cfg.type || 'http').trim()
  const lower = rawType.toLowerCase()
  // streamableHttp 是 http 的流式变体，后端只有 http/sse/stdio 三类
  let mcpType = lower === 'sse' ? 'sse' : lower === 'stdio' ? 'stdio' : 'http'
  if (!['http', 'sse', 'stdio'].includes(lower) && !cfg.url) mcpType = 'stdio'

  const endpoint = cfg.url
    ? String(cfg.url)
    : cfg.command
      ? [cfg.command, ...(Array.isArray(cfg.args) ? cfg.args : [])].join(' ')
      : ''

  // 未识别字段全部收进 transportConfig，导出时原样展开（保真回环）
  const extra = {}
  Object.entries(cfg).forEach(([k, v]) => {
    if (!STANDARD_KEYS.has(k)) extra[k] = v
  })

  return {
    name,
    description: typeof cfg.description === 'string' ? cfg.description : '',
    mcpType,
    endpoint,
    transportConfig: Object.keys(extra).length ? JSON.stringify(extra) : '',
    enabled: cfg.disabled !== true,
  }
}

/**
 * 后端配置列表 → 标准 mcpServers 导出对象（与导入格式互为逆操作）。
 *
 * @param {Array<{name,description,mcpType,endpoint,transportConfig,enabled}>} items
 * @returns {{ mcpServers: Record<string, object> }}
 */
export function buildMcpServersExport(items) {
  const mcpServers = {}
  ;(items || []).forEach((it) => {
    if (!it?.name) return
    const entry = {
      type: it.mcpType === 'stdio' ? 'stdio' : it.mcpType === 'sse' ? 'sse' : 'http',
      description: it.description || '',
    }
    if (it.mcpType === 'stdio' && it.endpoint && !/^https?:\/\//.test(it.endpoint)) {
      // stdio 的 endpoint 存的是「command args...」拼接，导出拆回 command/args
      const parts = it.endpoint.split(/\s+/)
      entry.command = parts[0]
      if (parts.length > 1) entry.args = parts.slice(1)
    } else {
      entry.url = it.endpoint || ''
    }
    entry.disabled = it.enabled === false
    // transportConfig 里的扩展字段（timeout/headers/env…）展开回顶层
    if (it.transportConfig) {
      try {
        Object.assign(entry, JSON.parse(it.transportConfig))
      } catch { /* 历史脏数据：宁缺勿炸，跳过展开 */ }
    }
    mcpServers[it.name] = entry
  })
  return { mcpServers }
}

/**
 * 触发浏览器下载一段 JSON 文本。
 *
 * @param {string} filename 下载文件名
 * @param {unknown} data 任意可序列化对象（自动美化缩进）
 */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
