/**
 * 资源描述表（智能体 / MCP / 技能）
 *
 * ---------------------------------------------------------------------------
 * 为什么单独抽成一个模块
 * ---------------------------------------------------------------------------
 * 同一份「字段表 + 列表展示规则」现在有两个消费方：
 *   · ResourceManagerModal —— 管理弹窗（列表 + 新建）
 *   · ResourcePage         —— 资源页面（列表；创建走新增弹窗），三个类型共用一份组件
 * 留在弹窗组件里导出，页面就得反向依赖一个弹窗组件，且以后再来一处消费
 * 就会长出第二份字段表 —— 字段一改、两处展示不一致，这种漂移不报错。
 *
 * 除字段表外，每个类型还提供页面形态所需的展示文案：
 *   createLabel（右上角按钮）/ emptyText（空态主文案）/ itemDesc（行内描述列）。
 * 三者都是**按类型固定**的短文案或取值器，写在页面组件里就得按类型写分支，
 * 与「差异全部收敛到描述表」的原则相悖。
 *
 * 描述表是纯数据（字段定义、展示映射、payload 构造、校验），不含组件状态，
 * 因此放在这里不必担心与任何组件的生命周期耦合。
 */

const AGENT_TYPES = [
  { value: 'conversation', label: 'conversation · 普通对话' },
  { value: 'rag', label: 'rag · 检索增强' },
  { value: 'tool', label: 'tool · 工具调用' },
  { value: 'plan', label: 'plan · 规划执行' },
  { value: 'graph', label: 'graph · 图任务流' },
]
const MCP_TYPES = [
  { value: 'http', label: 'http' },
  { value: 'sse', label: 'sse' },
  { value: 'stdio', label: 'stdio' },
]
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'].map((m) => ({ value: m, label: m }))

const MODEL_PROVIDERS = [
  { value: 'bailian', label: 'bailian · 百炼 DashScope' },
  { value: 'custom', label: 'custom · 自定义 OpenAI 兼容' },
]
const MODEL_ENVS = [
  { value: 'dev', label: 'dev · 开发' },
  { value: 'staging', label: 'staging · 预发' },
  { value: 'prod', label: 'prod · 生产' },
]

/** 数据源类型 → AppIcon 图标（卡片网格用，与类型目录一一对应） */
const DS_TYPE_ICONS = {
  database: 'archive',
  mysql: 'archive',
  mariadb: 'archive',
  postgresql: 'archive',
  redis: 'activity',
  document: 'summary',
  ocr: 'eye',
  web: 'search',
  api: 'send',
  file_server: 'folder',
  minio: 'archive',
  ftp: 'folder',
  oss: 'download',
  erp: 'panel',
}

/**
 * 数据源类型目录（与后端 DsConnectorFactory.types() 对齐，14 类）。
 * label 前缀是类型 key，后缀是中文名（itemMeta/cardSummary 只取「 · 」后段）。
 */
const DS_TYPES = [
  { value: 'database', label: 'database · 数据库(通用 JDBC)' },
  { value: 'mysql', label: 'mysql · MySQL' },
  { value: 'mariadb', label: 'mariadb · MariaDB' },
  { value: 'postgresql', label: 'postgresql · PostgreSQL' },
  { value: 'redis', label: 'redis · Redis' },
  { value: 'document', label: 'document · Excel/Word/PDF' },
  { value: 'ocr', label: 'ocr · 扫描件 OCR' },
  { value: 'web', label: 'web · 网页' },
  { value: 'api', label: 'api · 接口数据' },
  { value: 'file_server', label: 'file_server · 文件服务器(本地/FTP)' },
  { value: 'minio', label: 'minio · MinIO' },
  { value: 'ftp', label: 'ftp · FTP' },
  { value: 'oss', label: 'oss · 阿里云 OSS' },
  { value: 'erp', label: 'erp · ERP 数据表' },
]

/**
 * 按类型预填的连接配置模板：新建数据源切换「类型」时，
 * 若配置框为空或仍是别的模板，就自动填入对应模板（用户手改过则不动）。
 */
const DS_CONFIG_PRESETS = {
  database: '{\n  "jdbcUrl": "jdbc:…",\n  "driver": "",\n  "username": "",\n  "password": ""\n}',
  mysql: '{\n  "host": "127.0.0.1",\n  "port": 3306,\n  "database": "",\n  "username": "root",\n  "password": ""\n}',
  mariadb: '{\n  "host": "127.0.0.1",\n  "port": 3306,\n  "database": "",\n  "username": "root",\n  "password": ""\n}',
  postgresql: '{\n  "host": "127.0.0.1",\n  "port": 5432,\n  "database": "",\n  "username": "postgres",\n  "password": ""\n}',
  redis: '{\n  "host": "127.0.0.1",\n  "port": 6379,\n  "password": "",\n  "db": 0\n}',
  document: '{\n  "filePath": "D:/path/to/file.xlsx"\n}',
  ocr: '{\n  "imagePath": "D:/path/to/scan.png",\n  "language": "chi_sim+eng"\n}',
  web: '{\n  "url": "https://example.com",\n  "selector": ""\n}',
  api: '{\n  "baseUrl": "https://api.example.com",\n  "path": "/v1/resource"\n}',
  file_server: '{\n  "rootPath": "D:/data"\n}',
  minio: '{\n  "endpoint": "http://127.0.0.1:9000",\n  "bucket": "",\n  "accessKey": "",\n  "secretKey": ""\n}',
  ftp: '{\n  "host": "",\n  "port": 21,\n  "username": "",\n  "password": "",\n  "rootPath": "/"\n}',
  oss: '{\n  "endpoint": "oss-cn-hangzhou.aliyuncs.com",\n  "bucket": "",\n  "accessKey": "",\n  "secretKey": ""\n}',
  erp: '{\n  "jdbcUrl": "jdbc:…",\n  "username": "",\n  "password": "",\n  "erpType": ""\n}',
}

const RESOURCE_DEFS = {
  agent: {
    title: '智能体',
    createLabel: '创建智能体',
    emptyText: '还没有任何智能体',
    icon: 'sparkle',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '如 客服助手' },
      { key: 'desc', label: '描述', type: 'text', placeholder: '一句话说明用途（可选）' },
      { key: 'agentType', label: '类型', type: 'select', options: AGENT_TYPES },
      { key: 'model', label: '模型', type: 'text', placeholder: '如 qwen-plus / deepseek-chat' },
      { key: 'persona', label: '系统提示词', type: 'textarea', placeholder: '定义角色、边界与输出风格（可选，创建后仍可编辑）' },
      { key: 'enabled', label: '启用', type: 'switch' },
    ],
    defaults: () => ({ name: '', desc: '', agentType: 'conversation', model: 'qwen-plus', persona: '', enabled: true }),
    itemKey: (it) => it.id,
    itemName: (it) => it.name || '(未命名)',
    itemDesc: (it) => it.desc,
    itemMeta: (it) => {
      const t = AGENT_TYPES.find((o) => o.value === it.agentType)?.label.split(' · ')[0] || it.agentType || '—'
      return `${t} · ${it.model || '模型未指定'}${it.enabled ? '' : ' · 已停用'}`
    },
    buildPayload: (form) => ({
      name: form.name.trim(),
      desc: form.desc.trim(),
      agentType: form.agentType,
      model: form.model.trim() || 'qwen-plus',
      persona: form.persona.trim(),
      enabled: form.enabled,
      skillIds: [],
      defaultChannels: [],
    }),
  },

  model: {
    title: '模型',
    createLabel: '新建模型配置',
    emptyText: '还没有任何模型配置',
    icon: 'activity',
    fields: [
      { key: 'configName', label: '配置名称', type: 'text', required: true, placeholder: '如 qwen-plus-生产' },
      { key: 'provider', label: '供应商', type: 'select', options: MODEL_PROVIDERS },
      { key: 'endpoint', label: '服务地址', type: 'text', required: true, placeholder: '如 https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-…（保存后仅显示脱敏值）' },
      { key: 'modelId', label: '模型 ID', type: 'text', required: true, placeholder: '如 qwen-plus / deepseek-v3' },
      { key: 'env', label: '运行环境', type: 'select', options: MODEL_ENVS },
      { key: 'enabled', label: '启用', type: 'switch' },
      { key: 'temperature', label: '温度', type: 'number', placeholder: '0~2，默认 0.7' },
      { key: 'topP', label: 'Top P', type: 'number', placeholder: '0~1，默认 0.8' },
      { key: 'maxTokens', label: '最大 Token', type: 'number', placeholder: '默认 4096' },
      { key: 'description', label: '描述', type: 'textarea', placeholder: '这条配置用在哪个场景（可选）' },
    ],
    defaults: () => ({
      configName: '', provider: 'bailian', endpoint: '', apiKey: '', modelId: '',
      env: 'dev', enabled: true, temperature: '', topP: '', maxTokens: '', description: '',
    }),
    itemKey: (it) => it.id,
    itemName: (it) => it.configName || '(未命名)',
    itemDesc: (it) => it.description || it.endpoint,
    itemMeta: (it) => `${it.provider || '—'} · ${it.modelId || '模型未指定'}${it.enabled ? '' : ' · 已停用'}`,
    tag: (it) => (it.env ? { text: it.env.toUpperCase(), dim: it.env !== 'prod' } : null),
    hint: 'API Key 只在创建时写入；列表永远只显示脱敏值，编辑时留空或 *** 表示保留原密钥。',
    validate: (form) => {
      const num = (v) => (String(v).trim() === '' ? null : Number(v))
      const temperature = num(form.temperature)
      if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
        return '温度必须是 0~2 之间的数字'
      }
      const topP = num(form.topP)
      if (topP !== null && (!Number.isFinite(topP) || topP < 0 || topP > 1)) {
        return 'Top P 必须是 0~1 之间的数字'
      }
      const maxTokens = num(form.maxTokens)
      if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
        return '最大 Token 必须是正整数'
      }
      return ''
    },
    buildPayload: (form) => ({
      configName: form.configName.trim(),
      description: form.description.trim(),
      provider: form.provider,
      endpoint: form.endpoint.trim(),
      apiKey: form.apiKey.trim(),
      modelId: form.modelId.trim(),
      env: form.env,
      enabled: form.enabled,
      temperature: form.temperature === '' ? null : Number(form.temperature),
      topP: form.topP === '' ? null : Number(form.topP),
      maxTokens: form.maxTokens === '' ? null : Number(form.maxTokens),
      tags: [],
    }),
  },

  datasource: {
    title: '数据源',
    createLabel: '新建数据源',
    emptyText: '还没有任何数据源',
    icon: 'folder',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '如 生产 MySQL / 产品手册库' },
      { key: 'type', label: '类型', type: 'select', options: DS_TYPES },
      { key: 'description', label: '描述', type: 'text', placeholder: '这个数据源存放什么数据（可选）' },
      { key: 'configJson', label: '连接配置 JSON', type: 'textarea', placeholder: '按类型不同字段，如 {"url":"jdbc:mysql://…","user":"…","password":"…"}' },
    ],
    defaults: () => ({ name: '', type: 'database', description: '', configJson: DS_CONFIG_PRESETS.database }),
    /** 类型 → 连接配置模板（新建弹窗切类型时自动预填，见 ResourceManagerModal） */
    configPreset: DS_CONFIG_PRESETS,
    itemKey: (it) => it.id,
    itemName: (it) => it.name || '(未命名)',
    itemDesc: (it) => it.description,
    itemMeta: (it) => `${(DS_TYPES.find((o) => o.value === it.type)?.label.split(' · ')[0]) || it.type || '—'}${it.enabled === false ? ' · 已停用' : ''}`,
    /**
     * 内置数据源判定：后端种子数据 createdBy 为空；UI 创建的一律 'user'（2026-09-13 起）。
     * ResourcePage 据此把内置行渲染成顶部卡片网格、用户行留在下方列表。
     */
    builtinCheck: (it) => !String(it.createdBy || '').trim(),
    /** 卡片上的类型中文名 */
    typeLabel: (it) => DS_TYPES.find((o) => o.value === it.type)?.label.split(' · ')[1] || it.type || '—',
    /** 卡片类型图标 */
    typeIcon: (it) => DS_TYPE_ICONS[it.type] || 'folder',
    /** 卡片配置摘要：从 configJson 抽第一个有辨识度的键值；密码类字段不外显 */
    cardSummary: (it) => {
      let cfg = {}
      try { cfg = JSON.parse(it.configJson || '{}') } catch { return '配置未解析' }
      const keys = Object.keys(cfg)
      const hit = keys.find((k) => ['url', 'jdbcUrl', 'path', 'dir', 'host', 'endpoint', 'address', 'location', 'baseDir', 'file', 'root', 'rootPath', 'bucket', 'database'].includes(k))
      if (hit) return `${hit}: ${String(cfg[hit]).slice(0, 64)}`
      return keys.length ? `${keys.length} 项配置` : '无连接配置'
    },
    /** 后端 create 前置校验镜像：名称/类型必填；configJson 若填必须是合法 JSON */
    validate: (form) => {
      if (form.configJson.trim()) {
        try { JSON.parse(form.configJson) } catch { return '连接配置不是合法 JSON' }
      }
      return ''
    },
    buildPayload: (form) => ({
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
      configJson: form.configJson.trim() || '{}',
    }),
  },

  mcp: {
    title: 'MCP 配置',
    createLabel: '新建 MCP 配置',
    emptyText: '还没有任何 MCP 配置',
    icon: 'terminal',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '如 filesystem-mcp' },
      { key: 'description', label: '描述', type: 'text', placeholder: '该服务提供哪些工具（可选）' },
      { key: 'mcpType', label: '类型', type: 'select', options: MCP_TYPES },
      { key: 'endpoint', label: '端点地址', type: 'text', placeholder: 'http/sse 必填，如 http://localhost:3000/mcp' },
      { key: 'transportConfig', label: '传输配置 JSON', type: 'textarea', placeholder: '如 {"headers":{"X-Token":"..."}}（可选）' },
      { key: 'enabled', label: '启用', type: 'switch' },
    ],
    defaults: () => ({ name: '', description: '', mcpType: 'http', endpoint: '', transportConfig: '', enabled: true }),
    itemKey: (it) => String(it.id),
    itemName: (it) => it.name || '(未命名)',
    itemDesc: (it) => it.description,
    itemMeta: (it) => `${(it.mcpType || '—').toUpperCase()} · ${it.endpoint || '本地进程'}${it.enabled === false ? ' · 已停用' : ''}`,
    /** 后端规则镜像：http/sse 必须带 endpoint；transportConfig 若填必须是合法 JSON */
    validate: (form) => {
      if ((form.mcpType === 'http' || form.mcpType === 'sse') && !form.endpoint.trim()) {
        return 'http/sse 类型必须填写端点地址'
      }
      if (form.transportConfig.trim()) {
        try { JSON.parse(form.transportConfig) } catch { return '传输配置不是合法 JSON' }
      }
      return ''
    },
    buildPayload: (form) => ({
      name: form.name.trim(),
      description: form.description.trim(),
      mcpType: form.mcpType,
      endpoint: form.endpoint.trim(),
      transportConfig: form.transportConfig.trim(),
      enabled: form.enabled,
    }),
  },

  skill: {
    title: '技能',
    createLabel: '新建技能',
    emptyText: '还没有任何技能',
    icon: 'code',
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '如 weather-lookup（创建后不可改）' },
      { key: 'description', label: '描述', type: 'text', placeholder: '技能做什么、何时该被调用' },
      { key: 'method', label: '方法', type: 'select', options: HTTP_METHODS },
      { key: 'baseUrl', label: '服务地址', type: 'text', required: true, placeholder: '如 http://localhost:9901' },
      { key: 'path', label: '接口路径', type: 'text', required: true, placeholder: '如 /api/tools/search' },
      { key: 'timeoutMillis', label: '超时 (ms)', type: 'number', placeholder: '默认 3000' },
    ],
    defaults: () => ({ name: '', description: '', method: 'POST', baseUrl: '', path: '', timeoutMillis: '3000' }),
    itemKey: (it) => it.name,
    itemName: (it) => it.name,
    itemDesc: (it) => it.description,
    itemMeta: (it) => `${it.source === 'bean' ? '内置 Bean' : '自定义 API'} · 被 ${it.referenceCount ?? 0} 个智能体引用${it.enabled === false ? ' · 已停用' : ''}`,
    tag: (it) => (it.source === 'bean' ? { text: '内置', dim: true } : null),
    /** 内置 Bean 技能后端拒删，前端直接不渲染删除按钮 */
    locked: (it) => it.source === 'bean',
    hint: '名称创建后不可修改；带「内置」标记的 Bean 技能由后端注册，不可在此删除。',
    validate: (form) => {
      const timeout = Number(form.timeoutMillis)
      if (!Number.isFinite(timeout) || timeout <= 0) return '超时时间必须是正整数（毫秒）'
      return ''
    },
    buildPayload: (form) => ({
      name: form.name.trim(),
      description: form.description.trim(),
      readOnly: false,
      apiConfig: {
        enabled: true,
        baseUrl: form.baseUrl.trim(),
        path: form.path.trim(),
        method: form.method,
        timeoutMillis: Number(form.timeoutMillis) || 3000,
        headers: {},
      },
    }),
  },
}

export { RESOURCE_DEFS, AGENT_TYPES, MCP_TYPES, HTTP_METHODS }
