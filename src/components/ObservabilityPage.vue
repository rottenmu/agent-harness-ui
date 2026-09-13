<template>
  <!-- ============================================================
       可观测控制台（真实接口驱动）
         · 页头：标题 + 摘要 + 时间窗切换 + 刷新
         · 四张 KPI 卡（吞吐 / 延迟 / 错误率 / 质量分）
         · 调用量时序 + 错误率趋势（Chart.js）
         · 智能体分布（横向条）
         · 链路列表（筛选 + 点击开详情抽屉）
         · 右侧常驻拓扑树 + 步骤详情 + 评估 + 调试台
       ============================================================ -->
  <div class="ob-page">
    <header class="page-head">
      <div class="head-left">
        <span class="head-icon"><AppIcon name="eye" :size="15" /></span>
        <h2 class="head-title">可观测</h2>
        <span class="head-count" :title="SUMMARY_TITLE">{{ statsSummary }}</span>
      </div>
      <div class="head-actions">
        <div class="seg" role="group" aria-label="选择统计时间窗">
          <button
            v-for="d in DAY_OPTS"
            :key="d"
            type="button"
            class="seg-btn"
            :class="{ on: days === d }"
            @click="setDays(d)"
          >{{ d }}天</button>
        </div>
        <button class="mini-btn" type="button" :disabled="loading" @click="refresh">
          <AppIcon name="refresh" :size="11" />刷新
        </button>
      </div>
    </header>

    <div class="page-body">
      <p v-if="error" class="state is-error">{{ error }}</p>
      <p v-else-if="loading && !loaded" class="state">正在读取可观测数据…</p>

      <template v-else>
        <ObservKpiCards :summary="summary" :trend-days="trendDays" :by-agent="byAgent" :loading="loading" />
        <ObservCharts :days="trendDays" :is-dark="isDark" />

        <ObservAgentBars :agents="byAgent" />

        <div class="split">
          <div class="split-main">
            <ObservTraceTable
              :traces="traces"
              :active-key="activeTrace?.traceKey"
              :loading="loading"
              @select="openTrace"
            />
          </div>

          <!-- 右栏：未选链路时显示表头说明，选中后直接内联展示明细 -->
          <div class="split-side">
            <template v-if="!activeTrace">
              <section class="panel">
                <header class="panel-head">
                  <h3 class="panel-title"><AppIcon name="sitemap" :size="12" />链路明细</h3>
                </header>
                <p class="state">在左侧链路列表中点击任意一行，这里会展开该次执行的
                  拓扑树、步骤输入输出、评估结果与异常分析</p>
                <ul class="tip-list">
                  <li>失败链路会自动定位到首个失败节点</li>
                  <li>评估与诊断由前端规则计算，非后端评分</li>
                  <li>点右侧「全屏查看」可在抽屉中获得更宽的工作区</li>
                </ul>
              </section>
            </template>
            <template v-else>
              <div class="side-tools">
                <span class="side-crumb" :title="activeTrace.traceKey">
                  {{ shortKey(activeTrace.traceKey) }}
                </span>
                <button type="button" class="mini-btn" @click="drawerOpen = true">
                  <AppIcon name="expand" :size="11" />全屏查看
                </button>
              </div>
              <p v-if="detailLoading" class="state">正在读取链路步骤…</p>
              <template v-else>
                <ObservSpanTree :roots="spanTree" :selected-id="selectedId" @pick="selected = $event" />
                <ObservStepDetail :node="selected" :token-summary="tokenSummary" :trace="activeTrace" />
                <ObservEvalCard :evaluation="evaluation" />
                <ObservDebugPanel :steps="activeSteps" :trace="activeTrace" :diagnosis="diagnosis" />
              </template>
            </template>
          </div>
        </div>
      </template>
    </div>

    <ObservTraceDrawer
      :open="drawerOpen"
      :trace="activeTrace"
      :steps="activeSteps"
      :span-tree="spanTree"
      :evaluation="evaluation"
      :diagnosis="diagnosis"
      :token-summary="tokenSummary"
      :detail-loading="detailLoading"
      @close="drawerOpen = false"
      @reload="reloadDetail"
    />
  </div>
</template>

<script setup>
/**
 * 可观测控制台。
 *
 * 数据源是 agent-harness 的 ObservController（`/api/biz/ai/observ`），
 * 所有字段口径见 `useObservability` 的头部注释——那里记录了实测确认的
 * 真实返回结构（尤其 trend 是对象而非数组、steps 是扁平列表两点）。
 *
 * 三个需要留意的设计约束：
 *  1. **首活才拉**：外壳用 v-show 保活全部表面，因此必须用 `active` + `started`
 *     护栏，否则应用启动就会对后端打请求（与 MemoryPage / ResourcePage 同款）。
 *  2. **按日聚合不入图**：`/dashboard` 的 trend 是稀疏的（只有有调用的天），
 *     组件内部做升序排序与日期压缩，不在此处补零——补零会伪造出"那天没有调用"
 *     的假象，而实际只是没有数据。
 *  3. **评估/诊断如实标注**：后端没有 evaluation 接口，相关展示由 `evaluateTrace`
 *     与 `diagnoseTrace` 规则化计算，界面与代码注释都写明了这一点。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ObservKpiCards from './ObservKpiCards.vue'
import ObservCharts from './ObservCharts.vue'
import ObservAgentBars from './ObservAgentBars.vue'
import ObservTraceTable from './ObservTraceTable.vue'
import ObservSpanTree from './ObservSpanTree.vue'
import ObservStepDetail from './ObservStepDetail.vue'
import ObservDebugPanel from './ObservDebugPanel.vue'
import ObservEvalCard from './ObservEvalCard.vue'
import ObservTraceDrawer from './ObservTraceDrawer.vue'
import { useObservability } from '@/composables/useObservability'
import { useTheme } from '@/theme'
import { fmtNum, fmtPct, fmtMs } from '@/composables/observFormat'

const props = defineProps({
  /** 该页面是否处于激活状态（外壳 v-show 保活，页面常挂） */
  active: { type: Boolean, default: true },
})

const SUMMARY_TITLE = '数据源：agent-harness ObservController（/api/biz/ai/observ）真实链路数据'
const DAY_OPTS = [7, 14, 30]
const TRACE_LIMIT = 60

const { mode } = useTheme()
const isDark = computed(() => mode.value === 'dark')

const days = ref(7)
const drawerOpen = ref(false)
const selected = ref(null)

const {
  loading, error, loaded, summary, trendDays, byAgent, traces,
  detailLoading, activeTrace, activeSteps, tokenSummary,
  spanTree, evaluation, diagnosis,
  load, selectTrace, clearSelection,
} = useObservability()

/** 首次激活才发请求（与 MemoryPage / ResourcePage 同款护栏）。 */
const started = ref(false)
watch(
  () => props.active,
  (v) => {
    if (!v || started.value) return
    started.value = true
    load(days.value, TRACE_LIMIT)
  },
  { immediate: true },
)

/** 页头摘要：把 summary 压成一行关键数字。 */
const statsSummary = computed(() => {
  if (error.value) return '数据不可用'
  if (!loaded.value || !summary.value) return '点击查看'
  const s = summary.value
  return `调用 ${fmtNum(s.totalCalls)} · 成功 ${fmtPct(s.successRate, 1)} · 均值 ${fmtMs(s.avgLatencyMs)} · 失败 ${fmtNum(s.failCount)}`
})

function refresh() {
  load(days.value, TRACE_LIMIT)
}

function setDays(d) {
  if (days.value === d) return
  days.value = d
  load(d, TRACE_LIMIT)
}

/** 表格行点击 → 拉详情并默认在右栏展示（同时把抽屉的选中态重置）。 */
function openTrace(row) {
  if (!row) return
  if (activeTrace.value?.traceKey === row.traceKey) return
  selected.value = null
  selectTrace(row)
}

/** 抽屉里的重新读取。 */
function reloadDetail() {
  if (activeTrace.value) selectTrace(activeTrace.value)
}

/** 链路 key 太长，右栏面包屑只显示前 10 位。 */
function shortKey(k) {
  const s = String(k || '')
  return s.length > 12 ? `${s.slice(0, 10)}…` : s || '—'
}

/** 父级链路变化时自动选中首个失败节点（或首个非容器节点）。 */
watch(
  () => spanTree.value,
  (tree) => {
    if (!tree?.length) {
      selected.value = null
      return
    }
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.status === 'failed') return n
        const hit = walk(n.children)
        if (hit) return hit
      }
      return null
    }
    selected.value = walk(tree) || tree[0]?.children?.[0] || tree[0]
  },
)

/**
 * 页面切走时关掉抽屉，避免遮罩盖住新表面。
 * 注意不清空选中：切回来时仍在同一节点上，符合"来回对照"的使用习惯。
 */
watch(
  () => props.active,
  (v) => {
    if (!v) drawerOpen.value = false
  },
)

defineExpose({ clearSelection })

const selectedId = computed(() => selected.value?.id || '')</script>

<style scoped>
.ob-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bg-page);
}

/* ---- 页头（与 MemoryPage / ResourcePage 同款骨架） ---- */
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--line);
}
.head-left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary);
  flex: 0 0 auto;
}
.head-title { margin: 0; font-size: 14px; font-weight: 500; color: var(--text-main); }
.head-count {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 9px;
  border: 1px solid var(--line);
  border-radius: 20px;
  color: var(--text-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.head-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }

.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg-btn {
  border: 0;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  padding: 4px 9px;
  cursor: pointer;
  font-family: inherit;
}
.seg-btn + .seg-btn { border-left: 1px solid var(--line); }
.seg-btn:hover { color: var(--text-main); background: var(--bg-sunken); }
.seg-btn.on { background: var(--primary); color: #fff; }

.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.mini-btn:hover:not(:disabled) { color: var(--text-main); background: var(--bg-sunken); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- 主体 ---- */
.page-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--space-3) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.split-main, .split-side { min-width: 0; }
.split-side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; }

.side-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-card);
}
.side-crumb {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.panel-head {
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
}
.state {
  margin: 0;
  padding: 26px 14px 8px;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-faint);
}
.state.is-error { color: var(--fail); padding: var(--space-4); }
.tip-list {
  margin: 0;
  padding: 0 20px 16px 32px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--text-faint);
}

@media (max-width: 1280px) {
  .split { grid-template-columns: minmax(0, 1fr); }
  .split-side { position: static; }
}
</style>
