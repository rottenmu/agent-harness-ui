/**
 * 可观测数据源：把 /api/biz/ai/observ 的真实返回整理成页面直接可用的结构。
 *
 * 后端 reality（实测确认，勿凭想象改）：
 * - `/dashboard` → `{ summary:{totalCalls,successRate,failCount,avgLatencyMs,...},
 *   trend:{days:[{date,calls,successRate}]}, byAgent:[{agentName,calls,successRate}] }`
 *   —— trend 是**对象**包着 days 数组，不是数组本身。
 * - `/traces` → 扁平数组，字段 `traceKey/sessionId/agentName/intent/status/latencyMs/tokens/startedAt`
 * - `/traces/{key}` → `{ trace, steps:[{seq,stepType,name,inputJson,outputJson,latencyMs,status}] }`
 *   —— **steps 是扁平列表**，后端不做嵌套；Span 树由前端按 seq 顺序构建。
 */
import { ref, computed } from 'vue'
import { fetchDashboard, fetchTraces, fetchTraceDetail, fetchTokenSummary } from '@/api/observ'
// 评估与诊断的规则库（见 observRules.js）。这里 import 是为了在本模块内部调用，
// 文件末尾另有 re-export，让调用方仍可从本模块取到，不必关心内部拆分。
import { evaluateTrace, diagnoseTrace } from './observRules'
export { evaluateTrace, diagnoseTrace }

/** 步骤类型 → 展示元信息（颜色与拓扑树图例共用）。 */
export const STEP_META = {
  intent: { key: 'intent', label: '意图路由', color: '#fbbf24', icon: 'compass' },
  agent: { key: 'agent', label: 'Agent 执行', color: '#4096ff', icon: 'robot' },
  model_call: { key: 'model_call', label: 'LLM 调用', color: '#a78bfa', icon: 'brain' },
  reasoning: { key: 'reasoning', label: '推理轮次', color: '#38bdf8', icon: 'lightbulb' },
  tool_call: { key: 'tool_call', label: '工具调用', color: '#36d399', icon: 'wrench' },
}

/** 取步骤的展示元信息，未知类型归入 agent 视觉。 */
export function stepMeta(type) {
  return STEP_META[type] || { key: type || 'other', label: type || '未知步骤', color: '#8b93a3', icon: 'dot' }
}

/** Trace 类型（用于列表徽标与筛选）由步骤构成推断。 */
export function inferTraceType(steps) {
  const types = new Set((steps || []).map((s) => s.stepType))
  if (types.has('tool_call')) return 'tool_call'
  if (types.has('model_call')) return 'llm_call'
  return 'agent_execution'
}

/**
 * 构建 Span 树。
 *
 * ⚠️ 关键约束：**不能按 seq 顺序边遍历边定父子**。
 *
 * `HarnessTraceMiddleware` 的每个 hook 都在 `doOnComplete` / `doOnError` 里才写步骤，
 * 也就是"做完才记账"。而 `onAgent` 包裹的是**整次 reply**（最外层），所以它的
 * 完成时刻最晚 —— `agent` 步骤在 seq 上排**最后**，尽管语义上它是最外层容器。
 * 实测一条真实链路的 seq 顺序是：
 *
 *   #1 intent → #2 model_call → #3 reasoning → #4 model_call → #5 reasoning → #6 agent
 *
 * 踩过的两个坑（都由"边遍历边挂"引起）：
 *   a) 把首个 `agent` 当根 → 因为 agent 在最后，实际以 `intent` 为根，树塌成扁平；
 *   b) 维护一个 `container` 游标按 seq 推进 → 处理 #2~#5 时游标还是 null，
 *      这四步全掉进"无容器"兜底分支，树依然是 6 个平级根。
 *
 * 因此这里分**两趟**处理，先认容器再挂子节点：
 *   第一趟：找出所有 `agent` 步骤，每个成为一棵树的根；
 *   第二趟：把非 agent 步骤按类型归位 ——
 *     · `intent` 是链路入口（发生在 agent 执行之前），作为**独立根**；
 *     · 其余（model_call / reasoning / tool_call）挂到 agent 根下，并保持 seq 顺序，
 *       这样"模型调用 → 推理 → 模型调用 → 推理"的 ReAct 轮次形状能读出来。
 *
 * 为什么用**第一个** agent 作为容器：一次 reply 只应有一个 agent 步骤；若出现多个
 * （并发子 agent 等），全部作为根保留，不丢数据。
 *
 * @param {object[]} steps 后端返回的扁平步骤（未嵌套）
 * @returns {object[]} 根节点数组
 */
export function buildSpanTree(steps) {
  const list = [...(steps || [])].sort((a, b) => (a.seq || 0) - (b.seq || 0))

  const toNode = (s) => ({
    id: `sp-${s.id ?? `seq${s.seq}`}`,
    seq: s.seq,
    type: s.stepType,
    name: s.name || s.stepType,
    latencyMs: s.latencyMs || 0,
    status: s.status === 'failed' ? 'failed' : 'ok',
    inputJson: s.inputJson || '',
    outputJson: s.outputJson || '',
    createdAt: s.createdAt,
    children: [],
  })

  const agentNodes = list.filter((s) => s.stepType === 'agent').map(toNode)
  const intentNodes = list.filter((s) => s.stepType === 'intent').map(toNode)
  const innerSteps = list.filter((s) => s.stepType !== 'agent' && s.stepType !== 'intent')

  // 主容器 = 第一个 agent；其余 agent 作为独立根保留
  const primary = agentNodes[0] || null
  if (primary) primary.children = innerSteps.map(toNode)

  // 根的排列顺序：意图路由在前（它是链路入口），agent 容器随后 —— 符合阅读时序
  const roots = [...intentNodes, ...agentNodes]

  // 兜底：整条链路既无 agent 也无 intent（例如只到某一步就中断），
  // 此时把全部步骤平铺为根，保证任何情况下都有东西可渲染，而不是把步骤丢掉
  if (!roots.length) return list.map(toNode)

  // 有 intent 无 agent：把内层步骤挂到 intent 之后，避免"步骤凭空消失"
  if (!primary && innerSteps.length) roots.push(...innerSteps.map(toNode))

  return roots
}

/**
 * 标记同名节点，供 UI 消歧。
 *
 * 后端给 `model_call` / `reasoning` 步骤起的名字是**同一串常量**（"模型调用 XxxModel"、
 * "推理轮次"），一条多轮 ReAct 链路会出现多条完全同名的行，肉眼无法区分是哪一轮。
 *
 * 这里按"同一父节点下出现 ≥2 次同名"给后续节点标记 `dupIndex`（第几个同名），
 * 由 UI 显示成 `名称 ·#2`。只标记 2 号及以后：第一个不加后缀，避免把常态也弄脏。
 *
 * ⚠️ 计数表必须**按层级独立**：早期实现用一个共享 Map 并在递归后 `clear()`，
 * 结果同层第二个节点还没来得及读计数就被清空了（实测 dupIndex 恒为 0）。
 * 现在改为每一层新建一张表，递归时各层互不干扰。
 *
 * @param {object[]} nodes 根节点数组
 */
export function markDuplicateNames(nodes) {
  const walk = (list) => {
    const seen = new Map()
    list.forEach((n) => {
      const key = n.name
      const idx = (seen.get(key) || 0) + 1
      seen.set(key, idx)
      n.dupIndex = idx > 1 ? idx : 0
      walk(n.children || [])
    })
  }
  walk(nodes || [])
  return nodes
}

/** 深度优先查找首个失败节点（故障定位用）。 */
export function findFailedNode(nodes) {
  for (const n of nodes || []) {
    if (n.status === 'failed') return n
    const hit = findFailedNode(n.children)
    if (hit) return hit
  }
  return null
}

/** 统计节点总数。 */
export function countNodes(nodes) {
  return (nodes || []).reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

/** 可观测数据源：概览 + 链路列表 + 选中链路详情。 */
export function useObservability() {
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const summary = ref(null)
  const trendDays = ref([])
  const byAgent = ref([])
  const traces = ref([])

  const detailLoading = ref(false)
  const activeTrace = ref(null)
  const activeSteps = ref([])
  const tokenSummary = ref(null)

  /** 拉取概览 + 链路列表。 */
  async function load(days = 7, limit = 40) {
    loading.value = true
    error.value = ''
    try {
      const [dash, list] = await Promise.all([
        fetchDashboard(days).catch(() => null),
        fetchTraces({ limit }).catch(() => null),
      ])
      summary.value = dash?.summary || null
      trendDays.value = dash?.trend?.days || []
      byAgent.value = dash?.byAgent || []
      traces.value = Array.isArray(list) ? list : list?.rows || []
      loaded.value = true
    } catch (e) {
      error.value = e?.message || '读取可观测数据失败'
    } finally {
      loading.value = false
    }
  }

  /** 拉取单条链路详情并选中。 */
  async function selectTrace(trace) {
    if (!trace) return
    activeTrace.value = trace
    detailLoading.value = true
    try {
      const data = await fetchTraceDetail(trace.traceKey)
      activeSteps.value = data?.steps || []
      tokenSummary.value = await fetchTokenSummary(trace.traceKey).catch(() => null)
    } catch (e) {
      activeSteps.value = []
      tokenSummary.value = null
      error.value = e?.message || '读取链路详情失败'
    } finally {
      detailLoading.value = false
    }
  }

  /** 清空选中。 */
  function clearSelection() {
    activeTrace.value = null
    activeSteps.value = []
    tokenSummary.value = null
  }

  /** Span 树（由扁平步骤构建，并标记同名兄弟以消歧）。 */
  const spanTree = computed(() => markDuplicateNames(buildSpanTree(activeSteps.value)))

  /** 当前链路的评估结果。 */
  const evaluation = computed(() =>
    activeTrace.value ? evaluateTrace(activeTrace.value, activeSteps.value) : null,
  )

  /** 当前链路的根因诊断。 */
  const diagnosis = computed(() =>
    activeTrace.value ? diagnoseTrace(activeTrace.value, activeSteps.value) : null,
  )

  /** 首个失败节点（抽屉与拓扑树定位用）。 */
  const failedNode = computed(() => findFailedNode(spanTree.value))

  return {
    loading, error, loaded,
    summary, trendDays, byAgent, traces,
    detailLoading, activeTrace, activeSteps, tokenSummary,
    spanTree, evaluation, diagnosis, failedNode,
    load, selectTrace, clearSelection,
  }
}
