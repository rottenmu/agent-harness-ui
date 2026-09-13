/**
 * 链路评估与根因诊断的规则库（**纯函数、无状态、无请求**）。
 *
 * 从 `useObservability` 抽出来的原因有两个：
 *  1. hooks 文件有 150 行上限，评估 + 诊断两段规则占了近一半，混在数据源里
 *     既超限又让"取数"和"判分"两件事搅在一起；
 *  2. 规则本身会持续增补（新增错误特征、调整打分权重），单独一个文件便于演进，
 *     也让 `tmp/verify/observ-derive.test.mjs` 能直接对规则做单测。
 *
 * ⚠️ 重要前提：后端**没有**独立的 evaluation 接口。这两组函数产出的一切结论
 * 都是按链路事实（步骤状态、耗时、类型）**规则化计算**出来的，不是模型评判。
 * 凡是把它们展示给用户的地方，都必须如实标注「规则评估 / 规则库匹配」。
 */

/* ---------------- 评估 ---------------- */

/** 步骤耗时超过该阈值即计入「慢步骤」违规。 */
const SLOW_STEP_MS = 2000

/**
 * 由 Trace + 步骤推导评估结果。
 *
 * 三个指标的口径：
 *  - `toolRate`   工具调用成功率（无工具调用时视为 1，不惩罚）
 *  - `relevance`  输出相关性 = 成功步骤占比 ×0.6 + 模型成功率 ×0.4，钳到 0-1
 *  - `compliance` 由违规项最高严重度决定：有 high → failed，有任意违规 → warning
 *
 * @param {object|null} trace
 * @param {object[]} steps 扁平步骤
 */
export function evaluateTrace(trace, steps) {
  const list = steps || []
  const toolSteps = list.filter((s) => s.stepType === 'tool_call')
  const toolOk = toolSteps.filter((s) => s.status !== 'failed').length
  const toolRate = toolSteps.length ? toolOk / toolSteps.length : 1

  const failed = list.filter((s) => s.status === 'failed')
  const modelSteps = list.filter((s) => s.stepType === 'model_call')
  const modelOk = modelSteps.length - modelSteps.filter((s) => s.status === 'failed').length
  // 相关性以"成功步骤占比"为主，模型成功率加权——失败越多得分越低
  const okRatio = list.length ? (list.length - failed.length) / list.length : 1
  const modelRatio = modelSteps.length ? modelOk / modelSteps.length : 1
  const relevance = Math.max(0, Math.min(1, okRatio * 0.6 + modelRatio * 0.4))

  const violations = collectViolations({ trace, list, toolSteps, toolOk, toolRate, modelSteps, modelOk })

  const hasHigh = violations.some((v) => v.severity === 'high')
  const compliance = hasHigh ? 'failed' : violations.length ? 'warning' : 'passed'
  return { toolRate, relevance, compliance, violations, toolTotal: toolSteps.length }
}

/** 逐条规则检查，返回违规列表。拆出来让 evaluateTrace 本体保持短小。 */
function collectViolations(ctx) {
  const { trace, list, toolSteps, toolOk, toolRate, modelSteps, modelOk } = ctx
  const out = []

  const slow = list.filter((s) => (s.latencyMs || 0) > SLOW_STEP_MS)
  if (slow.length) {
    out.push({
      severity: 'medium',
      rule: '延迟·慢步骤',
      detail: `${slow.length} 个步骤耗时超 2s：${slow.map((s) => s.name).join('、')}`,
    })
  }
  if (toolSteps.length && toolRate < 1) {
    out.push({
      severity: 'high',
      rule: '工具·调用失败',
      detail: `${toolSteps.length - toolOk}/${toolSteps.length} 次工具调用失败，链路可能缺少降级路径`,
    })
  }
  if (modelSteps.length && modelOk < modelSteps.length) {
    out.push({
      severity: 'high',
      rule: '模型·调用异常',
      detail: `${modelSteps.length - modelOk} 次模型调用未成功，需检查上游可用性与模型配置`,
    })
  }
  if (trace && trace.tokens === 0 && modelSteps.length) {
    out.push({
      severity: 'low',
      rule: '计量·Token 缺失',
      detail: '存在模型调用但未记录到 token 消耗，计量口径可能未覆盖该模型适配器',
    })
  }
  return out
}

/* ---------------- 诊断 ---------------- */

/** 错误特征 → 根因与修复建议的规则表，按顺序匹配，命中即停。 */
const DIAGNOSIS_RULES = [
  {
    match: /timeout|timed out|超时/i,
    root: (s) => `步骤「${s.name}」因下游响应超时失败，链路在等待上游返回期间耗尽了超时预算。`,
    evidence: (s, n) => ['错误文本包含 timeout 特征', `该步骤耗时 ${s.latencyMs}ms`, `同链路共 ${n} 个步骤失败`],
    fixes: [
      { priority: 'P0', title: '核对下游服务状态', desc: '确认被调方 P99 是否劣化、是否发生扩容或限流。' },
      { priority: 'P1', title: '调整超时与重试策略', desc: '适度放宽超时并改用指数退避，避免重试风暴放大下游压力。' },
      { priority: 'P1', title: '补充降级路径', desc: '工具不可用时不应直接中断，应回退到缓存结果或升级人工。' },
    ],
  },
  {
    match: /404|not found|未找到/i,
    root: () => '上游返回 404，说明请求地址或模型标识不存在——通常是模型配置与网关实际暴露的路由不一致。',
    evidence: (s) => ['错误文本包含 HTTP 404', `涉及步骤类型 ${s.stepType}`, '属于配置类错误，重试不会自愈'],
    fixes: [
      { priority: 'P0', title: '核对模型名与端点', desc: '确认模型配置中的模型标识在供应商侧真实存在且已开通。' },
      { priority: 'P1', title: '校验 baseUrl 拼接', desc: '检查网关前缀是否重复或缺失，避免拼出 /v1/v1/... 之类的路径。' },
      { priority: 'P2', title: '启动时校验模型可用性', desc: '在应用启动阶段对已配置模型做一次探活，提前暴露配置错误。' },
    ],
  },
  {
    match: /401|403|unauthor|forbidden|invalid.*key/i,
    root: () => '鉴权失败：请求未能通过上游身份校验，通常与密钥过期、额度耗尽或环境变量未注入有关。',
    evidence: () => ['错误文本包含鉴权关键字', '属于配置/凭证类错误'],
    fixes: [
      { priority: 'P0', title: '检查密钥与额度', desc: '确认 API Key 未过期、账户额度未耗尽。' },
      { priority: 'P1', title: '确认环境变量注入', desc: '核对部署环境的密钥变量名与代码读取的键一致。' },
    ],
  },
  {
    match: /parse|json|schema|反序列/i,
    root: (s) => `模型输出未命中预期的结构约束，解析阶段失败——常见于采样温度偏高或未启用结构化输出。`,
    evidence: (s) => ['错误文本包含解析/格式关键字', `步骤「${s.name}」为 ${s.stepType} 类型`],
    fixes: [
      { priority: 'P0', title: '启用结构化输出', desc: '改用 json_schema 类强约束输出，并降低 temperature。' },
      { priority: 'P1', title: '解析失败自修复', desc: '解析异常时把原始输出回灌模型要求仅返回 JSON，而非直接抛错。' },
    ],
  },
]

/** 无特征命中时的通用建议。 */
const FALLBACK_FIXES = [
  { priority: 'P0', title: '查看该步骤输入输出', desc: '在拓扑树中点选失败节点，核对入参与返回体是否符合预期。' },
  { priority: 'P1', title: '补充错误特征规则', desc: '若该类错误反复出现，建议把其特征加入本规则库以便自动归类。' },
]

/**
 * 由失败步骤推导根因与修复建议（规则库，非 LLM 生成）。
 *
 * @param {object|null} trace
 * @param {object[]} steps
 * @returns {object|null} 无失败步骤时返回 null
 */
export function diagnoseTrace(trace, steps) {
  const failed = (steps || []).filter((s) => s.status === 'failed')
  if (!failed.length) return null

  const primary = failed[0]
  const text = `${primary.outputJson || ''} ${primary.name || ''}`
  const hit = DIAGNOSIS_RULES.find((r) => r.match.test(text))

  if (hit) {
    return {
      root: hit.root(primary),
      evidence: hit.evidence(primary, failed.length),
      fixes: hit.fixes,
      step: primary,
      failedCount: failed.length,
      matched: true,
    }
  }
  return {
    root: `步骤「${primary.name}」执行失败，链路在该节点中断。当前规则库未匹配到已知错误特征，建议结合输入输出人工研判。`,
    evidence: [`失败步骤 ${failed.length} 个`, `首个失败于 seq=${primary.seq}`, `耗时 ${primary.latencyMs}ms`],
    fixes: FALLBACK_FIXES,
    step: primary,
    failedCount: failed.length,
    matched: false,
  }
}
