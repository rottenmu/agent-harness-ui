<template>
  <!-- ============================================================
       Agent Harness｜智能体评测工作台
       布局：顶部导航 / 左用例树 / 中主面板 / 右配置 / 底日志指标
       状态与动作集中在 useWorkbench，本组件只负责编排与事件转发
       （主题与消息 Provider 在 App.vue 提供）
       ============================================================ -->
  <div class="harness-root">
    <TopBar
      :selected-count="selectedCaseIds.length"
      :running="running"
      :mode="dataMode"
      :status-text="statusText"
      :last-error="lastError"
      @run="onRunSelected"
      @stop="onStop"
      @export="onExportReport"
      @reconnect="onReconnect"
    />

    <div class="main-body">
      <CaseTree
        v-model:search="caseSearch"
        :tree-data="treeData"
        :selected-ids="selectedCaseIds"
        :current-id="currentCaseId"
        :total-count="totalCaseCount"
        :all-selected="allSelected"
        :partially-selected="partiallySelected"
        @update:checked-keys="handleCheckedKeys"
        @select="loadCase"
        @toggle-all="toggleSelectAll"
      />

      <section class="panel panel-center">
        <n-tabs v-model:value="centerTab" type="line" animated pane-class="center-pane">
          <n-tab-pane name="trace" tab="Conversation Trace">
            <ConversationTrace
              v-model:prompt="manualPrompt"
              :case-meta="currentCase"
              :messages="messages"
              :running="running"
              :step-counter="stepCounter"
              :can-step-run="canStepRun"
              :case-key="currentCaseId"
              @step-run="onStepRun"
            />
          </n-tab-pane>

          <n-tab-pane name="graph" tab="Execution Graph">
            <ExecutionGraph
              :graph="currentGraph"
              :active-tab="centerTab"
              :render-key="messages.length"
            />
          </n-tab-pane>
        </n-tabs>
      </section>

      <aside class="panel panel-right">
        <!--
          display-directive="show" 必须显式声明在 n-tab-pane 上（n-tabs 无此 prop）：
          默认值 "if" 会卸载非激活面板，导致 Monaco 挂载的 DOM 节点被销毁，
          切回后只剩一个空容器、编辑器不可见。改为 "show" 后面板常驻 DOM（v-show 隐藏），
          编辑器实例得以跨 Tab 存活，切回时只需 layout() 修正尺寸。
        -->
        <n-tabs v-model:value="rightTab" type="line" animated size="small" pane-class="right-pane">
          <n-tab-pane name="agentConfig" tab="Agent Config" display-directive="show">
            <AgentConfigForm
              :config="agentConfig"
              :agent-options="agentOptions"
              :agent-type-options="agentTypeOptions"
              :model-options="modelOptions"
              :host-refs="hostRefs"
              @select-agent="selectAgent"
            />
          </n-tab-pane>

          <n-tab-pane name="caseAssert" tab="Case &amp; Assert" display-directive="show">
            <CaseAssertEditor :host-refs="hostRefs" @apply="onApplyCase" @reset="onResetCase" />
          </n-tab-pane>
        </n-tabs>
      </aside>
    </div>

    <footer class="panel panel-bottom">
      <n-tabs v-model:value="bottomTab" type="line" animated size="small" pane-class="bottom-pane">
        <n-tab-pane name="log" tab="Real-time Log">
          <LogPanel :logs="logs" />
        </n-tab-pane>
        <n-tab-pane name="metrics" tab="Metrics">
          <MetricsPanel :metrics="metrics" :pass-rate="passRate" />
        </n-tab-pane>
      </n-tabs>
    </footer>
  </div>
</template>

<script setup>
/**
 * Agent Harness 智能体评测工作台（工作台主体）
 *
 * 技术栈：Vue 3.4+ / NaiveUI 2.38+ / monaco-editor 0.45+ / d3 7.x
 * 数据源：默认联调后端 agent-application（:9900，经 Vite /api 代理）；
 *        后端不可用时自动降级为内置 mock，降级状态在顶栏常驻可见。
 *
 * 注意三处约束：
 *  1. useMessage() 依赖 App.vue 提供的 n-message-provider，
 *     因此本组件必须是 provider 的子组件，不可与 provider 写在同一个组件里；
 *  2. useWorkbench() 返回普通对象，必须解构取值 ——
 *     不解构则 ref 不会暴露到渲染上下文，模板访问会得到 undefined；
 *  3. backend 实例必须在本组件创建后注入 useWorkbench（且只创建一次）：
 *     若两侧各建一份，会出现「顶栏显示已连接、实际取的是 mock」的错位。
 */
import { nextTick, onMounted, watch } from 'vue'
import { NTabPane, NTabs, useMessage } from 'naive-ui'

import TopBar from '@/components/TopBar.vue'
import CaseTree from '@/components/CaseTree.vue'
import ConversationTrace from '@/components/ConversationTrace.vue'
import ExecutionGraph from '@/components/ExecutionGraph.vue'
import AgentConfigForm from '@/components/AgentConfigForm.vue'
import CaseAssertEditor from '@/components/CaseAssertEditor.vue'
import LogPanel from '@/components/LogPanel.vue'
import MetricsPanel from '@/components/MetricsPanel.vue'

import { useWorkbench } from '@/composables/useWorkbench'
import { useBackend } from '@/composables/useBackend'
import { useMonacoEditor } from '@/composables/useMonacoEditor'
import { DEFAULT_SYSTEM_PROMPT } from '@/mock/config'

const message = useMessage()

/**
 * 数据源实例只创建一次并注入 useWorkbench：
 * 顶栏需要展示连接状态，故这里把展示用 ref 一并解构出来。
 */
const backend = useBackend()
const { mode: dataMode, statusText, lastError } = backend

/** 解构：让每个 ref 成为顶层绑定，模板中可自动解包 */
const {
  centerTab, rightTab, bottomTab,
  caseSearch, selectedCaseIds, currentCaseId, currentCase, treeData,
  totalCaseCount, allSelected, partiallySelected,
  handleCheckedKeys, toggleSelectAll, loadCase,
  messages, manualPrompt, running, stepCounter, canStepRun,
  logs, metrics, passRate, currentGraph,
  agentConfig, agentOptions, agentTypeOptions, modelOptions,
  pushLog, selectAgent,
  handleStepRun, handleRunSelected, handleStop, buildReport,
  // 草稿由门面统一持有：组件侧再建一份会出现「写进去、读不到」的两份存储
  getDraft, saveDraft, snapshot,
  bootstrap,
} = useWorkbench(backend)

/* ---------------- Monaco：3 个编辑器统一由本组件托管 ---------------- */
const { hostRefs, initEditors, getValue, setValue, layout, disposeEditors } = useMonacoEditor({
  instances: [
    { key: 'system', language: 'markdown', initial: DEFAULT_SYSTEM_PROMPT },
    { key: 'casePrompt', language: 'markdown' },
    { key: 'assert', language: 'json' },
  ],
})

/** 把当前用例草稿同步进编辑器（保留撤销栈） */
function syncEditorsFromCase() {
  const caseId = currentCaseId.value
  if (!caseId) return
  const d = getDraft(caseId)
  setValue('casePrompt', d.prompt)
  setValue('assert', d.assert)
}

/** 用例切换时同步编辑器内容 */
watch(currentCaseId, () => nextTick(syncEditorsFromCase))

/**
 * 右侧 Tab 由隐藏转可见后必须手动 layout —— automaticLayout 的 ResizeObserver 有延迟，
 * 且 display:none 期间容器尺寸为 0，不修正会出现编辑器高度塌陷。
 * 因面板声明了 display-directive="show"，实例跨 Tab 存活、内容不丢失，故此处只校正尺寸、不回填内容
 * （回填会覆盖用户未点击"应用编辑内容"的临时修改）。
 */
watch(rightTab, (val) => {
  nextTick(() => {
    layout(val === 'caseAssert' ? 'casePrompt' : 'system')
  })
})

/* ---------------- 动作：均在此处接入 message 反馈 ---------------- */
function onRunSelected() {
  const r = handleRunSelected()
  if (!r.ok && r.reason === 'none-selected') message.warning('请先勾选至少一个评测用例')
}

function onStop() {
  const { wasBatch } = handleStop()
  message.info(wasBatch ? '已停止批量评测' : '已停止当前执行')
}

function onStepRun() {
  const r = handleStepRun()
  if (!r.ok && r.reason === 'empty') message.warning('请先输入 Prompt 再执行')
}

/**
 * 重新连接后端：清理本地 token 后重走登录 + 探测。
 * 后端重启或 token 过期（401 会清 token）后，用户无需刷新页面即可恢复。
 */
async function onReconnect() {
  message.loading('正在重连后端…', { duration: 1200 })
  const conn = await backend.connect()
  if (conn.ok) {
    pushLog('info', '后端重连成功，切换到真实数据源')
    await bootstrap()
  } else {
    pushLog('warn', `后端仍不可用：${conn.error}`)
    message.error('重连失败，请确认 agent-application 已启动在 :9900')
  }
}

/** 应用编辑器内容到当前用例草稿（断言非法则不落盘） */
function onApplyCase() {
  const caseId = currentCaseId.value
  if (!caseId) {
    message.warning('请先在左侧选择一个用例')
    return
  }
  const result = saveDraft(caseId, getValue('casePrompt'), getValue('assert'))
  if (!result.ok) {
    pushLog('error', `断言 JSON 解析失败：${result.error}`)
    message.error('断言 JSON 格式不合法，请修正后重试')
    return
  }
  pushLog('info', `Case 断言校验通过，已写入用例 ${caseId}`)
  message.success('已应用编辑内容')
}

function onResetCase() {
  const caseId = currentCaseId.value
  if (!caseId) return
  const d = getDraft(caseId)
  saveDraft(caseId, d.prompt, d.assert)
  syncEditorsFromCase()
  pushLog('warn', `已重置用例 ${caseId} 的编辑内容`)
}

/** 导出报告：写剪贴板，失败则打印到控制台 */
function onExportReport() {
  const report = buildReport(snapshot())
  const json = JSON.stringify(report, null, 2)
  const finish = (ok) => {
    pushLog(ok ? 'info' : 'warn', ok ? '报告已生成并复制到剪贴板' : '剪贴板不可用，报告已打印到控制台')
    if (!ok) console.log(report)
    message.success('评测报告已生成')
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(() => finish(true), () => finish(false))
  } else {
    finish(false)
  }
}

/* ---------------- 生命周期 ---------------- */
onMounted(async () => {
  await initEditors()
  // bootstrap 为异步：内部要登录后端、拉用例/Agent/批次结果，再加载首个用例
  const initialCaseId = await bootstrap()
  await nextTick()
  if (currentCaseId.value === initialCaseId) syncEditorsFromCase()
  // 默认激活的右侧 Tab 可见，补一次 layout 消除 automaticLayout 的首帧延迟
  layout(rightTab.value === 'caseAssert' ? 'casePrompt' : 'system')
})

/**
 * 对外暴露两件事：
 *  · `disposeEditors` —— 真正销毁时释放 Monaco（应用卸载时调用）
 *  · `layoutEditors`  —— **从隐藏回到可见后**补一次 layout
 *
 * 第二条是外壳引入后才需要的：本表面被 `v-show` 隐藏期间容器尺寸为 0，
 * monaco 的 automaticLayout 依赖 ResizeObserver 且有延迟，
 * 不补这一下，切回来编辑器高度会塌陷成一条线且不会自愈。
 */
defineExpose({
  disposeEditors,
  layoutEditors: () => layout(rightTab.value === 'caseAssert' ? 'casePrompt' : 'system'),
})
</script>

<style scoped>
.harness-root {
  display: flex;
  flex-direction: column;
  /* 100%（不是 100vh）：本组件现在是应用外壳里的一个表面，
     外壳侧还有一层 flex 容器。写 100vh 会超出外壳可视高度，底部日志被裁掉。 */
  height: 100%;
  min-height: 640px;
  background: var(--bg-page);
  color: var(--text-main);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  overflow: hidden;
}

.main-body {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 340px;
  gap: 1px;
  background: var(--border-soft);
  min-height: 0;
  overflow: hidden;
}

.panel { background: var(--bg-page); min-width: 0; min-height: 0; }
.panel-center { display: flex; flex-direction: column; overflow: hidden; }
.panel-right { display: flex; flex-direction: column; overflow: hidden; }
.panel-center :deep(.n-tabs-nav),
.panel-right :deep(.n-tabs-nav) { padding: 4px 12px 0; }

.right-pane { overflow: auto; }

.panel-bottom {
  flex: 0 0 190px;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-top: 1px solid var(--border-soft);
  overflow: hidden;
}
.panel-bottom :deep(.n-tabs-nav) { padding: 2px 12px 0; }
.panel-bottom :deep(.n-tabs-pane-wrapper) { height: 100%; }
.bottom-pane { height: 100%; overflow: hidden; }

/* 响应式：窄屏收敛为单列堆叠 */
@media (max-width: 1280px) {
  .main-body { grid-template-columns: 240px minmax(0, 1fr) 300px; }
}
@media (max-width: 1024px) {
  .harness-root { height: auto; overflow: auto; }
  .main-body {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: minmax(280px, auto);
  }
  .panel-right { max-height: 420px; }
  .panel-bottom { flex: 0 0 auto; }
}
</style>
