/**
 * useCaseCatalog —— 评测用例目录与 Agent / 模型选项
 *
 * 从 useWorkbench 拆出，只负责「目录数据从哪来」：
 *  - remote：观测中心 /test-cases + 最近一次批次的 /test-runs/{id}/report
 *  - mock  ：内置 MOCK_CASE_RECORDS
 *
 * 用例状态（pass/fail）不在用例表里，而是由最近一次批次的逐条结果回填，
 * 因此这里额外维护 latestResults，供消息面板展示「评测结论」。
 */
import { computed, ref } from 'vue'
import { buildTreeData, indexCases, toCaseRecord, toStatusMap } from '@/api/adapters'
import { fetchAgents, fetchModelConfigs, fetchTestCases, fetchTestRunReport, fetchTestRuns } from '@/api/observ'
import { AGENT_TYPE_OPTIONS, MODEL_OPTIONS } from '@/mock/config'
import { MOCK_CASE_RECORDS } from '@/mock/cases'

export function useCaseCatalog() {
  const cases = ref([])
  const latestResults = ref(new Map())
  const agentOptions = ref([])
  const agentTypeOptions = ref(AGENT_TYPE_OPTIONS)
  const modelOptions = ref(MODEL_OPTIONS)
  /** 最近一次批次信息（用于日志与状态说明） */
  const latestRun = ref(null)

  const treeData = computed(() => buildTreeData(cases.value))
  const caseIndex = computed(() => indexCases(cases.value))
  const totalCaseCount = computed(() => cases.value.length)
  const allCaseIds = computed(() => cases.value.map((c) => c.id))
  const firstCaseId = computed(() => allCaseIds.value[0] || '')

  /** 用例元信息（含套件、输入、绑定的 agentId） */
  function metaOf(caseId) {
    return caseIndex.value.get(caseId) || null
  }

  /** 该用例最近一次评测结果（可能不存在） */
  function resultOf(caseId) {
    return latestResults.value.get(caseId) || null
  }

  /** 用例集合状态就地更新（running 用于发起批量运行后的即时反馈） */
  function patchStatus(predicate, status) {
    cases.value = cases.value.map((c) => (predicate(c) ? { ...c, status } : c))
  }

  function markRunning(ids) {
    const set = new Set((ids || []).map(String))
    patchStatus((c) => set.has(c.id), 'running')
  }

  /** 应用批次结果：同时刷新用例状态与结果明细 */
  function applyResults(results) {
    const map = new Map()
    ;(results || []).forEach((r) => {
      if (r?.caseId != null) map.set(String(r.caseId), r)
    })
    latestResults.value = map
    const statusMap = toStatusMap(results)
    cases.value = cases.value.map((c) => (statusMap[c.id] ? { ...c, status: statusMap[c.id] } : c))
  }

  /**
   * 增量合并结果（逐用例回填用）。
   *
   * 与 applyResults 的"整批替换"不同：逐例执行模式每完成一例就回填一次，
   * 若用替换语义会把上一例的结果冲掉。合并以 caseId 为键，新结果覆盖旧结果。
   */
  function mergeResults(results) {
    const map = new Map(latestResults.value)
    ;(results || []).forEach((r) => {
      if (r?.caseId != null) map.set(String(r.caseId), r)
    })
    latestResults.value = map
    const statusMap = toStatusMap(results)
    cases.value = cases.value.map((c) => (statusMap[c.id] ? { ...c, status: statusMap[c.id] } : c))
  }

  /* ---------------- 数据源 ---------------- */

  /** 载入内置 mock 用例（深拷贝，避免运行时改写源数据） */
  function loadMock() {
    cases.value = MOCK_CASE_RECORDS.map((r) => ({ ...r }))
    latestResults.value = new Map()
    latestRun.value = null
  }

  /** 拉取最近一次批次，回填用例状态 */
  async function loadLatestRun() {
    const runs = await fetchTestRuns(1)
    const run = runs?.[0]
    if (!run) return null
    latestRun.value = run
    const report = await fetchTestRunReport(run.id)
    applyResults(report?.results)
    return run
  }

  /**
   * 用已装配的智能体与模型配置刷新下拉选项。
   *
   * agentOptions 的每项额外带上 agentType / model：选中某 Agent 时要把它真实的
   * 类型与模型回填到配置面板，否则面板会一直显示与执行目标无关的默认值。
   */
  async function loadAgentOptions() {
    const [agents, models] = await Promise.all([fetchAgents(), fetchModelConfigs()])
    agentOptions.value = (agents || []).map((a) => ({
      label: `${a.name}（${a.agentType}）`,
      value: a.id,
      agentType: a.agentType || '',
      model: a.model || '',
    }))
    const types = [...new Set((agents || []).map((a) => a.agentType).filter(Boolean))]
    if (types.length) agentTypeOptions.value = types.map((v) => ({ label: v, value: v }))
    const list = (models || []).map((m) => ({
      label: `${m.configName}（${m.modelId}）`,
      value: m.modelId,
    }))
    if (list.length) modelOptions.value = list
  }

  /** 从后端加载完整目录（任一步失败向上抛出，由调用方决定降级） */
  async function loadFromRemote() {
    const dtos = await fetchTestCases()
    cases.value = (dtos || []).map(toCaseRecord)
    await loadLatestRun()
    await loadAgentOptions()
    return cases.value.length
  }

  return {
    cases, latestResults, latestRun, agentOptions, agentTypeOptions, modelOptions,
    treeData, caseIndex, totalCaseCount, allCaseIds, firstCaseId,
    metaOf, resultOf, markRunning, applyResults, mergeResults,
    loadMock, loadFromRemote, loadLatestRun,
  }
}
