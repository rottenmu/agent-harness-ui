/**
 * useWorkbench —— 评测工作台的门面 Hook
 *
 * 只负责「面板 / 选中项 / 日志指标 / Agent 配置」这四块状态，并对外暴露单一入口：
 *  - 目录数据委托给 useCaseCatalog（remote / mock 两种来源）
 *  - 执行推进委托给 useCaseRunner
 *
 * 这样组件侧 (HarnessWorkbench.vue) 只需 `const { ... } = useWorkbench(backend)`，
 * 无需关心状态被拆到了几个文件里。
 */
import { computed, reactive, ref } from 'vue'
import { DEFAULT_AGENT_CONFIG } from '@/mock/config'
import { DEFAULT_GRAPH, getGraph, getTrace } from '@/mock/traces'
import { toGraph, toMessages, toResultMessage } from '@/api/adapters'
import { fetchTraceDetail, fetchTraces } from '@/api/observ'
import { useCaseCatalog } from '@/composables/useCaseCatalog'
import { useCaseDrafts } from '@/composables/useCaseDrafts'
import { useCaseRunner } from '@/composables/useCaseRunner'

/** 日志最多保留条数，防长时间运行内存膨胀 */
const LOG_LIMIT = 300

/**
 * @param {object} backend useBackend() 实例（由组件创建后注入，保证全局唯一）
 */
export function useWorkbench(backend) {
  /* ---------------- 面板 Tab ---------------- */
  const centerTab = ref('trace')
  const rightTab = ref('agentConfig')
  const bottomTab = ref('log')

  /* ---------------- 选中项 ---------------- */
  const caseSearch = ref('')
  const currentCaseId = ref('')
  const selectedCaseIds = ref([])

  /* ---------------- 日志 / 指标 / 配置 ---------------- */
  const logs = ref([])
  const metrics = reactive({ passed: 0, failed: 0, total: 0 })
  const agentConfig = reactive({ ...DEFAULT_AGENT_CONFIG })

  const catalog = useCaseCatalog()
  const drafts = useCaseDrafts()

  const currentCase = computed(() => catalog.metaOf(currentCaseId.value))
  const allSelected = computed(
    () => catalog.totalCaseCount.value > 0 && selectedCaseIds.value.length === catalog.totalCaseCount.value,
  )
  const partiallySelected = computed(() => selectedCaseIds.value.length > 0 && !allSelected.value)
  const passRate = computed(() => {
    if (!metrics.total) return 0
    return Math.round((metrics.passed / metrics.total) * 100)
  })

  /** 执行引擎：注入状态、目录与数据源 */
  const runner = useCaseRunner({
    pushLog: (level, text) => pushLog(level, text),
    currentCase,
    caseIndex: catalog.caseIndex,
    selectedCaseIds,
    metrics,
    agentConfig,
    backend,
    catalog,
  })

  /* ---------------- 日志 ---------------- */
  function pushLog(level, text) {
    logs.value.push({ level, text, ts: Date.now() })
    if (logs.value.length > LOG_LIMIT) logs.value.splice(0, logs.value.length - LOG_LIMIT)
  }

  /**
   * 设定执行目标 Agent，并把它真实的类型/模型回填到配置面板。
   *
   * 语义：Step Run 的落点是 agentConfig.agentId（见 useCaseRunner 的取值优先级），
   * 用例自带的 agentId 只是「作者的推荐目标」——加载用例时自动切过去，
   * 用户仍可在面板里改选，改选后即生效。
   */
  function selectAgent(agentId, { silent = false } = {}) {
    const opt = catalog.agentOptions.value.find((o) => o.value === agentId)
    agentConfig.agentId = agentId || ''
    if (opt?.agentType) agentConfig.agentType = opt.agentType
    if (opt?.model) agentConfig.model = opt.model
    if (!silent) pushLog('info', `执行目标 Agent：${opt?.label || agentId || '未选择'}`)
  }

  /* ---------------- 选中项交互 ---------------- */
  /** NaiveUI cascade 模式会回传父套件 key，只保留叶子用例 */
  function handleCheckedKeys(keys) {
    selectedCaseIds.value = (keys || []).filter((k) => catalog.caseIndex.value.has(k))
  }

  function toggleSelectAll(checked) {
    selectedCaseIds.value = checked ? [...catalog.allCaseIds.value] : []
  }

  /* ---------------- 用例加载 ---------------- */

  /** 取该用例所绑定智能体的最近一条执行链路（用例未绑 agentId 时返回 null） */
  async function resolveTraceDetail(meta) {
    if (!meta?.agentId) return null
    const list = await fetchTraces({ agentId: meta.agentId, limit: 1 })
    const hit = list?.[0]
    if (!hit) return null
    return fetchTraceDetail(hit.id)
  }

  /** 后端还没有该用例的执行记录时，用用例自身的输入/期望构造一份可读的占位轨迹 */
  function placeholderMessages(meta) {
    const now = Date.now()
    const messages = []
    if (meta.input) {
      messages.push({ id: `${meta.id}-u`, type: 'User', content: meta.input, timestamp: now, tokens: null, durationMs: null })
    }
    messages.push({
      id: `${meta.id}-tip`,
      type: 'Agent',
      content: meta.expected
        ? `该用例在后端尚无执行记录。期望结果：${meta.expected}`
        : '该用例在后端尚无执行记录，可点击 Step Run 发起一次真实调用。',
      timestamp: now,
      tokens: null,
      durationMs: null,
    })
    return messages
  }

  /** 加载用例：remote 拉真实执行链路 + 评测结论，mock 用内置轨迹 */
  async function loadCase(caseId) {
    const meta = catalog.metaOf(caseId)
    if (!meta) return
    currentCaseId.value = caseId
    pushLog('info', `加载用例：${meta.path}`)
    drafts.seedFromCase(meta)
    // 用例绑定的 agentId 视为作者推荐目标，加载时对齐执行目标（用户仍可改选）
    if (meta.agentId && meta.agentId !== agentConfig.agentId) selectAgent(meta.agentId)

    if (!backend.isRemote.value) {
      // 内置轨迹只覆盖部分用例，缺失时退化成「用例输入 + 说明」，避免对话面板空白
      const mockTrace = getTrace(caseId)
      runner.prepareCase(mockTrace.length ? mockTrace : placeholderMessages(meta), getGraph(caseId))
      return
    }
    try {
      const detail = await resolveTraceDetail(meta)
      const trace = detail?.trace || null
      const steps = detail?.steps || []
      const history = trace ? toMessages(trace, steps) : placeholderMessages(meta)
      const conclusion = toResultMessage(catalog.resultOf(caseId))
      if (conclusion) history.push(conclusion)
      runner.prepareCase(history, trace ? toGraph(trace, steps) : DEFAULT_GRAPH)
      pushLog('info', trace
        ? `已加载链路 ${trace.traceKey}（${steps.length} 步）`
        : '该用例暂无执行链路，已展示用例输入')
    } catch (err) {
      pushLog('warn', `执行链路加载失败：${err.message}`)
      runner.prepareCase(placeholderMessages(meta), DEFAULT_GRAPH)
    }
  }

  /* ---------------- 初始化 ---------------- */

  /** 连接后端并加载目录，返回初始用例 ID（供调用方同步编辑器内容） */
  async function bootstrap() {
    pushLog('info', 'Agent Harness 工作台启动中…')
    const conn = await backend.connect()
    if (conn.ok) {
      try {
        const count = await catalog.loadFromRemote()
        pushLog('info', `已从后端加载 ${count} 个评测用例（agent-application :9900）`)
      } catch (err) {
        backend.useMockData(`用例加载失败：${err.message}`)
        pushLog('warn', `用例加载失败，已降级为内置 mock：${err.message}`)
      }
    } else {
      pushLog('warn', `后端不可用（${conn.error}），已降级为内置 mock 数据`)
    }
    if (!backend.isRemote.value) {
      catalog.loadMock()
      pushLog('info', `已加载 ${catalog.totalCaseCount.value} 个内置 mock 用例`)
    }

    // 未指定执行目标时默认取第一个已装配 Agent，让 Step Run 开箱即可用
    if (catalog.agentOptions.value.length && !agentConfig.agentId) {
      selectAgent(catalog.agentOptions.value[0].value, { silent: true })
      pushLog('info', `默认执行目标：${catalog.agentOptions.value[0].label}`)
    }

    const keep = catalog.metaOf(currentCaseId.value) ? currentCaseId.value : catalog.firstCaseId.value
    currentCaseId.value = keep
    selectedCaseIds.value = keep ? [keep] : []
    await loadCase(keep)
    runner.updateMetrics()
    return keep
  }

  return {
    // tab
    centerTab, rightTab, bottomTab,
    // 选中项
    caseSearch, selectedCaseIds, currentCaseId, currentCase,
    totalCaseCount: catalog.totalCaseCount, treeData: catalog.treeData,
    allSelected, partiallySelected,
    handleCheckedKeys, toggleSelectAll, loadCase,
    // 日志 / 指标 / 配置
    logs, metrics, passRate,
    agentConfig, agentOptions: catalog.agentOptions,
    agentTypeOptions: catalog.agentTypeOptions, modelOptions: catalog.modelOptions,
    latestRun: catalog.latestRun,
    pushLog, selectAgent,
    // 草稿
    getDraft: drafts.getDraft, saveDraft: drafts.saveDraft, snapshot: drafts.snapshot,
    // 执行引擎（展开后与拆分前保持同一套对外名称）
    ...runner,
    bootstrap,
  }
}
