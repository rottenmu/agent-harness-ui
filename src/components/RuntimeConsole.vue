<template>
  <!-- ============================================================
       运行时控制台（surface: console）
       布局：顶部面包屑 / 中部「时间线 + Composer」/ 右栏「产出 + 上下文统计」
             / 最右 Diff 侧栏（可开合）/ 底部日志坞
       ============================================================ -->
  <div class="console">
    <!-- ---------------- 顶部：面包屑 + 状态 + 会话动作 ---------------- -->
    <header class="console-head">
      <!--
        面包屑第一段是**可选择的工作区**，不是只读文字。
        参照 pi-gui 的 topbar：`工作区 / 环境 / 会话名`，第一段点开即切换 ——
        它是"当前在哪个项目里工作"的唯一入口，只显示不可改会让人以为工作区是写死的。
      -->
      <nav class="crumb">
        <WorkspacePicker @manage="emit('open-settings')" />
        <span class="crumb-sep">/</span>
        <span class="crumb-title">{{ session?.title || '未选择会话' }}</span>
      </nav>

      <!--
        状态标签只有三种取值（Idle / Running / Failed）。
        「运行中又发了消息」不会产生第四种状态 —— 排队由 queuedMessages 表达，
        状态位保持 Running 不变。理由见 api/sessionDriver.js 的设计说明第 1 条。
      -->
      <span class="status-label" :class="`tone-${statusTone}`">
        <span class="status-dot" />
        {{ statusMeta.label }}
      </span>

      <span v-if="lastError" class="head-error" :title="lastError">失败原因已记录</span>

      <span class="head-spacer" />

      <!--
        执行目标 Agent：驱动（真实 /chat）激活后必填 —— 缺失时运行会以
        Failed 收场并提示。模拟驱动下它只是展示（不参与步骤生成）。
        选项在后端连通时经 loadRuntimeAgentOptions 拉取，失败时下拉为空、
        运行前会给出明确错误而不是静默失败。
      -->
      <n-select
        :value="runtimeAgentId"
        class="agent-pick"
        size="tiny"
        :options="agentOptions"
        placeholder="执行 Agent"
        filterable
        @update:value="setRuntimeAgent"
      />

      <n-button v-if="!isCurrentRunning" size="small" type="primary" @click="onStart">
        <template #icon><AppIcon name="play" :size="12" /></template>
        Start
      </n-button>
      <n-button v-else size="small" @click="onStop">
        <template #icon><AppIcon name="stop" :size="12" /></template>
        Stop
      </n-button>

      <n-button size="small" quaternary @click="clearTrace">Clear</n-button>

      <n-button size="small" quaternary :class="{ 'is-on': diffOpen }" @click="toggleDiff">
        <template #icon><AppIcon name="panel" :size="12" /></template>
        Diff
        <span class="diff-tag">{{ diffFiles.length }}</span>
      </n-button>
    </header>

    <!-- ---------------- 主体 ---------------- -->
    <div class="console-body">
      <section class="center">
        <ConversationTimeline
          :items="items"
          :session-id="session?.id || ''"
          @view-diff="openDiffAt"
        />

        <Composer
          v-model:text="draft"
          v-model:model="model"
          v-model:thinking="thinking"
          v-model:deliver-as="deliverAs"
          :queued="queuedMessages"
          :model-options="MODEL_OPTIONS"
          :thinking-options="THINKING_OPTIONS"
          @send="onSend"
          @command="onCommand"
          @drop-queued="dropQueued"
        />
      </section>

      <!--
        右栏（产出物 + 上下文统计）与最右的 Diff 侧栏**互斥显示**。
        两者同时占位会把中栏压到 400px 以下 —— 时间线的正文和 composer 的提示行
        都会退化成不可读状态（实测：1064px 视口下只剩 108px）。
        语义上也说得通：它们都是"右手的辅助视图"，一个回答「产出了什么」，
        另一个回答「某个改动具体长什么样」，不需要同时看。
      -->
      <aside v-show="!diffOpen" class="rail">
        <section class="rail-block">
          <div class="rail-head">
            <AppIcon name="code" :size="11" />
            <span>Agent Artifacts</span>
            <span class="rail-count">{{ artifacts.length }}</span>
          </div>
          <p v-if="!artifacts.length" class="rail-empty">本条会话尚未产出文件。</p>
          <button
            v-for="a in artifacts"
            :key="a.path"
            class="artifact"
            type="button"
            :title="a.path"
            @click="openDiffAt(a.path)"
          >
            <span class="artifact-path">{{ a.path }}</span>
            <span class="artifact-meta">{{ (a.bytes / 1024).toFixed(1) }} KB</span>
          </button>
        </section>

        <section class="rail-block">
          <div class="rail-head">
            <AppIcon name="activity" :size="11" />
            <span>Context</span>
          </div>
          <!--
            这几项都由 usePiSession 的 contextStats 一次算好（命中率只在一处计算），
            面板不再各自除一遍 —— 阈值一改就要改 N 处是典型的漂移起点。
          -->
          <dl class="stat-grid">
            <dt>tokens</dt>
            <dd>{{ contextStats.totalTokens.toLocaleString() }}</dd>
            <dt>cached</dt>
            <dd>{{ contextStats.cachedTokens.toLocaleString() }}</dd>
            <dt>hit rate</dt>
            <dd>{{ (contextStats.cacheHitRate * 100).toFixed(1) }}%</dd>
            <dt>rounds</dt>
            <dd>{{ contextStats.rounds }}</dd>
          </dl>
          <div class="usage-bar" :title="`窗口占用 ${(contextStats.usage * 100).toFixed(1)}%`">
            <span class="usage-fill" :style="{ width: usageWidth }" />
          </div>
          <div class="usage-note">
            窗口 {{ (contextStats.windowTotal / 1000).toFixed(0) }}k ·
            占用 {{ (contextStats.usage * 100).toFixed(1) }}%
          </div>
        </section>
      </aside>

      <!-- ---------------- Diff 侧栏（可开合） ---------------- -->
      <DiffPanel
        :files="diffFiles"
        :open="diffOpen"
        :active-path="diffActivePath"
        @close="diffOpen = false"
        @select-file="diffActivePath = $event"
      />
    </div>

    <!-- ---------------- 底部：日志坞（可折叠） ---------------- -->
    <footer class="console-foot" :class="{ 'is-open': logOpen }">
      <button class="foot-head" type="button" @click="logOpen = !logOpen">
        <span class="foot-caret" :class="{ 'is-open': logOpen }">
          <AppIcon name="chevron" :size="10" />
        </span>
        <span class="foot-title">Real-time Log</span>
        <span class="foot-count">{{ logs.length }} line(s)</span>
        <span class="foot-spacer" />
        <span v-if="!logOpen && lastLog" class="foot-preview" :class="`lvl-${lastLog.level}`">
          {{ lastLog.text }}
        </span>
      </button>

      <div v-show="logOpen" class="foot-body">
        <LogPanel :logs="logs" />
      </div>
    </footer>
  </div>
</template>

<script setup>
/**
 * 运行时控制台
 *
 * 四条职责边界：
 *
 * 1. **本组件不持有会话状态。** 全部来自 `usePiSession()` 这个单例
 *    （侧栏读的是同一个实例，理由见 composables/usePiSession.js）。
 *    组件内再引一份 ref 就会出现「控制台发了消息、侧栏没反应」且两边都不报错。
 *
 * 2. **状态只读不写。** 界面上的 Running / Failed 一律由 `status` 派生值给出，
 *    本组件不做任何 `status = '...'` 之类的写操作。写状态的地方只能是
 *    `runningRunId`（起停一次运行）与 `lastError`（一次运行的结果）。
 *
 * 3. **`Ctrl+D` 由本组件注册，但用 `active` 门控。**
 *    控制台被切走后快捷键必须失效，否则用户在评测工作台按 Ctrl+D 会打开一个看不见的侧栏。
 *    注册在 window 上而不是某个容器：侧栏与时间线的焦点位置不固定，
 *    挂在容器上会出现「点过侧栏后快捷键就不灵了」。
 *
 * 4. **view-in-diff 与侧栏开合走同一个入口 `openDiffAt`。**
 *    工具行 → 展开并高亮该文件；Diff 按钮 → 纯开合。两条路径不各写一套开合逻辑。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NButton, NSelect } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import WorkspacePicker from './WorkspacePicker.vue'
import ConversationTimeline from './ConversationTimeline.vue'
import Composer from './Composer.vue'
import DiffPanel from './DiffPanel.vue'
import LogPanel from './LogPanel.vue'
import { SESSION_STATUS_META } from '@/api/sessionDriver'
import { createHttpSessionDriver } from '@/api/sessionDriverHttp'
import { MODEL_OPTIONS, THINKING_OPTIONS } from '@/mock/sessions'
import { usePiSession } from '@/composables/usePiSession'
import { CONNECTION, useBackend } from '@/composables/useBackend'

const props = defineProps({
  /** 本表面是否处于激活状态：决定 Ctrl+D 这类全局快捷键是否生效（约束 3） */
  active: { type: Boolean, default: true },
})

/**
 * 设置面板由应用外壳持有（侧栏页脚与这里的「管理工作区…」都要能打开它），
 * 本组件只把意图转出去 —— 面板挂在自己身上会变成"切走表面就找不到"。
 */
const emit = defineEmits(['open-settings'])

const {
  currentSession,
  status, statusTone, lastError, isCurrentRunning,
  items, artifacts, diffFiles, contextStats, queuedMessages,
  deliverAs, model, thinking, enabledTools, logs,
  startRun, cancelCurrentRun, sendUserMessage, dropQueued, clearTrace, pushLog,
  setDriver, runtimeAgentId, agentOptions, setRuntimeAgent, loadRuntimeAgentOptions,
} = usePiSession()

/** 当前会话（模板里用 session 这个名字，比 currentSession 更短且不与 store 撞名） */
const session = computed(() => currentSession.value)
const statusMeta = computed(() => SESSION_STATUS_META[status.value] || SESSION_STATUS_META.idle)

const draft = ref('')
const diffOpen = ref(false)
const diffActivePath = ref('')
const logOpen = ref(false)

const lastLog = computed(() => logs.value[logs.value.length - 1] || null)

/** 窗口占用条宽度：夹到 0~100%，避免 over-window 时把条撑出容器 */
const usageWidth = computed(() => `${Math.min(100, Math.max(0, contextStats.value.usage * 100))}%`)

/* ---------------- 传输驱动激活（后端连通 → /chat 通道） ---------------- */

/**
 * 连接状态来自 useBackend 单例（应用级事实）：评测工作台那边连上了后端，
 * 这里 watch 到 online 即注入契约驱动；降级 mock / 断开则撤回模拟路径。
 * 在此之前本表面与工作台对"真实还是模拟"的认知可能相反 —— 单例化后不再有这个问题。
 */
const backend = useBackend()

let runtimeDriver = null
watch(
  [backend.isRemote, backend.isOnline],
  ([remote, online]) => {
    if (remote && online) {
      if (!runtimeDriver) runtimeDriver = createHttpSessionDriver()
      runtimeDriver.configure({ agentId: runtimeAgentId.value })
      setDriver(runtimeDriver)
      if (!agentOptions.value.length) loadRuntimeAgentOptions()
    } else {
      setDriver(null)
      // 用户没开过评测工作台时没人触发过连接：控制台自己探测一次（幂等，
      // token 已存在则只做一次轻量 dashboard 探测；失败自动降级 mock）
      if (remote && backend.status.value === CONNECTION.IDLE) {
        backend.connect().catch(() => {})
      }
    }
  },
  { immediate: true },
)

/** 执行目标变化即时同步进驱动（缺 Agent 的运行会以 Failed 收场并提示） */
watch(runtimeAgentId, (val) => runtimeDriver?.configure({ agentId: val || '' }))

/* ---------------- 会话动作 ---------------- */

function onStart() {
  const r = startRun()
  if (!r.ok) pushLog('warn', `无法启动运行：${r.reason}`)
}

function onStop() {
  cancelCurrentRun()
  pushLog('warn', '已取消当前运行')
}

function onSend(text) {
  const r = sendUserMessage(text)
  if (!r.ok) {
    pushLog('warn', `消息未发出：${r.reason}`)
    return
  }
  if (r.queued) pushLog('info', '已进入排队区，等待本轮结束后发出')
}

/**
 * 命令面板的动作。
 *
 * 命令的**实现**在这里而不在 Composer：Composer 只负责面板交互，
 * 让输入框反向依赖会话状态会让它无法单独复用（调试平台也用了同一个组件）。
 */
function onCommand(item) {
  if (!item) return
  if (item.name === '/model' || item.name === '/thinking') {
    const isModel = item.name === '/model'
    const target = isModel ? model : thinking
    const options = isModel ? MODEL_OPTIONS : THINKING_OPTIONS
    const idx = options.findIndex((o) => o.value === target.value)
    const next = options[(idx + 1) % options.length]
    target.value = next.value
    pushLog('info', `${item.name} 切换为 ${next.label}`)
    return
  }
  if (item.name === '/tools') {
    pushLog('info', `/tools 面板为延后项（见方案第九节），当前启用 ${enabledTools.value.length} 个工具`)
    return
  }
  if (item.name === '/clear') {
    clearTrace()
  }
}

/* ---------------- Diff 侧栏 ---------------- */

/**
 * 打开差异侧栏并定位到某个文件。
 * 空路径表示「只开合，不定位」—— 工具行传具体路径，Diff 按钮不传。
 */
function openDiffAt(path) {
  if (path) diffActivePath.value = path
  diffOpen.value = true
}

function toggleDiff() {
  diffOpen.value = !diffOpen.value
}

function onGlobalKeydown(e) {
  if (!props.active) return
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
    // 浏览器把 Ctrl+D 占为「加入书签」，不阻止会让快捷键变成打开书签弹窗
    e.preventDefault()
    toggleDiff()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-page);
}

/* ---------------- 顶部 ---------------- */
.console-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  height: 44px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-card);
}

.crumb { display: flex; align-items: center; gap: var(--space-0-5); min-width: 0; }
/* 工作区段由 WorkspacePicker 自绘（含按钮内边距），此处不再为它设样式 */
.crumb-sep { color: var(--border-heavy); }
.crumb-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.status-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-sub);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-round);
  background: var(--status-neutral);
}
.status-label.tone-running { border-color: var(--warning-tint-border); color: var(--running); }
.status-label.tone-running .status-dot { background: var(--status-running); }
.status-label.tone-error { border-color: var(--danger-tint-border); color: var(--fail); }
.status-label.tone-error .status-dot { background: var(--status-error); }

.head-error {
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  border: 1px solid var(--danger-tint-border);
  border-radius: var(--radius-xs);
  background: var(--danger-tint-bg);
  color: var(--fail);
  font-size: var(--text-xs);
  cursor: help;
}
.head-spacer { flex: 1 1 auto; }

/* 执行 Agent 选择器：固定宽度避免选项加载后头部跳动 */
.agent-pick {
  flex: 0 1 200px;
  min-width: 140px;
  max-width: 240px;
}

.diff-tag {
  margin-left: var(--space-1);
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.is-on { color: var(--primary); }

/* ---------------- 主体 ---------------- */
.console-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.center {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

/* ---------------- 右栏 ---------------- */
.rail {
  display: flex;
  flex-direction: column;
  flex: 0 0 260px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
  border-left: 1px solid var(--border-light);
  background: var(--bg-sidebar);
}

.rail-block + .rail-block { margin-top: var(--space-3); }

.rail-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-1) var(--space-1);
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.rail-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.rail-empty { margin: 0; padding: var(--space-2); color: var(--text-faint); font-size: var(--text-xs); }

.artifact {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.artifact:hover { background: var(--overlay-hover); }
.artifact-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.artifact-meta { flex: 0 0 auto; color: var(--text-faint); font-size: var(--text-xs); }

.stat-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-2);
  margin: 0;
  padding: 0 var(--space-1);
  font-size: var(--text-xs);
}
.stat-grid dt { color: var(--text-faint); }
.stat-grid dd {
  margin: 0;
  text-align: right;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.usage-bar {
  height: 4px;
  margin: var(--space-2) var(--space-1) var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--overlay-active);
  overflow: hidden;
}
.usage-fill { display: block; height: 100%; background: var(--primary); transition: width var(--motion-slow) var(--ease-out); }
.usage-note { padding: 0 var(--space-1); color: var(--text-faint); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }

/* ---------------- 底部日志坞 ---------------- */
.console-foot {
  flex: 0 0 auto;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}

.foot-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 28px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--text-faint);
  font-family: inherit;
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}
.foot-head:hover { color: var(--text-sub); }
.foot-caret { display: inline-flex; transition: transform var(--motion-fast) var(--ease-out); }
.foot-caret.is-open { transform: rotate(90deg); }
.foot-title { letter-spacing: var(--tracking-wide); text-transform: uppercase; }
.foot-count { font-variant-numeric: tabular-nums; }
.foot-spacer { flex: 1 1 auto; }
.foot-preview {
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}
.lvl-info { color: var(--text-faint); }
.lvl-warn { color: var(--running); }
.lvl-error { color: var(--fail); }
</style>
