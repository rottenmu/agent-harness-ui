/**
 * usePiSession —— 运行时控制台的会话状态机（实现层）
 *
 * 与 `api/sessionDriver.js`（契约层）配套：
 *   · 契约层定义「有哪 6 个动作、8 个事件、3 个状态」；
 *   · 本文件是它的 UI 侧状态机：driver 为 null 时跑本地模拟；注入
 *     `setDriver(createHttpSessionDriver())`（api/sessionDriverHttp.js）后
 *     走真实后端 /chat，事件映射见 onDriverEvent。
 *
 * ---------------------------------------------------------------------------
 * 四条不可简化之处（每一条都对应参照项目 pi-gui 的一个真实教训）
 * ---------------------------------------------------------------------------
 *
 * 1. 状态**不落库**，只在渲染时推导。
 *    会话记录里只有 `runningRunId` / `lastError` 两个原始事实，
 *    `status` 一律走 `sessionVisibility.deriveStatus()`。
 *    因此「现在有没有在跑」这个问题在全工程只有一处答案。
 *
 * 2. 「排队」与「插话」是两种语义，不是一个发送按钮的两种写法。
 *      followUp —— 进 `queuedMessages`，等本轮结束后作为新一轮发出；
 *      steer    —— 直接并入**当前这一轮**运行。
 *    把两者合并，运行中发消息的语义就是未定义的。
 *
 * 3. 每次运行持有一个 `runToken`。定时器链在任何一步都可能被取消
 *    （用户 Stop / 切走组件 / 组件卸载），只靠 `clearTimeout` 不够 ——
 *    回调里必须再比对 token，否则「已取消的运行」还会继续往时间线里塞消息。
 *
 * 4. 定时器统一登记在 `timers` 里，`dispose()` 一次性清空。
 *    组件 `onBeforeUnmount` 必须调它 —— 否则切到评测工作台表面后，
 *    看不见的运行仍在后台推进状态，回来时时间线已经"自己长长了"。
 */
import { computed, ref } from 'vue'
import { checkDriverShape, DeliverAs, SessionEvent, SessionStatus } from '@/api/sessionDriver'
import { SESSION_SEED } from '@/mock/sessions'
import { estimateTokens } from '@/utils/format'
import { fetchAgents } from '@/api/observ'
import {
  deriveLastError,
  deriveStatus,
  deriveStatusTone,
  groupByWorkspace,
  hasUnseenUpdate,
  isRunning,
  sortSessions,
} from '@/composables/sessionVisibility'
// 依赖方向是单向的本文件 → useWorkspace（见 useWorkspace 文件头）。
// 反向依赖会成环：工作区那边的「移除」若还要看会话，就变成一件有副作用的事。
import { useWorkspace } from '@/composables/useWorkspace'

/** 日志区硬上限：与既有 LogPanel 的容量保持一致，避免无界增长 */
const LOG_LIMIT = 400

/** 单次运行推进的步数上限 = 步骤模板的最大长度（工具全启用时） */
const RUN_STEPS = 6

/** 单步间隔（毫秒） */
const STEP_INTERVAL = 620

let uidSeq = 0
function uid(prefix) {
  uidSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${uidSeq}`
}

/** 深拷贝种子：mock 一旦被就地改写，切表面回来就不再是原始数据 */
function cloneSeed() {
  return SESSION_SEED.map((s) => ({
    ...s,
    queuedMessages: [],
    items: s.items.map((it) => ({ ...it })),
    artifacts: s.artifacts.map((a) => ({ ...a })),
    diff: s.diff.map((d) => ({ ...d })),
    stats: { ...s.stats },
  }))
}

/**
 * 会话状态机的**单例**入口。
 *
 * 为什么是单例而不是每次调用新建一份：
 * 侧栏（会话列表）与控制台（时间线 / composer）都要读同一份会话状态，
 * 各自 `usePiSession()` 一次就会产生两台互不知情的状态机 —— 现象是
 * 「控制台里发了一条消息，侧栏的预览和未读点没反应」，而且**两边都不报错**。
 * 这正是本文件开头第 1 条注释所警告的「同一事实两处副本」。
 *
 * 本应用只有一个运行时控制台，单例是诚实的建模；组件卸载时不要调 `dispose()`
 * （那只应由应用外壳在真正退出时调用），否则切一次表面就会把在途运行掐掉。
 */
let singleton = null

export function usePiSession() {
  if (!singleton) singleton = createPiSession()
  return singleton
}

function createPiSession() {
  const sessions = ref(cloneSeed())
  /** 当前正在**查看**的会话 id。它同时是「未读点抑制」的唯一依据。 */
  const viewedSessionId = ref(sessions.value[0]?.id || null)

  /**
   * 当前工作区（应用级上下文，与顶栏选择器读的是同一份）。
   * 本文件只**读**它（新建会话的归属），不写 —— 改写入口只有 WorkspacePicker
   * 与设置面板。若这里也去改，就会出现两处都能改、谁最终生效看调用顺序的问题。
   */
  const { activeWorkspaceName } = useWorkspace()

  /** 下一次发送采用的投递语义（composer 上的切换项） */
  const deliverAs = ref(DeliverAs.FOLLOW_UP)

  /** 当前选中的模型与思考级别（composer 底部提示行展示） */
  const model = ref('deepseek-chat')
  const thinking = ref('medium')

  /** 启用的工具集 */
  const enabledTools = ref(['read_file', 'grep', 'write_file', 'exec_shell'])

  const logs = ref([])
  const query = ref('')

  /** 运行中的定时器登记表（dispose 时统一清空） */
  let timers = []
  /** 当前运行的令牌；取消后自增，使旧回调全部失效 */
  let runToken = 0

  /* ---------------- 传输驱动（api/sessionDriver.js 契约） ---------------- */

  /**
   * 当前驱动：null = 本地模拟（定时器推进）；非 null = 契约实现（如
   * createHttpSessionDriver 的 /chat 通道）。由外壳/控制台在后端连通时注入。
   */
  let driver = null
  /** 驱动事件的退订函数（换驱动 / 清驱动时先退订旧实例） */
  let unsubscribeDriver = null

  /** 运行时控制台的执行目标 Agent（/chat 必填；模拟驱动下仅作展示） */
  const runtimeAgentId = ref('')
  const agentOptions = ref([])

  /**
   * 注入 / 更换驱动。契约校验在创建时就失败（checkDriverShape 尽早失败），
   * 少一个方法当场报出来，而不是等某个面板静默不刷新。
   */
  function setDriver(next) {
    if (next === driver) return
    if (next) {
      const shape = checkDriverShape(next)
      if (!shape.ok) {
        throw new Error(`sessionDriver 实现缺少契约方法：${shape.missing.join(', ')}`)
      }
    }
    if (unsubscribeDriver) {
      unsubscribeDriver()
      unsubscribeDriver = null
    }
    driver = next
    if (driver) unsubscribeDriver = driver.subscribe(onDriverEvent)
    pushLog('info', driver ? '运行时已切换到真实后端驱动（/chat 同步通道）' : '运行时已切回本地模拟驱动')
  }

  /** 拉取执行目标 Agent 选项（驱动激活后由控制台调用；失败不阻断模拟使用） */
  async function loadRuntimeAgentOptions() {
    try {
      const agents = await fetchAgents()
      agentOptions.value = (agents || []).map((a) => ({
        label: `${a.name}（${a.agentType || '未知类型'}）`,
        value: a.id,
      }))
      if (!runtimeAgentId.value && agentOptions.value.length) {
        runtimeAgentId.value = agentOptions.value[0].value
      }
    } catch (err) {
      pushLog('warn', `拉取 Agent 选项失败：${err?.message || err}`)
    }
  }

  function setRuntimeAgent(id) {
    runtimeAgentId.value = id || ''
    driver?.configure?.({ agentId: runtimeAgentId.value })
  }

  /**
   * 驱动事件 → 时间线项的唯一映射。
   *
   * 收尾只认 `runningRunId`（置 null 即不再在跑）：令牌取消与切会话都会先把
   * 它清空，迟到的驱动事件在这里被自然丢弃 —— 与 mock 路径的 runToken 同一防线。
   */
  function onDriverEvent(event) {
    const s = byId(event?.sessionId)
    if (!s || !s.runningRunId) return
    switch (event.type) {
      case SessionEvent.ASSISTANT_DELTA: {
        const tokens = estimateTokens(event.text || '')
        s.items.push({
          id: uid('item'),
          kind: 'assistant',
          ts: Date.now(),
          text: event.text,
          tokens,
          durationMs: event.durationMs ?? null,
          cached: false,
        })
        s.stats.totalTokens += tokens
        s.stats.rounds += 1
        s.updatedAt = Date.now()
        pushLog('info', `assistant 已回复（${tokens} tokens）`)
        break
      }
      case SessionEvent.TOOL_STARTED: {
        // 同步 /chat 不会发出；为 SSE 升级预留的映射（占位行，完成事件可更新它）
        s.items.push({
          id: uid('item'),
          kind: 'tool',
          ts: Date.now(),
          name: event.name || 'tool',
          args: event.args ?? null,
          result: null,
          status: 'running',
          highRisk: false,
        })
        s.updatedAt = Date.now()
        break
      }
      case SessionEvent.TOOL_FINISHED: {
        const item = [...s.items].reverse().find((it) => it.kind === 'tool' && it.status === 'running')
        if (item) {
          item.result = event.result ?? null
          item.status = event.ok === false ? 'fail' : 'ok'
        }
        s.updatedAt = Date.now()
        break
      }
      case SessionEvent.RUN_FAILED:
        s.lastError = event.error || '运行失败'
        finishDriverRun(s)
        break
      case SessionEvent.RUN_COMPLETED:
        finishDriverRun(s, { summary: event.summary })
        break
      default:
        break
    }
  }

  /**
   * 驱动路径的运行收尾：清 runningRunId → 结论卡 → 队列转后续轮次。
   *
   * 队列**逐条**出列（每条各起一轮真实 /chat），与 mock 路径"全部并入一轮"
   * 不同 —— 模拟步骤可以合并展示，真实调用每条用户消息必须各自执行。
   */
  function finishDriverRun(session, opts = {}) {
    if (!session.runningRunId) return // 已被取消 / 切走
    session.runningRunId = null
    session.updatedAt = Date.now()
    session.items.push({
      id: uid('item'),
      kind: 'summary',
      ts: Date.now(),
      eyebrow: '本轮结论',
      text: opts.summary
        || (session.lastError ? `运行以失败结束：${session.lastError}` : '本轮已完成。'),
    })
    const next = session.queuedMessages.shift()
    if (next) {
      if (!next.alreadyShown) {
        session.items.push({
          id: uid('item'), kind: 'user', ts: next.queuedAt, text: next.text,
          deliverAs: next.deliverAs || DeliverAs.FOLLOW_UP,
        })
      }
      pushLog('info', `队列消息转为新一轮：${next.text.slice(0, 40)}`)
      timers.push(setTimeout(() => startRun(), 160))
    }
    session.unseen = false
  }

  /** 驱动路径的运行主体：把"最近一条用户消息"交给驱动，事件映射由 onDriverEvent 负责 */
  function startRunViaDriver(session) {
    const lastUser = [...session.items].reverse().find((it) => it.kind === 'user')
    const text = lastUser?.text?.trim() || ''
    if (!text) {
      // Start 按钮无输入也可点：真实驱动下没有可发送的内容，诚实收场而非空转
      pushLog('warn', '本次运行没有用户输入，未调用后端')
      finishDriverRun(session, { summary: '本次运行没有用户输入，未调用后端。在输入框输入内容后发送即可开始。' })
      return
    }
    const agentId = runtimeAgentId.value
    if (!agentId) {
      session.lastError = '未选择执行 Agent：请在顶栏选择后重试'
      pushLog('error', session.lastError)
      finishDriverRun(session)
      return
    }
    driver
      .sendUserMessage({ sessionId: session.id, text, agentId })
      .catch((err) => pushLog('error', `驱动调用异常：${err?.message || err}`)) // 事件路径已处理失败，这里只兜底 unhandled rejection
  }

  function pushLog(level, text) {
    logs.value.push({ id: uid('log'), level, text, ts: Date.now() })
    if (logs.value.length > LOG_LIMIT) logs.value.splice(0, logs.value.length - LOG_LIMIT)
  }

  function byId(id) {
    return sessions.value.find((s) => s.id === id) || null
  }

  /** 当前会话（唯一的活动记录引用） */
  const currentSession = computed(() => byId(viewedSessionId.value))

  /* ---------------- 派生事实：全部走 sessionVisibility，不在此另立判断 ---------------- */

  const status = computed(() => deriveStatus(currentSession.value))
  const statusTone = computed(() => deriveStatusTone(currentSession.value))
  const lastError = computed(() => deriveLastError(currentSession.value))
  const runningRunId = computed(() => currentSession.value?.runningRunId || null)
  const isCurrentRunning = computed(() => isRunning(currentSession.value))

  /** 时间线项（就地引用，虚拟列表按 id 作 key） */
  const items = computed(() => currentSession.value?.items || [])
  const artifacts = computed(() => currentSession.value?.artifacts || [])
  const diffFiles = computed(() => currentSession.value?.diff || [])
  const stats = computed(
    () => currentSession.value?.stats || { totalTokens: 0, cachedTokens: 0, rounds: 0, windowTotal: 128000 },
  )
  const queuedMessages = computed(() => currentSession.value?.queuedMessages || [])

  /** 上下文统计派生值：命中率在唯一一处计算，避免各面板各算一遍 */
  const contextStats = computed(() => {
    const s = stats.value
    const rate = s.totalTokens > 0 ? s.cachedTokens / s.totalTokens : 0
    return {
      totalTokens: s.totalTokens,
      cachedTokens: s.cachedTokens,
      rounds: s.rounds,
      windowTotal: s.windowTotal,
      cacheHitRate: rate,
      usage: s.windowTotal > 0 ? s.totalTokens / s.windowTotal : 0,
    }
  })

  /** 侧栏分组：先排序再分组，两步都是纯函数 */
  const sidebarGroups = computed(() => {
    const kw = query.value.trim().toLowerCase()
    const filtered = kw
      ? sessions.value.filter(
          (s) =>
            s.title.toLowerCase().includes(kw) ||
            (s.preview || '').toLowerCase().includes(kw) ||
            s.workspace.toLowerCase().includes(kw),
        )
      : sessions.value
    return groupByWorkspace(sortSessions(filtered)).map((g) => ({
      ...g,
      sessions: g.sessions.map((s) => ({
        ...s,
        // 未读点与状态色都从这里推导 —— 侧栏只消费结果，不自己判断
        showUnseen: hasUnseenUpdate(s, viewedSessionId.value),
        statusTone: deriveStatusTone(s),
      })),
    }))
  })

  const sessionCount = computed(() => sessions.value.length)
  const filteredCount = computed(() =>
    sidebarGroups.value.reduce((n, g) => n + g.sessions.length, 0),
  )

  /* ---------------- 动作 ---------------- */

  /** 选中会话：同时把「被查看」这件事落到唯一来源上，未读点随之自动消失 */
  function selectSession(id) {
    const s = byId(id)
    if (!s) return
    viewedSessionId.value = id
    s.unseen = false
  }

  /** 新建会话：只有一条欢迎项，状态自然是 idle */
  function createSession() {
    const id = uid('sess')
    const now = Date.now()
    // 归属 = 顶栏当前选中的工作区；它为空（清单被清空等异常态）时才退回已有会话的工作区
    const workspace = activeWorkspaceName.value || sessions.value[0]?.workspace || 'agent_runner'
    sessions.value.unshift({
      id,
      title: '未命名会话',
      preview: '新会话尚未产生任何运行记录',
      workspace,
      runningRunId: null,
      queuedMessages: [],
      unseen: false,
      lastError: null,
      pinned: false,
      updatedAt: now,
      group: 'today',
      items: [
        {
          id: uid('item'),
          kind: 'user',
          ts: now,
          text: '（新会话）在下方输入 Prompt 后按 Enter 开始，或点击工具栏 Start 直接运行。',
          deliverAs: DeliverAs.FOLLOW_UP,
        },
      ],
      artifacts: [],
      diff: [],
      stats: { totalTokens: 0, cachedTokens: 0, rounds: 0, windowTotal: 128000 },
    })
    selectSession(id)
    pushLog('info', `已创建会话 ${id}`)
    return id
  }

  function togglePin(id) {
    const s = byId(id)
    if (!s) return
    s.pinned = !s.pinned
    pushLog('info', `${s.pinned ? '已置顶' : '已取消置顶'}：${s.title}`)
  }

  function archiveSession(id) {
    // 归档 = 从侧栏列表移除但记录保留；当前查看的会话被归档时自动切到第一条
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx < 0) return
    const [removed] = sessions.value.splice(idx, 1)
    pushLog('warn', `已归档会话：${removed.title}`)
    if (viewedSessionId.value === id) {
      cancelCurrentRun()
      viewedSessionId.value = sessions.value[0]?.id || null
    }
  }

  /** 清空当前会话的时间线（只清前端视图，不动会话记录本身） */
  function clearTrace() {
    const s = currentSession.value
    if (!s) return
    cancelCurrentRun()
    s.items = []
    s.stats = { totalTokens: 0, cachedTokens: 0, rounds: 0, windowTotal: 128000 }
    pushLog('warn', '已清空当前会话轨迹（仅前端视图）')
  }

  /** 取消当前运行：令牌自增 → 所有在途回调失效；真实驱动下同时取消在途请求 */
  function cancelCurrentRun() {
    runToken += 1
    driver?.cancelCurrentRun?.()
    timers.forEach(clearTimeout)
    timers = []
    const s = currentSession.value
    if (s) s.runningRunId = null
  }

  /**
   * 把一条用户消息并入当前运行（steer 语义）。
   *
   * 决策说明：steer 是"立即生效"的语义，因此**队列里积压的 follow-up 一并并入**当前运行
   * 并清空队列 —— 否则它们要等下一轮，而用户此刻已经明确表示不想排队。
   * 这条决策有争议（另一种合理实现是"队列保持不动"），因此在这里写明，
   * 便于接真实后端时对照协议复核。
   */
  function steerIntoRun(session, text) {
    const pending = session.queuedMessages.splice(0)
    pending.forEach((q) => {
      session.items.push({
        id: uid('item'),
        kind: 'user',
        ts: q.queuedAt,
        text: q.text,
        deliverAs: DeliverAs.STEER,
      })
    })
    session.items.push({
      id: uid('item'),
      kind: 'user',
      ts: Date.now(),
      text,
      deliverAs: DeliverAs.STEER,
    })
  }

  /**
   * 发送用户消息。
   *
   * @param {string} text
   * @param {{ deliverAs?: 'steer'|'followUp' }} [opts]
   * @returns {{ ok: boolean, reason?: string, queued?: boolean }}
   */
  function sendUserMessage(text, opts = {}) {
    const s = currentSession.value
    const content = String(text || '').trim()
    if (!s) return { ok: false, reason: 'no-session' }
    if (!content) return { ok: false, reason: 'empty' }

    const mode = opts.deliverAs || deliverAs.value
    s.updatedAt = Date.now()
    s.group = 'today'

    if (isRunning(s)) {
      if (mode === DeliverAs.STEER) {
        steerIntoRun(s, content)
        if (driver) {
          // 同步 /chat 无法把插话注入在途请求：如实降级 —— 视觉上立即上屏
          // （steerIntoRun），实际执行排入队列（alreadyShown 防止收尾时重复渲染），
          // 本轮结束后作为新一轮真实发送。等 SSE 通道就绪后此处可恢复真插话。
          s.queuedMessages.push({
            id: uid('q'), text: content, deliverAs: DeliverAs.STEER,
            queuedAt: Date.now(), alreadyShown: true,
          })
          pushLog('info', `插话已上屏，将在本轮结束后作为新一轮发送（同步后端不支持中段注入）：${content.slice(0, 40)}`)
        } else {
          pushLog('info', `插话已注入当前运行（${s.runningRunId}）：${content.slice(0, 40)}`)
        }
        return { ok: true, queued: false }
      }
      s.queuedMessages.push({ id: uid('q'), text: content, deliverAs: DeliverAs.FOLLOW_UP, queuedAt: Date.now() })
      pushLog('info', `已排队（当前运行结束后发出）：${content.slice(0, 40)}`)
      return { ok: true, queued: true }
    }

    // 空闲态：直接作为新一轮的用户消息，并立刻起一次运行
    s.items.push({
      id: uid('item'),
      kind: 'user',
      ts: Date.now(),
      text: content,
      deliverAs: DeliverAs.FOLLOW_UP,
    })
    startRun()
    return { ok: true, queued: false }
  }

  /** 队列里单条取消 */
  function dropQueued(id) {
    const s = currentSession.value
    if (!s) return
    const i = s.queuedMessages.findIndex((q) => q.id === id)
    if (i >= 0) {
      const [q] = s.queuedMessages.splice(i, 1)
      pushLog('warn', `已取消排队：${q.text.slice(0, 40)}`)
    }
  }

  /** 设置下一次发送的投递语义 */
  function setDeliverAs(next) {
    deliverAs.value = next === DeliverAs.STEER ? DeliverAs.STEER : DeliverAs.FOLLOW_UP
    pushLog('info', `投递方式切换为 ${deliverAs.value}`)
  }

  /**
   * 启停一个工具（设置面板里的开关）。
   *
   * 返回**变更后的状态**（true = 已启用），让调用方不必再去数组里查一遍 ——
   * 查一遍就是第二处判断，两处一旦不一致，开关显示就会和实际清单相反。
   *
   * 唯一的写入点在这里，`buildSteps` 只读不写：开关影响的是"下一次运行的步骤模板"，
   * 不会去改已经发生过的历史记录 —— 时间线里已经跑出来的工具调用不该被追溯删除。
   */
  function toggleTool(name) {
    const i = enabledTools.value.indexOf(name)
    if (i >= 0) enabledTools.value.splice(i, 1)
    else enabledTools.value.push(name)
    return i < 0
  }

  /**
   * 起一次运行。
   *
   * 状态推进完全靠 `runningRunId`：置上即 Running，置 null 即回到 Idle/Failed。
   * 没有任何地方去写"状态字段"。
   *
   * 双传输路径：driver 为 null 走本地模拟（startRunMock），否则交给契约驱动
   * （startRunViaDriver）。两条路径共享同一条不变式 —— runningRunId 的置位/清空
   * 与队列的排空语义，路径差异只体现在"步骤内容从哪来"。
   */
  function startRun() {
    const s = currentSession.value
    if (!s) return { ok: false, reason: 'no-session' }
    if (isRunning(s)) return { ok: false, reason: 'already-running' }

    const token = ++runToken
    s.runningRunId = uid('run')
    s.lastError = null
    pushLog('info', `运行开始 ${s.runningRunId}`)

    if (driver) startRunViaDriver(s)
    else startRunMock(s, token)
    return { ok: true }
  }

  /** 本地模拟路径：buildSteps 生成步骤模板，定时器逐条推进 */
  function startRunMock(s, token) {
    const steps = buildSteps(s)
    let i = 0

    const tick = () => {
      // 令牌不匹配说明这次运行已被取消，直接停止推进
      if (token !== runToken) return
      const step = steps[i]
      if (step) {
        s.items.push(step.item)
        s.stats.totalTokens += step.tokens
        if (step.cached) s.stats.cachedTokens += step.tokens
        s.stats.rounds += 1
        s.updatedAt = Date.now()
        if (step.err) s.lastError = step.err
        pushLog(step.err ? 'error' : 'info', step.log)
        i += 1
        timers.push(setTimeout(tick, STEP_INTERVAL))
        return
      }

      // 收尾：清空 runningRunId 即"不再有运行在跑"；有 lastError 就自然落到 Failed
      s.runningRunId = null
      s.items.push({
        id: uid('item'),
        kind: 'summary',
        ts: Date.now(),
        eyebrow: s.lastError ? '本轮结论' : '本轮结论',
        text: s.lastError
          ? `运行以失败结束：${s.lastError}`
          : `已完成 ${steps.length} 步，无失败。可在右侧查看产出物与文件差异。`,
      })
      // 排队的消息在这一轮结束后作为新一轮发出（模拟步骤可合并展示为一轮）
      const pending = s.queuedMessages.splice(0)
      if (pending.length) {
        pending.forEach((q) => {
          if (q.alreadyShown) return // steer 上屏过的不再重复渲染
          s.items.push({ id: uid('item'), kind: 'user', ts: q.queuedAt, text: q.text, deliverAs: DeliverAs.FOLLOW_UP })
        })
        pushLog('info', `队列中 ${pending.length} 条消息转为新一轮`)
        timers.push(setTimeout(() => startRun(), 160))
      } else {
        pushLog('info', `运行结束 ${s.runningRunId || ''} — ${s.lastError ? 'FAILED' : 'IDLE'}`)
      }
      s.unseen = false
    }

    timers.push(setTimeout(tick, STEP_INTERVAL))
  }

  /**
   * 造出本次运行的步骤序列。
   *
   * 抽成独立函数是为了让 `startRun` 只关心"何时推进"，不掺"推什么内容"。
   *
   * **步骤按 `enabledTools` 生成** —— 这是设置面板里那组工具开关的生效点：
   * 停用 write_file，后续运行里就再不会出现写入补丁步骤；全部停用则只产出模型文本。
   * 倘若这里仍按固定模板产出，设置里的开关就成了"改了没反应"的摆设，
   * 那比不做这个开关更糟：用户会判断成系统坏了，而不是功能没做。
   */
  function buildSteps(session) {
    const tools = enabledTools.value

    /** 助手文本步骤（两处结构相同，抽出只为不把 tokens/cached 抄两遍抄错） */
    const assistantStep = (log, text, tokens, cached) => ({
      log,
      tokens,
      cached,
      item: {
        id: uid('item'),
        kind: 'assistant',
        ts: Date.now(),
        text,
        tokens,
        durationMs: 240,
        cached,
      },
    })

    const steps = [
      assistantStep(
        'assistant 定位调用点',
        '先确认调用点，再决定是否修改；不要在没定位到根因前动手。',
        168,
        false,
      ),
    ]

    /*
     * 检索工具的二选一：优先 grep，被停用时退回 read_file，两者都停用则本步不产生。
     * `hasGrep` 参与排序，是为了让第二次运行换个工具 —— 否则重复运行时步骤完全雷同，
     * 时间线上看不出"这次又跑了一轮"。
     */
    const hasGrep = session.items.some((it) => it.kind === 'tool' && it.name === 'grep')
    const searchTool = (hasGrep ? ['read_file', 'grep'] : ['grep', 'read_file']).find((t) =>
      tools.includes(t),
    )

    if (searchTool) {
      steps.push({
        log: `调用 ${searchTool} → ok`,
        tokens: 96,
        cached: true,
        item: {
          id: uid('item'),
          kind: 'tool',
          ts: Date.now(),
          name: searchTool,
          args:
            searchTool === 'grep'
              ? { pattern: 'runningRunId', glob: '**/*.{js,vue}' }
              : { path: 'src/composables/usePiSession.js' },
          result: { ok: true, matches: 4 },
          status: 'ok',
          highRisk: false,
        },
      })
    }

    // 后台任务与工具开关无关：它代表"运行期间仍在推进的外部过程"
    steps.push({
      log: '后台任务：maven 构建输出刷新',
      tokens: 24,
      cached: true,
      item: {
        id: uid('item'),
        kind: 'activity',
        ts: Date.now(),
        label: '后台任务',
        detail: 'maven 构建输出刷新（第 1 批）',
        variant: 'default',
        meta: { durationMs: 1840 },
      },
    })

    if (tools.includes('exec_shell')) {
      steps.push({
        log: '执行 npm run build（高危，需审批）',
        tokens: 120,
        cached: false,
        item: {
          id: uid('item'),
          kind: 'tool',
          ts: Date.now(),
          name: 'exec_shell',
          args: { command: 'npm run build', cwd: 'frontend/agent-harness-ui' },
          result: { ok: true, exitCode: 0, durationMs: 8420 },
          status: 'ok',
          highRisk: true,
        },
      })
    }

    if (tools.includes('write_file')) {
      steps.push({
        log: '写入补丁 write_file（高危，需审批）',
        tokens: 142,
        cached: false,
        item: {
          id: uid('item'),
          kind: 'tool',
          ts: Date.now(),
          name: 'write_file',
          args: { path: 'src/composables/usePiSession.js', additions: 12, deletions: 3 },
          result: { ok: true, bytes: 6420 },
          status: 'ok',
          highRisk: true,
          additions: 12,
          deletions: 3,
          diffPath: 'src/composables/usePiSession.js',
        },
      })
    }

    steps.push(
      assistantStep(
        'assistant 输出结论',
        '收敛到单一来源后，「是否正在运行」在全工程只有一处判断，不再有旁路副本。',
        88,
        true,
      ),
    )

    return steps.slice(0, RUN_STEPS)
  }

  /** 卸载时调用：清空所有在途定时器，并把运行态归零 */
  function dispose() {
    runToken += 1
    driver?.cancelCurrentRun?.()
    if (unsubscribeDriver) {
      unsubscribeDriver()
      unsubscribeDriver = null
    }
    timers.forEach(clearTimeout)
    timers = []
  }

  return {
    // 数据
    sessions, viewedSessionId, currentSession, sidebarGroups,
    sessionCount, filteredCount, query,
    // 派生状态（全部来自 sessionVisibility）
    status, statusTone, lastError, runningRunId, isCurrentRunning,
    items, artifacts, diffFiles, stats, contextStats, queuedMessages,
    // 配置
    deliverAs, model, thinking, enabledTools, toggleTool,
    // 传输驱动（契约实现注入，见 api/sessionDriver.js / sessionDriverHttp.js）
    setDriver, runtimeAgentId, agentOptions, setRuntimeAgent, loadRuntimeAgentOptions,
    // 日志
    logs, pushLog,
    // 动作
    selectSession, createSession, togglePin, archiveSession,
    clearTrace, cancelCurrentRun, startRun, sendUserMessage, dropQueued, setDeliverAs,
    dispose,
  }
}

/** 供外部判断"当前会话是否处于失败态"时复用同一枚举，避免引入裸字符串 */
export { SessionStatus }
