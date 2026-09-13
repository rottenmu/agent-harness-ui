/**
 * useRunSession —— 一次评测运行的会话状态与定时器
 *
 * 从 useCaseRunner 拆出，只回答「运行期持有哪些状态」，不关心「执行如何推进」：
 * 消息列表、输入框、运行标志、步骤计数、执行流图，以及可被中断的定时器。
 *
 * 定时器集中在此处的原因：Stop 与切换用例都必须能一次性中断全部待执行回调。
 * 若让每条执行路径各自持有定时器，很容易漏清 —— 泄漏的回调会在切用例之后
 * 继续往新会话里追加消息，表现为「切到别的用例还在自己跳字」。
 */
import { ref } from 'vue'
import { DEFAULT_GRAPH } from '@/mock/traces'

/** sessionStorage 键名：同一浏览器标签页内稳定复用同一个后端会话 */
const SESSION_KEY = 'harness.sessionId'

export function useRunSession() {
  const messages = ref([])
  const manualPrompt = ref('')
  const running = ref(false)
  const stepCounter = ref(0)
  const currentGraph = ref(DEFAULT_GRAPH)

  /** 所有待执行的定时器（Stop / 切用例时统一中断） */
  let timers = []
  /** 是否处于批量运行模式（用于区分 Stop 的语义） */
  let batchRunning = false

  /** 当前是否批量运行中 */
  function isBatch() {
    return batchRunning
  }

  /** 标记进入 / 退出批量运行 */
  function setBatch(value) {
    batchRunning = value
  }

  /**
   * 中断本地推进。批量评测已改为逐用例执行：在途用例的 HTTP 由
   * useCaseRunner 经 AbortController 真实取消；这里只负责复位标志与清定时器。
   */
  function abort() {
    running.value = false
    timers.forEach(clearTimeout)
    timers = []
    batchRunning = false
  }

  /** 登记一个可被中断的定时器：运行标志已复位时不再触发回调 */
  function schedule(delay, fn) {
    const id = setTimeout(() => {
      if (!running.value) return
      fn()
    }, delay)
    timers.push(id)
    return id
  }

  /** 同一浏览器会话稳定复用，便于后端按 sessionId 保留多轮记忆 */
  function sessionId() {
    let value = sessionStorage.getItem(SESSION_KEY)
    if (!value) {
      value = `harness-ui-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(SESSION_KEY, value)
    }
    return value
  }

  /** 追加一条已构造好的消息 */
  function appendMessage(message) {
    messages.value.push(message)
  }

  /** 构造一条消息（id / 时间戳 / 指标字段统一在此生成） */
  function makeMessage(type, content, extra = {}) {
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      timestamp: Date.now(),
      tokens: null,
      durationMs: null,
      ...extra,
    }
  }

  /** 切换用例：中断在途执行并重置会话（历史消息与流程图由调用方提供） */
  function reset(history, graph) {
    abort()
    messages.value = history || []
    stepCounter.value = messages.value.filter((m) => m.type === 'User').length
    manualPrompt.value = ''
    currentGraph.value = graph || DEFAULT_GRAPH
  }

  return {
    messages, manualPrompt, running, stepCounter, currentGraph,
    isBatch, setBatch, abort, schedule, sessionId, appendMessage, makeMessage, reset,
  }
}
