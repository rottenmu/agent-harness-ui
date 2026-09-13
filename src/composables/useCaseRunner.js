/**
 * useCaseRunner —— 用例执行引擎（单步 Step Run + 批量 Run Selected）
 *
 * 职责单一：只管「一次执行如何推进」，不关心用例树、面板 Tab 与配置表单。
 * 运行期状态与定时器由 useRunSession 持有，本 Hook 只负责调度它们。
 *
 * 两种数据源：
 *  - remote：Step Run 调 `POST /api/biz/ai/chat`；批量改为**逐用例**独立批次
 *    （每例一次 POST /test-runs），用例之间与在途请求都可真实停止
 *  - mock  ：定时器模拟三阶段推进，用于后端未启动时演示
 *
 * 术语：
 *  - step：手动发起的一轮 Agent 执行（Step Run）
 *  - run：批量运行所有勾选用例（Run Selected）
 */
import { computed } from 'vue'
import { estimateTokens } from '@/utils/format'
import { withLanguageDirective } from '@/utils/prompt'
import {
  buildPlanMessage, buildSummaryMessage, buildToolCallMessage, buildUserMessage,
} from '@/mock/simulate'
import { useRunSession } from '@/composables/useRunSession'
import { chatWithAgent, fetchTestRunReport, runTestCases } from '@/api/observ'

/** 批量运行单用例的模拟耗时（mock 模式） */
const RUN_TICK_MS = 700
/** 单步执行三个阶段的延时：规划 -> 工具调用 -> 总结（mock 模式） */
const STEP_DELAYS = [500, 1200, 2000]
/**
 * 后端把「模型调用失败」包在 HTTP 200 的 reply 里返回（见 AiChatController 的兜底），
 * 按前缀识别后降级为 Error 卡片，避免把失败文案当成正常回答展示。
 */
const FAILURE_PREFIXES = ['AI 智能体调用失败', '调用异常']

/**
 * @param {object} deps
 * @param {(level: string, text: string) => void} deps.pushLog 写日志
 * @param {import('vue').ComputedRef<object|null>} deps.currentCase 当前用例元数据
 * @param {import('vue').ComputedRef<Map>} deps.caseIndex 用例索引
 * @param {import('vue').Ref<string[]>} deps.selectedCaseIds 勾选用例 ID
 * @param {object} deps.metrics 指标容器（reactive，原地更新）
 * @param {object} deps.agentConfig Agent 配置（reactive，报告导出用）
 * @param {object} [deps.backend] useBackend 实例（判断是否 remote）
 * @param {object} [deps.catalog] useCaseCatalog 实例（回填状态与结果）
 */
export function useCaseRunner(deps) {
  const { pushLog, currentCase, caseIndex, selectedCaseIds, metrics, agentConfig } = deps
  const { backend, catalog } = deps

  const {
    messages, manualPrompt, running, stepCounter, currentGraph,
    isBatch, setBatch, abort, schedule, sessionId, appendMessage, makeMessage, reset,
  } = useRunSession()

  const canStepRun = computed(() => !!currentCase.value && !running.value)

  /* ---------------- mock 执行 ---------------- */

  /** 模拟一步 Agent 执行：LLM 规划 -> 工具调用 -> 总结 */
  function simulateAgentStep(input, step) {
    const t0 = Date.now()
    schedule(STEP_DELAYS[0], () => {
      appendMessage(buildPlanMessage(t0))
      pushLog('info', 'LLM 完成规划，准备调用工具')
    })
    schedule(STEP_DELAYS[1], () => {
      appendMessage(buildToolCallMessage(input))
      pushLog('warn', 'mock_tool_call 返回 2 条候选，低于阈值 0.95 的 1 条已丢弃')
    })
    schedule(STEP_DELAYS[2], () => {
      appendMessage(buildSummaryMessage(t0))
      running.value = false
      pushLog('info', `Step #${step} 执行完成，耗时 ${Date.now() - t0} ms`)
    })
  }

  /* ---------------- 真实执行 ---------------- */

  /** 单步真实调用：POST /api/biz/ai/chat（同步阻塞，最长 180s） */
  async function runRemoteStep(text, step) {
    const meta = currentCase.value
    // 取值优先级：配置面板选定的执行目标优先，其次回落到用例绑定的 agentId
    const agentId = agentConfig.agentId || meta?.agentId || ''
    if (!agentId) {
      appendMessage(makeMessage('Error', `尚未指定执行目标 Agent。请在右侧 Agent Config 中选择，或在观测中心为用例「${meta?.label || meta?.id}」补充 agentId。`))
      pushLog('warn', `Step #${step} 已中止：未指定执行目标 Agent`)
      running.value = false
      return
    }
    const t0 = Date.now()
    try {
      // 出站消息注入语言约束：后端 /chat 无 systemPrompt 入参，
      // persona 为空的智能体会按模型默认语言作答（实测回英文）
      const outbound = withLanguageDirective(text, agentConfig.language)
      const data = await chatWithAgent({ agentId, message: outbound, sessionId: sessionId() })
      const content = data?.reply || '(后端返回空回复)'
      const failed = FAILURE_PREFIXES.some((p) => content.startsWith(p))
      appendMessage(makeMessage(failed ? 'Error' : 'Agent', content, { durationMs: Date.now() - t0 }))
      pushLog(failed ? 'error' : 'info', failed
        ? `Step #${step} 后端返回失败：${content}`
        : `Step #${step} 完成（${data?.agentName || agentId}），耗时 ${Date.now() - t0} ms`)
    } catch (err) {
      appendMessage(makeMessage('Error', `调用后端失败：${err.message}`, { durationMs: Date.now() - t0 }))
      pushLog('error', `Step #${step} 请求失败：${err.message}`)
    } finally {
      running.value = false
    }
  }

  /** 按类别打印通过率，便于在日志里直接看到短板 */
  function logCategories(categories) {
    Object.entries(categories || {}).forEach(([key, value]) => {
      pushLog(value.rate >= 100 ? 'info' : 'warn', `  ${key}：${value.passed}/${value.total}（${value.rate}%）`)
    })
  }

  /**
   * 当前批量在途用例的取消信号（handleStop 触发 abort）。
   * 有了它，「停止」从"只影响本地等待"变成真实生效：在途请求立刻取消，
   * 且循环在用例之间检查 running 标志 —— 剩余用例不会再发出去。
   */
  let batchAbortCtl = null

  /**
   * 批量真实运行：**逐用例执行**（每例一个独立批次 POST /test-runs）。
   *
   * 旧实现把整批塞进一次同步 HTTP，停止按钮只能影响本地等待 —— 后端照跑
   * 完整批，最长 10 分钟无法回退。改为逐例串行后：
   *   · 用例之间检查 running 标志，停止后剩余用例不再发出；
   *   · 在途那一例经 signal 立刻取消，界面马上解锁（后端可能仍会执行完该例
   *     并记录批次，日志里已如实说明）；
   *   · 每例完成后立刻 mergeResults 回填状态，进度实时可见。
   * 代价：批次历史从"一批 N 例"变为"N 个单例批次"（批次名带序号可辨识）。
   */
  async function runRemoteBatch(ids) {
    const batchCtl = new AbortController()
    batchAbortCtl = batchCtl
    const label = `批量评测(逐例) ${new Date().toLocaleString('zh-CN')}`
    const catAgg = new Map()
    let executed = 0
    let passed = 0

    pushLog('info', `逐用例执行 ${ids.length} 例：每例独立批次，随时可真实停止`)
    for (let i = 0; i < ids.length; i += 1) {
      // 停止 / 切用例后 running 已复位：剩余用例不再发出
      if (!running.value) {
        pushLog('warn', `已停止：剩余 ${ids.length - i} 个用例未执行`)
        break
      }
      const id = ids[i]
      const meta = caseIndex.value.get(id)
      pushLog('info', `[${i + 1}/${ids.length}] 运行 ${meta?.label || id} …`)
      try {
        const report = await runTestCases([id], `${label} · ${i + 1}/${ids.length}`, {
          signal: batchCtl.signal,
        })
        executed += 1
        const detail = await fetchTestRunReport(report.runId)
        const result = detail?.results?.[0] || null
        if (result) {
          if (result.passed) passed += 1
          catalog?.mergeResults?.([result])
          const key = result.category || meta?.suiteKey || '未分类'
          const agg = catAgg.get(key) || { passed: 0, total: 0 }
          agg.total += 1
          if (result.passed) agg.passed += 1
          catAgg.set(key, agg)
        }
        pushLog(result?.passed ? 'info' : 'error', `${meta?.label || id} → ${result?.passed ? 'PASS' : 'FAIL'}${result?.error ? `（${result.error}）` : ''}`)
      } catch (err) {
        if (err?.aborted) {
          pushLog('warn', `已停止：用例 ${meta?.label || id} 的请求已中断（后端可能仍会执行完该例并记录）`)
          break
        }
        executed += 1
        // 合成失败结果，保证该例状态可见而不是永远停在 running
        catalog?.mergeResults?.([{
          caseId: id, category: meta?.suiteKey || '', passed: false,
          error: err.message, actual: '', expected: meta?.expected || '', latencyMs: null,
        }])
        pushLog('error', `${meta?.label || id} 执行失败：${err.message}`)
      }
    }

    const categories = {}
    catAgg.forEach((v, key) => {
      categories[key] = { ...v, rate: v.total ? Math.round((v.passed / v.total) * 100) : 0 }
    })
    Object.assign(metrics, { total: executed, passed, failed: Math.max(executed - passed, 0) })
    const rate = executed ? Math.round((passed / executed) * 100) : 0
    pushLog(
      executed < ids.length ? 'warn' : 'info',
      `批量结束：${passed}/${executed} 通过，通过率 ${rate}%${executed < ids.length ? `（共 ${ids.length} 例，未全部执行）` : ''}`,
    )
    logCategories(categories)
    running.value = false
    setBatch(false)
    batchAbortCtl = null
  }

  /** mock 批量：每个用例占一个 tick */
  function runMockBatch(ids) {
    let i = 0
    const tick = () => {
      if (!running.value || i >= ids.length) {
        running.value = false
        setBatch(false)
        pushLog('info', `批量运行结束，共处理 ${i} 个用例`)
        return
      }
      const meta = caseIndex.value.get(ids[i])
      pushLog('info', `[${i + 1}/${ids.length}] 运行 ${meta?.label || ids[i]}`)
      i += 1
      schedule(RUN_TICK_MS, () => {
        const isFail = meta?.status === 'fail'
        pushLog(isFail ? 'error' : 'info', `${meta?.label} → ${isFail ? 'FAIL' : 'PASS'}`)
        updateMetrics()
        tick()
      })
    }
    tick()
  }

  /* ---------------- 对外动作 ---------------- */

  /** 手动 Step Run：先把用户输入落成 User 消息，再驱动执行 */
  function handleStepRun() {
    const text = manualPrompt.value.trim()
    if (!text || !canStepRun.value) return { ok: false, reason: 'empty' }

    messages.value.push(buildUserMessage(text, estimateTokens(text)))
    manualPrompt.value = ''
    const step = ++stepCounter.value
    pushLog('info', `Step #${step} 已提交 Prompt（${text.length} 字符）`)
    running.value = true

    if (backend?.isRemote?.value) runRemoteStep(text, step)
    else simulateAgentStep(text, step)
    return { ok: true, step }
  }

  /** 依据勾选用例的状态分布重算指标 */
  function updateMetrics() {
    const selected = selectedCaseIds.value
    const failed = selected.filter((id) => caseIndex.value.get(id)?.status === 'fail').length
    Object.assign(metrics, { total: selected.length, passed: selected.length - failed, failed })
  }

  /** 批量运行：remote 走真实批次，mock 按勾选顺序串行推进 */
  function handleRunSelected() {
    if (selectedCaseIds.value.length === 0) return { ok: false, reason: 'none-selected' }

    running.value = true
    setBatch(true)
    const ids = [...selectedCaseIds.value]
    pushLog('info', `开始运行 ${ids.length} 个用例…`)
    catalog?.markRunning(ids)

    if (backend?.isRemote?.value) runRemoteBatch(ids)
    else runMockBatch(ids)
    return { ok: true }
  }

  function handleStop() {
    const wasBatch = isBatch()
    // 先取消在途 HTTP（若有），再复位运行标志并清定时器 —— 顺序保证
    // 「在途例被中断」的日志先于「已停止」输出，语义与时间线一致
    batchAbortCtl?.abort()
    abort()
    pushLog('warn', wasBatch ? '用户手动停止批量评测（剩余用例不再发出）' : '用户手动停止当前执行')
    return { wasBatch }
  }

  /** 组装报告对象（导出与日志共用同一口径） */
  function buildReport(caseDrafts) {
    let passed = 0
    let failed = 0
    const cases = selectedCaseIds.value.map((id) => {
      const meta = caseIndex.value.get(id)
      const status = meta?.status || 'idle'
      if (status === 'fail') failed += 1
      else if (status === 'pass') passed += 1
      return { id, name: meta?.label, suite: meta?.suiteLabel, status }
    })
    return {
      generatedAt: new Date().toISOString(),
      dataSource: backend?.mode?.value || 'remote',
      agentConfig: { ...agentConfig },
      caseDrafts: JSON.parse(JSON.stringify(caseDrafts || {})),
      metrics: { passed, failed, total: cases.length },
      passRate: `${cases.length ? Math.round((passed / cases.length) * 100) : 0}%`,
      cases,
    }
  }

  return {
    messages, manualPrompt, running, stepCounter, currentGraph, canStepRun,
    abortRunning: abort, prepareCase: reset,
    handleStepRun, handleRunSelected, handleStop, updateMetrics, buildReport,
  }
}
