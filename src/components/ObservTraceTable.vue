<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="list" :size="12" />链路列表</h3>

      <div class="filters">
        <!-- 状态筛选 -->
        <div class="seg" role="group" aria-label="按状态筛选">
          <button
            v-for="s in STATUS_OPTS"
            :key="s.value"
            type="button"
            class="seg-btn"
            :class="{ on: status === s.value }"
            @click="status = s.value"
          >{{ s.label }}</button>
        </div>

        <!-- 类型筛选 -->
        <label class="pick">
          <AppIcon name="layers" :size="11" />
          <select v-model="type" aria-label="按链路类型筛选">
            <option v-for="t in TYPE_OPTS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>

        <!-- 时间范围 -->
        <label class="pick">
          <AppIcon name="clock" :size="11" />
          <select v-model.number="range" aria-label="按时间范围筛选">
            <option v-for="r in RANGE_OPTS" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </label>

        <!-- 关键字 -->
        <label class="pick grow">
          <AppIcon name="search" :size="11" />
          <input v-model.trim="keyword" type="search" placeholder="搜索 Session / Trace / 智能体" aria-label="搜索链路" />
        </label>

        <button type="button" class="ghost-btn" :disabled="!isFiltered" @click="resetFilters">
          <AppIcon name="refresh" :size="11" />重置
        </button>
      </div>
    </header>

    <div class="count-bar">
      <span>共 <b>{{ rows.length }}</b> 条{{ isFiltered ? `（已从 ${total} 条中筛选）` : '' }}</span>
      <span v-if="loading" class="muted">加载中…</span>
      <span v-else-if="!rows.length" class="muted">无匹配链路</span>
    </div>

    <div class="table-wrap">
      <table class="trace-table">
        <thead>
          <tr>
            <th class="w-session">Session ID</th>
            <th class="w-trace">Trace ID</th>
            <th class="w-type">类型</th>
            <th class="w-agent">智能体 / 意图</th>
            <th class="w-num">耗时</th>
            <th class="w-status">状态</th>
            <th class="w-score">质量分</th>
            <th class="w-time">时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td colspan="8" class="empty-cell">
              {{ loading ? '正在读取链路…' : '没有任何链路记录，先在运行时控制台发起一次会话' }}
            </td>
          </tr>
          <tr
            v-for="r in rows"
            :key="r.traceKey"
            class="trace-row"
            :class="{ active: String(activeKey) === String(r.traceKey) }"
            tabindex="0"
            @click="$emit('select', r)"
            @keydown.enter="$emit('select', r)"
          >
            <td class="mono" :title="r.sessionId">{{ shortId(r.sessionId) }}</td>
            <td class="mono strong" :title="r.traceKey">{{ shortId(r.traceKey) }}</td>
            <td><span class="type-chip" :class="`t-${r._type}`">{{ TYPE_LABEL[r._type] }}</span></td>
            <td>
              <div class="cell-stack">
                <span class="ellipsis">{{ r.agentName || '—' }}</span>
                <span class="sub ellipsis" :title="r.intent">{{ r.intent || '无意图标注' }}</span>
              </div>
            </td>
            <td class="num" :style="{ color: latencyColor(r.latencyMs) }">{{ fmtMs(r.latencyMs) }}</td>
            <td>
              <span class="status-chip" :class="r.status === 'failed' ? 'bad' : 'good'">
                <i class="dot-i" />{{ r.status === 'failed' ? '失败' : '成功' }}
              </span>
            </td>
            <td class="num" :style="{ color: scoreColor(r._score) }">{{ fmtScore(r._score) }}</td>
            <td class="time-cell">
              <div class="cell-stack">
                <span>{{ fmtAgo(r.startedAt) }}</span>
                <span class="sub">{{ fmtClock(r.startedAt) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
/**
 * 链路列表（Trace 列表）。
 *
 * 字段全部来自 `/observ/traces` 的真实返回：`sessionId / traceKey / agentName /
 * intent / latencyMs / status / startedAt`。
 *
 * 两处需要注意的**前端派生**（后端不提供，故在组件内计算并如实标注）：
 *  1. 类型（agent_execution / llm_call / tool_call）—— 后端 trace 行没有该字段，
 *     由该链路是否含 tool_call / model_call 步骤推断；列表接口不返回步骤，
 *     因此这里退化为按 `intent` 与响应体特征做**粗判**，仅供快速分类，
 *     精确类型以详情抽屉内的拓扑树为准。
 *  2. 质量分 —— 与 `evaluateTrace` 同一口径的轻量版（失败即扣分），
 *     **不是**后端评分字段。
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { fmtMs, fmtScore, fmtAgo, fmtClock, latencyColor, scoreColor } from '@/composables/observFormat'

const props = defineProps({
  /** /observ/traces 原始行 */
  traces: { type: Array, default: () => [] },
  /** 当前选中链路的 traceKey */
  activeKey: { type: [String, Number], default: '' },
  loading: { type: Boolean, default: false },
})

defineEmits(['select'])

const STATUS_OPTS = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
]

const TYPE_OPTS = [
  { value: 'all', label: '全部类型' },
  { value: 'agent_execution', label: 'Agent 执行' },
  { value: 'llm_call', label: 'LLM 调用' },
  { value: 'tool_call', label: '工具调用' },
]

const RANGE_OPTS = [
  { value: 15, label: '近 15 分钟' },
  { value: 60, label: '近 1 小时' },
  { value: 360, label: '近 6 小时' },
  { value: 0, label: '不限时间' },
]

const TYPE_LABEL = { agent_execution: 'Agent 执行', llm_call: 'LLM 调用', tool_call: '工具调用' }

const status = ref('all')
const type = ref('all')
const range = ref(0)
const keyword = ref('')

/** traceKey 形如 `a1b2c3d4-...`，列表里只留前 8 位，完整值放 title。 */
function shortId(v) {
  const s = String(v || '')
  if (!s) return '—'
  return s.length > 10 ? `${s.slice(0, 8)}…` : s
}

/**
 * 粗判链路类型：列表接口不含步骤，只能从 `intent` 文本与响应特征推断。
 * `intent` 里带工具名/函数名线索的判为 tool_call，带模型名线索的判为 llm_call。
 */
function inferType(row) {
  const text = `${row?.intent || ''} ${row?.agentName || ''}`.toLowerCase()
  if (/tool|function|search|http|api|db|query|retriev/.test(text)) return 'tool_call'
  if (/llm|model|chat|completion|generate/.test(text)) return 'llm_call'
  return 'agent_execution'
}

/** 轻量质量分：失败直接判 0，成功按耗时惩罚，0-1。 */
function quickScore(row) {
  if (row?.status === 'failed') return 0
  const penalty = Math.min(0.25, (Number(row?.latencyMs) || 0) / 60000)
  return Math.max(0, 1 - penalty)
}

/** 时间范围判定：`startedAt` 是不带时区的字面串，按字面解析避免偏移。 */
function withinRange(raw, minutes) {
  if (!minutes) return true
  const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return true
  const then = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return Date.now() - then <= minutes * 60 * 1000
}

const total = computed(() => props.traces.length)

/** 给每行挂上派生字段，避免模板里反复算。 */
const decorated = computed(() =>
  props.traces.map((r) => ({ ...r, _type: inferType(r), _score: quickScore(r) })),
)

const isFiltered = computed(
  () => status.value !== 'all' || type.value !== 'all' || !!range.value || !!keyword.value,
)

const rows = computed(() => {
  const kw = keyword.value.toLowerCase()
  return decorated.value.filter((r) => {
    if (status.value === 'failed' && r.status !== 'failed') return false
    if (status.value === 'success' && r.status === 'failed') return false
    if (type.value !== 'all' && r._type !== type.value) return false
    if (!withinRange(r.startedAt, range.value)) return false
    if (kw) {
      const hay = `${r.sessionId || ''} ${r.traceKey || ''} ${r.agentName || ''} ${r.intent || ''}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

function resetFilters() {
  status.value = 'all'
  type.value = 'all'
  range.value = 0
  keyword.value = ''
}
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
}
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
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
.pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 7px;
  color: var(--text-faint);
  background: var(--bg-sunken);
}
.pick.grow { flex: 1 1 180px; min-width: 150px; }
.pick select,
.pick input {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-main);
  font-size: 11px;
  font-family: inherit;
  width: 100%;
  min-width: 62px;
}
.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  padding: 4px 9px;
  cursor: pointer;
  font-family: inherit;
}
.ghost-btn:hover:not(:disabled) { color: var(--text-main); border-color: var(--primary); }
.ghost-btn:disabled { opacity: 0.42; cursor: not-allowed; }

.count-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  font-size: 11px;
  color: var(--text-sub);
  border-bottom: 1px solid var(--line);
}
.count-bar b { color: var(--text-main); font-weight: 600; }
.muted { color: var(--text-faint); }

.table-wrap { max-height: 340px; overflow: auto; }
.trace-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.trace-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  font-weight: 500;
  color: var(--text-faint);
  background: var(--bg-sunken);
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.trace-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--text-main);
  vertical-align: middle;
}
.trace-row { cursor: pointer; }
.trace-row:hover { background: var(--bg-sunken); }
.trace-row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.trace-row.active { background: color-mix(in srgb, var(--primary) 12%, transparent); }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-sub); }
.mono.strong { color: var(--text-main); }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cell-stack { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cell-stack .sub { font-size: 10.5px; color: var(--text-faint); }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; display: block; }
.time-cell { white-space: nowrap; color: var(--text-sub); }
.time-cell .sub { color: var(--text-faint); }

.type-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.t-agent_execution { color: #4096ff; border-color: color-mix(in srgb, #4096ff 40%, transparent); background: color-mix(in srgb, #4096ff 14%, transparent); }
.t-llm_call { color: #a78bfa; border-color: color-mix(in srgb, #a78bfa 40%, transparent); background: color-mix(in srgb, #a78bfa 14%, transparent); }
.t-tool_call { color: #36d399; border-color: color-mix(in srgb, #36d399 40%, transparent); background: color-mix(in srgb, #36d399 14%, transparent); }

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  white-space: nowrap;
}
.status-chip .dot-i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-chip.good { color: var(--pass); }
.status-chip.good .dot-i { background: var(--pass); }
.status-chip.bad { color: var(--fail); }
.status-chip.bad .dot-i { background: var(--fail); }

.empty-cell {
  text-align: center;
  color: var(--text-faint);
  padding: 34px 10px;
}

@media (max-width: 1100px) {
  .w-agent, .trace-table td:nth-child(4) { display: none; }
}
</style>
