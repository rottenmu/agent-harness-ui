/**
 * 会话 mock 数据
 *
 * 时间线项按参照项目 pi-gui 的 `timeline-item.tsx` 分为 **5 类**：
 *   user / assistant / activity / tool / summary
 *
 * 其中 `activity`（轻量活动行）与 `summary`（总结卡）是本轮新增的：
 * 前者记录"不是工具调用但确实发生了事"的条目（装依赖、跑构建、起后台进程），
 * 后者是一轮结束时的带眉标结论卡。原先只有 user/agent/tool/error 四类，
 * 导致这类信息只能塞进 agent 正文里，与真正的模型输出混在一起。
 *
 * 数据是有意为后续接真实 SSE 预留形状的：
 * 每条 item 的字段命名与 `api/sessionDriver.js` 的类型注释一一对应。
 */
import { DeliverAs } from '@/api/sessionDriver'

/** 稳定的时间戳基准，避免每次刷新 mock 的时间戳都在跳 */
const T0 = Date.parse('2026-09-10T18:00:00+08:00')
const min = (n) => n * 60 * 1000

/** 造一条时间线项；id 由 kind + 序号拼出，保证虚拟列表 key 稳定 */
function item(kind, seq, ts, rest) {
  return { id: `${kind}-${seq}`, kind, ts, ...rest }
}

/**
 * 「长链路」会话：由 120 步循环展开成 240+ 条时间线项。
 *
 * 为什么 mock 里要自带一个长会话，而不是测试时临时膨胀数据：
 * 临时膨胀要改交付文件的源码再改回来，属于「测试污染交付物」；
 * 而长链路是本平台**真实会遇到**的场景（十几轮工具调用很常见），
 * 把它做成正式 mock 用例，既能验证虚拟滚动，也便于以后回归。
 *
 * ⚠️ 只有**写类工具**才带 `diffPath`。给 read/grep 也塞一个路径会让
 * 「这条工具调用改了文件」这个信号失效（每条都有 = 没有信号），
 * 而且会指向差异负载里根本不存在的文件。
 */
function buildLongSession() {
  const items = []
  let seq = 0
  const stepKinds = [
    { label: '读取文件', name: 'read_file', args: { path: 'src/main/java/com/zimo/module/ai/agent/HarnessAgent.java' } },
    { label: '检索符号', name: 'grep', args: { pattern: 'runningRunId', glob: '**/*.java' } },
    {
      label: '写入补丁',
      name: 'write_file',
      args: { path: 'src/composables/useRunSession.js', additions: 12, deletions: 3 },
      diffPath: 'src/composables/useRunSession.js',
    },
    { label: '执行测试', name: 'exec_shell', args: { cmd: 'mvn -q -pl modules/agent-harness test' } },
  ]

  for (let round = 1; round <= 120; round += 1) {
    const base = T0 + round * 9000
    const k = stepKinds[round % stepKinds.length]
    items.push(item('assistant', seq++, base, {
      text: `第 ${round} 轮：先确认 ${k.name} 的调用点，再决定是否修改。`,
      tokens: 180 + (round % 40),
      durationMs: 240 + (round % 60),
      cached: round % 3 === 0,
    }))
    items.push(item('tool', seq++, base + 1200, {
      name: k.name,
      args: k.args,
      result: { ok: true, summary: `${k.label}完成`, elapsedMs: 120 + (round % 80) },
      status: 'ok',
      highRisk: k.name === 'write_file' || k.name === 'exec_shell',
      additions: k.args.additions ?? 0,
      deletions: k.args.deletions ?? 0,
      // 只有写类工具才有差异入口；路径必须能在本会话的 diff 负载里找到，
      // 否则用户点「view in diff」后侧栏打开却定位不到文件。
      diffPath: k.diffPath || null,
    }))
    if (round % 20 === 0) {
      items.push(item('activity', seq++, base + 2200, {
        label: '后台任务',
        detail: `maven 构建输出刷新（第 ${round / 20} 批）`,
        variant: 'default',
        meta: { durationMs: 4800 },
      }))
    }
  }

  items.push(item('summary', seq, T0 + 120 * 9000 + 4000, {
    eyebrow: '长链路回归结论',
    text: `共执行 120 轮工具调用，无失败。DOM 中渲染的时间线项数量应与总条数解耦（虚拟滚动生效）。`,
  }))

  return items
}

/** 常规会话：演示 5 类时间线项各至少一条 */
function buildMainSession() {
  let seq = 0
  return [
    item('user', seq++, T0, {
      text: '登录态在刷新页面后丢失，帮我定位并修掉。',
      deliverAs: DeliverAs.FOLLOW_UP,
    }),
    item('assistant', seq++, T0 + 2000, {
      text: '先看会话 id 是怎么存的：一处写 sessionStorage，另一处读 localStorage，先核对这两处。',
      tokens: 168, durationMs: 320, cached: false,
    }),
    item('tool', seq++, T0 + 3600, {
      name: 'read_file',
      args: { path: 'frontend/agent-harness-ui/src/composables/useRunSession.js' },
      result: { ok: true, lines: 98 },
      status: 'ok',
    }),
    item('activity', seq++, T0 + 5000, {
      label: '检索',
      detail: 'grep "harness.sessionId" — 命中 2 处',
      variant: 'default',
      meta: { durationMs: 240 },
    }),
    item('tool', seq++, T0 + 6200, {
      // 与 DIFF_FILES 里的路径**必须逐字一致**：view-in-diff 靠路径字符串定位文件，
      // 差一个前缀（比如多写了 frontend/agent-harness-ui/）就会打开侧栏却定位不到。
      name: 'write_file',
      args: { path: 'src/api/sessionDriver.js' },
      result: { ok: true, bytes: 6420 },
      status: 'ok',
      highRisk: true,
      additions: 142,
      deletions: 0,
      diffPath: 'src/api/sessionDriver.js',
    }),
    item('assistant', seq++, T0 + 8000, {
      text: '定位到了：读取用的是 localStorage，写入用的是 sessionStorage，键名还不一样。改成同一处读写。',
      tokens: 96, durationMs: 180, cached: true,
    }),
    item('summary', seq, T0 + 9200, {
      eyebrow: '本轮结论',
      text: '刷新后登录态丢失的根因是「写入与读取落在两个不同的 Storage，且键名不一致」，已收敛到单一读取入口。',
    }),
  ]
}

/** 含失败与错误活动行的会话：验证 error 变体与 failed 状态 */
function buildFailedSession() {
  let seq = 0
  return [
    item('user', seq++, T0 + min(3), { text: '把时间排序的断言补齐。', deliverAs: DeliverAs.FOLLOW_UP }),
    item('assistant', seq++, T0 + min(3) + 2000, {
      text: '需要在断言里比较相邻两条的时间戳，先跑一次看现状。', tokens: 74, durationMs: 160, cached: false,
    }),
    item('tool', seq++, T0 + min(3) + 3400, {
      name: 'exec_shell',
      args: { cmd: 'node scripts/check-order.js' },
      result: { ok: false, stderr: 'AssertionError: expected ts[1] >= ts[0]' },
      status: 'fail',
      highRisk: true,
    }),
    item('activity', seq++, T0 + min(3) + 4200, {
      label: '构建失败',
      detail: 'check-order.js 以非 0 退出码结束（exit 1）',
      variant: 'error',
      meta: { durationMs: 1340 },
    }),
    item('summary', seq, T0 + min(3) + 5200, {
      eyebrow: '本轮结论',
      text: '时间排序断言未通过：第 2 条与第 1 条时间戳相等，需要把比较改成 >= 并补一条确定性用例。',
    }),
  ]
}

/** 正在运行的会话：用于验证「运行中排队 / 插话」 */
function buildRunningSession() {
  let seq = 0
  return [
    item('user', seq++, T0 + min(12), { text: '重构 HarnessAgent 的插件装载路径。', deliverAs: DeliverAs.FOLLOW_UP }),
    item('assistant', seq++, T0 + min(12) + 2000, {
      text: '先枚举当前所有装载入口，再统一到一处。', tokens: 88, durationMs: 200, cached: false,
    }),
    item('tool', seq++, T0 + min(12) + 3200, {
      name: 'grep',
      args: { pattern: 'plugin-dir', glob: '**/*.java' },
      result: { ok: true, matches: 7 },
      status: 'ok',
    }),
  ]
}

/** 只有一条用户消息的会话：验证空态与「由空变非空」的跟随行为 */
function buildEmptySession() {
  return [item('user', 0, T0 + min(20), { text: '帮我看下 observ 接口的鉴权白名单。', deliverAs: DeliverAs.FOLLOW_UP })]
}

/** 产出的文件（右侧 Agent Artifacts 面板） */
const ARTIFACTS = [
  {
    path: 'src/api/sessionDriver.js',
    language: 'javascript',
    bytes: 6420,
    content: `export const SessionStatus = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  FAILED: 'failed',
})

export const DeliverAs = Object.freeze({
  STEER: 'steer',
  FOLLOW_UP: 'followUp',
})`,
  },
  {
    path: 'docs/plans/2026-09-10-pi-gui-frontend-port.md',
    language: 'markdown',
    bytes: 18240,
    content: `# 把 pi-gui 渲染层移植进 agent-harness-ui

> 状态：实施中
> 规范依据：docs/rules/PLAN_DOC_RULES.md

## 一、置信度与剩余风险

- 当前置信度：82%`,
  },
]

/** 文件差异（Diff 侧栏）。数据由消息负载提供，前端不做 diff 计算。 */
const DIFF_FILES = [
  {
    path: 'src/api/sessionDriver.js',
    status: 'added',
    additions: 142,
    deletions: 0,
    hunks: [
      {
        header: '@@ -0,0 +1,14 @@',
        lines: [
          { kind: 'add', text: "export const SessionStatus = Object.freeze({" },
          { kind: 'add', text: "  IDLE: 'idle'," },
          { kind: 'add', text: "  RUNNING: 'running'," },
          { kind: 'add', text: "  FAILED: 'failed'," },
          { kind: 'add', text: '})' },
          { kind: 'ctx', text: '' },
          { kind: 'add', text: "// 只有三态：排队不占用状态位，而由 runningRunId + queuedMessages 表达" },
        ],
      },
    ],
  },
  {
    path: 'src/composables/useRunSession.js',
    status: 'modified',
    additions: 12,
    deletions: 3,
    hunks: [
      {
        header: '@@ -38,7 +38,9 @@ export function useRunSession() {',
        lines: [
          { kind: 'ctx', text: '  function abort() {' },
          { kind: 'del', text: '    running.value = false' },
          { kind: 'add', text: '    runningRunId.value = null' },
          { kind: 'ctx', text: '    timers.forEach(clearTimeout)' },
          { kind: 'ctx', text: '    timers = []' },
          { kind: 'ctx', text: '  }' },
        ],
      },
    ],
  },
  {
    path: 'src/styles/theme-values.css',
    status: 'added',
    additions: 108,
    deletions: 0,
    hunks: [
      {
        header: '@@ -0,0 +1,6 @@',
        lines: [
          { kind: 'add', text: ':root {' },
          { kind: 'add', text: '  --bg-page: #f7f8fa;' },
          { kind: 'add', text: '}' },
        ],
      },
    ],
  },
]

const STATS = { totalTokens: 48213, cachedTokens: 19244, rounds: 27, windowTotal: 128000 }

/**
 * 会话种子。
 *
 * 顺序即侧栏展示顺序的依据（按 updatedAt 倒序由 usePiSession 负责）。
 *
 * ⚠️ 这里**故意不写 `status` 字段**。
 * 状态是由 `runningRunId` + `lastError` 推导出来的（见 composables/sessionVisibility.js），
 * 一旦在种子里也存一份 status，就出现了同一事实的两个副本 ——
 * 种子说 idle、推导说 running 时，界面会以哪个为准完全没有保证。
 * 这也是参照项目 pi-gui 那份 `sidebar-unseen-notification-consistency` 复盘的教训。
 *
 * 推论：想看「会话在运行中」的样例，就给 `runningRunId` 赋一个非 null 值，
 * 而不是把状态改成 running。
 */
export const SESSION_SEED = [
  {
    id: 'sess-debug-main',
    title: '登录态丢失定位与修复',
    preview: '写入与读取落在两个不同的 Storage，且键名不一致',
    workspace: 'agent_runner',
    runningRunId: null,
    pinned: true,
    unseen: false,
    lastError: null,
    updatedAt: T0 + 9200,
    group: 'today',
    items: buildMainSession(),
    artifacts: ARTIFACTS,
    diff: DIFF_FILES,
    stats: STATS,
  },
  {
    id: 'sess-running',
    title: '插件装载路径重构',
    preview: '先枚举当前所有装载入口，再统一到一处',
    workspace: 'agent_runner',
    // 非 null 即「有运行在跑」——状态推导的唯一依据
    runningRunId: 'run-plugin-refactor-01',
    pinned: false,
    unseen: true,
    lastError: null,
    updatedAt: T0 + min(12),
    group: 'today',
    items: buildRunningSession(),
    artifacts: [],
    diff: DIFF_FILES.slice(0, 1),
    stats: { totalTokens: 12880, cachedTokens: 4012, rounds: 3, windowTotal: 128000 },
  },
  {
    id: 'sess-failed',
    title: '时间排序校验（断言未通过）',
    preview: 'expected ts[1] >= ts[0]，需要改成 >= 并补确定性用例',
    workspace: 'agent_runner',
    runningRunId: null,
    pinned: false,
    unseen: true,
    lastError: 'AssertionError: expected ts[1] >= ts[0]',
    updatedAt: T0 + min(3) + 5200,
    group: 'today',
    items: buildFailedSession(),
    artifacts: [],
    diff: DIFF_FILES.slice(1, 2),
    stats: { totalTokens: 8420, cachedTokens: 0, rounds: 2, windowTotal: 128000 },
  },
  {
    id: 'sess-long',
    title: '长链路回归（120 轮工具调用）',
    preview: '共 120 轮，无失败；用于验证虚拟滚动',
    workspace: 'agent_runner',
    runningRunId: null,
    pinned: false,
    unseen: false,
    lastError: null,
    updatedAt: T0 + min(60),
    group: 'yesterday',
    items: buildLongSession(),
    artifacts: ARTIFACTS.slice(0, 1),
    diff: DIFF_FILES,
    stats: { totalTokens: 186420, cachedTokens: 92180, rounds: 120, windowTotal: 128000 },
  },
  {
    id: 'sess-empty',
    title: 'observ 接口鉴权白名单',
    preview: '帮我看下 observ 接口的鉴权白名单',
    workspace: 'harness',
    runningRunId: null,
    pinned: false,
    unseen: false,
    lastError: null,
    updatedAt: T0 + min(20),
    group: 'earlier',
    items: buildEmptySession(),
    artifacts: [],
    diff: [],
    stats: { totalTokens: 240, cachedTokens: 0, rounds: 0, windowTotal: 128000 },
  },
]

/** 侧栏分节的展示顺序与标题 */
export const GROUP_LABELS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier', label: 'Earlier' },
]

/** 命令面板条目（Composer 的 `/` 菜单） */
export const SLASH_COMMANDS = [
  { name: '/model', hint: '切换模型', detail: 'gpt-4o · claude-sonnet-4 · deepseek-chat' },
  { name: '/thinking', hint: '调整思考级别', detail: 'off · low · medium · high' },
  { name: '/tools', hint: '启用 / 禁用工具集', detail: 'read / write / exec / http' },
  { name: '/clear', hint: '清空当前会话轨迹', detail: '仅清空前端视图，不删后端记录' },
]

/** 可选的模型与思考级别 */
export const MODEL_OPTIONS = [
  { value: 'deepseek-chat', label: 'deepseek-chat' },
  { value: 'gpt-4o', label: 'gpt-4o' },
  { value: 'claude-sonnet-4', label: 'claude-sonnet-4' },
]

export const THINKING_OPTIONS = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
]

/** 工具集（含高危标记：命中即触发人工审批） */
export const TOOL_OPTIONS = [
  { value: 'read_file', label: 'read_file', highRisk: false },
  { value: 'grep', label: 'grep', highRisk: false },
  { value: 'write_file', label: 'write_file', highRisk: true },
  { value: 'exec_shell', label: 'exec_shell', highRisk: true },
  { value: 'http_request', label: 'http_request', highRisk: true },
]

/** 高危工具：命中时需要人工审批后才继续 */
export const HIGH_RISK_TOOLS = TOOL_OPTIONS.filter((t) => t.highRisk).map((t) => t.value)
