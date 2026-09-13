<template>
  <!-- ============================================================
       可观测页面（agent-memory OLAP 分析报表，只读）
         · 页头：图标 + 标题 + 四维统计摘要 + 刷新
         · 近 14 天消息量柱状图（user-activity）
         · 角色构成横条（distillation-stats，L0 事件分布）
         · 会话聚合表（session-stats：消息数 / tokens / 活跃时长）
         · Trace 溯源查询（按 traceId 拉完整事件链）
       与 MemoryPage 同款护栏：首次激活才发请求，刷新重拉全部分区。
       ============================================================ -->
  <div class="ob-page">
    <header class="page-head">
      <div class="head-left">
        <span class="head-icon"><AppIcon name="eye" :size="15" /></span>
        <h2 class="head-title">可观测</h2>
        <span class="head-count" :title="SUMMARY_TITLE">{{ statsSummary }}</span>
      </div>
      <div class="head-actions">
        <button class="mini-btn" type="button" :disabled="loading" @click="refresh">
          <AppIcon name="refresh" :size="11" />
          刷新
        </button>
      </div>
    </header>

    <div class="page-body">
      <p v-if="error" class="state is-error">{{ error }}</p>
      <p v-else-if="loading && !loaded" class="state">正在读取可观测数据…</p>

      <template v-else>
        <!-- 活跃时序：近 14 天逐日消息量 -->
        <section class="ob-section">
          <h3 class="sec-title">消息量 · 近 14 天</h3>
          <div class="chart" role="img" aria-label="近 14 天逐日消息量柱状图">
            <div
              v-for="d in activity"
              :key="d.day"
              class="bar-col"
              :title="`${fmtDay(d.day)}：${d.message_count} 条`"
            >
              <div class="bar-track">
                <div class="bar" :style="{ height: barHeight(d.message_count) }" />
              </div>
              <span class="bar-label">{{ dayLabel(d.day) }}</span>
            </div>
          </div>
        </section>

        <div class="ob-grid">
          <!-- 角色构成 -->
          <section class="ob-section">
            <h3 class="sec-title">事件构成 · 按角色</h3>
            <ul v-if="roles.length" class="role-list">
              <li v-for="r in roles" :key="r.role" class="role-row">
                <span class="role-badge" :class="`role-${r.role || 'system'}`">{{ r.role || 'system' }}</span>
                <div class="role-bar-track">
                  <div class="role-bar" :style="{ width: rolePct(r.event_count) }" />
                </div>
                <span class="role-count">{{ fmt(r.event_count) }}</span>
              </li>
            </ul>
            <p v-else class="state">暂无事件。</p>
          </section>

          <!-- Trace 溯源 -->
          <section class="ob-section">
            <h3 class="sec-title">Trace 溯源</h3>
            <form class="trace-form" @submit.prevent="queryTrace">
              <input
                v-model="traceId"
                class="trace-input"
                type="text"
                placeholder="输入 traceId 查询事件链"
                spellcheck="false"
              >
              <button class="mini-btn" type="submit" :disabled="traceLoading || !traceId.trim()">
                {{ traceLoading ? '查询中…' : '查询' }}
              </button>
            </form>
            <p v-if="traceError" class="state is-error">{{ traceError }}</p>
            <ul v-else-if="traceEvents.length" class="mem-list">
              <li v-for="(ev, i) in traceEvents" :key="i" class="mem-card">
                <div class="card-head">
                  <span class="role-badge" :class="`role-${ev.role || 'system'}`">{{ ev.role || 'system' }}</span>
                  <span class="card-meta">session {{ ev.session_id || '—' }}<template v-if="ev.ts"> · {{ fmtTs(ev.ts) }}</template></span>
                </div>
                <p class="card-content is-clamped" :title="ev.content">{{ ev.content }}</p>
              </li>
            </ul>
            <p v-else-if="traceQueried" class="state">该 traceId 没有事件记录。</p>
            <p v-else class="state">输入 L0 日志里的 trace_id（内存页 L0 日志卡片上可见）查看单次调用的完整链路。</p>
          </section>
        </div>

        <!-- 会话聚合 -->
        <section class="ob-section">
          <h3 class="sec-title">会话聚合（{{ sessions.length }} 个会话）</h3>
          <table v-if="sessions.length" class="sess-table">
            <thead>
              <tr>
                <th>会话</th>
                <th class="num">消息数</th>
                <th class="num">Tokens</th>
                <th class="num">活跃时长</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sessions" :key="s.session_id">
                <td class="mono" :title="s.session_id">{{ s.session_id || '(无会话标识)' }}</td>
                <td class="num">{{ fmt(s.message_count) }}</td>
                <td class="num">{{ fmt(s.total_tokens) }}</td>
                <td class="num">{{ fmtDuration(s.active_duration_ms) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="state">还没有会话数据。</p>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * 可观测页面
 *
 * 数据全部来自 agent-memory 的 OLAP 只读报表接口（Arrow/Calcite 分析库，
 * 与运行时 OLTP 严格分离）。与 MemoryPage 的分工：内存页看「记住了什么」，
 * 本页看「跑了多少」—— 规模、时序、构成与单次调用溯源。
 *
 * 两条约束：
 *  1. **首活才拉**：四个接口在页面首次被切到时齐发（一次性报表，无 tab 分治），
 *     刷新时重拉全部 —— 数据量小（逐日聚合 / 会话聚合），齐发无压力。
 *  2. **图表零依赖**：柱状图与构成条用纯 div/SVG 布局手绘，不引图表库 ——
 *     外壳已挂 Monaco 与 d3（评测工作台），可观测页犯不上再背一份。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  fetchDistillationStats, fetchSessionStats,
  fetchTraceEvents, fetchUserActivity,
} from '@/api/memory'
import { ensureBackendAuth } from '@/api/resources'

const SUMMARY_TITLE = '数据源：agent-memory OLAP 分析库（Arrow/Calcite，L0 日志副本）'

const ACTIVITY_DAYS = 14

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const activity = ref([])
const roles = ref([])
const sessions = ref([])

const traceId = ref('')
const traceLoading = ref(false)
const traceQueried = ref(false)
const traceError = ref('')
const traceEvents = ref([])

const props = defineProps({
  /** 该页面是否处于激活状态（外壳 v-show 保活，页面常挂） */
  active: { type: Boolean, default: true },
})

/** 首次激活才发请求（与 MemoryPage / ResourcePage 同款护栏） */
const started = ref(false)
watch(
  () => props.active,
  (v) => {
    if (!v || started.value) return
    started.value = true
    load()
  },
  { immediate: true },
)

/** 页头摘要：L0 事件总数 / 会话数 / 近 14 天消息量 / 角色数 */
const statsSummary = computed(() => {
  if (error.value) return '数据不可用'
  if (!loaded.value) return '点击查看'
  const total = roles.value.reduce((acc, r) => acc + (r.event_count || 0), 0)
  const recent = activity.value.reduce((acc, d) => acc + (d.message_count || 0), 0)
  return `事件 ${fmt(total)} · 会话 ${fmt(sessions.value.length)} · 近${ACTIVITY_DAYS}天 ${fmt(recent)} · 角色 ${roles.value.length}`
})

/* ---- 柱状图：以最大值为满高基准，空值给 2px 保底可见 ---- */
const maxDaily = computed(() => Math.max(1, ...activity.value.map((d) => d.message_count || 0)))
function barHeight(count) {
  const ratio = (count || 0) / maxDaily.value
  return `${Math.max(ratio * 100, count ? 4 : 2)}%`
}
function dayLabel(dayMs) {
  return new Date(dayMs).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
function fmtDay(dayMs) {
  return new Date(dayMs).toLocaleDateString('zh-CN')
}

/* ---- 角色构成：按占比画横条 ---- */
const maxRole = computed(() => Math.max(1, ...roles.value.map((r) => r.event_count || 0)))
function rolePct(count) {
  return `${Math.max(((count || 0) / maxRole.value) * 100, 2)}%`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) throw new Error(`连接后端失败：${auth.error}`)
    const [act, dis, sess] = await Promise.all([
      fetchUserActivity(ACTIVITY_DAYS),
      fetchDistillationStats(),
      fetchSessionStats(),
    ])
    activity.value = Array.isArray(act) ? act : []
    // 角色构成按量降序，稳定展示（后端 groupingBy 顺序不保证）
    roles.value = (Array.isArray(dis) ? dis : []).sort((a, b) => (b.event_count || 0) - (a.event_count || 0))
    // 会话聚合按消息数降序，最活跃的会话排最前
    sessions.value = (Array.isArray(sess) ? sess : [])
      .sort((a, b) => (b.message_count || 0) - (a.message_count || 0))
    loaded.value = true
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

function refresh() {
  load()
}

async function queryTrace() {
  const id = traceId.value.trim()
  if (!id || traceLoading.value) return
  traceLoading.value = true
  traceError.value = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) throw new Error(`连接后端失败：${auth.error}`)
    const rows = await fetchTraceEvents(id)
    traceEvents.value = Array.isArray(rows) ? rows : []
    traceQueried.value = true
  } catch (err) {
    traceError.value = err?.message || '查询失败'
    traceEvents.value = []
  } finally {
    traceLoading.value = false
  }
}

function fmtTs(ts) {
  return typeof ts === 'number' ? new Date(ts).toLocaleString() : '—'
}

function fmtDuration(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  return `${Math.floor(m / 60)}h${m % 60}m`
}

/** 后端字段可能缺失，统一走这里避免界面出现 undefined */
function fmt(v) {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}
</script>

<style scoped>
.ob-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bg-page);
}

/* ---- 页头（与 MemoryPage 同款骨架） ---- */
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.head-left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint-bg);
  color: var(--primary);
}
.head-title { margin: 0; font-size: var(--text-md); font-weight: var(--font-medium); }
.head-count {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.head-actions { display: flex; align-items: center; gap: var(--space-2); flex: 0 0 auto; }

/* ---- 主体 ---- */
.page-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--space-3) var(--space-4); }

.state { margin: 0; padding: var(--space-2) 0; color: var(--text-faint); font-size: var(--text-sm); }
.state.is-error { color: var(--fail); }

.ob-section { margin-bottom: var(--space-4); }
.sec-title {
  margin: 0 0 var(--space-2);
  color: var(--text-sub);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
/* 中部两块并排：窄容器自动换行成纵向 */
.ob-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--space-4);
}
@media (max-width: 1080px) { .ob-grid { grid-template-columns: 1fr; } }

/* ---- 柱状图（纯 div 手绘） ---- */
.chart {
  display: flex;
  align-items: stretch;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}
.bar-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.bar-track {
  flex: 1 1 auto;
  min-height: 88px;
  display: flex;
  align-items: flex-end;
  border-radius: var(--radius-sm);
}
.bar {
  width: 100%;
  min-height: 2px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--primary);
  opacity: 0.75;
  transition: opacity var(--motion-fast) var(--ease-out);
}
.bar-col:hover .bar { opacity: 1; }
.bar-label {
  flex: 0 0 auto;
  text-align: center;
  color: var(--text-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
}

/* ---- 角色构成 ---- */
.role-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-1-5); }
.role-row { display: flex; align-items: center; gap: var(--space-2); }
.role-badge {
  flex: 0 0 auto;
  min-width: 68px;
  text-align: center;
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.role-badge.role-user { border-color: var(--accent-tint-border); background: var(--accent-tint-bg); color: var(--primary); }
.role-badge.role-assistant { border-color: var(--success-tint-border); background: var(--success-tint-bg); color: var(--ok); }
.role-bar-track { flex: 1 1 auto; min-width: 0; height: 8px; border-radius: var(--radius-pill); background: var(--bg-sunken); overflow: hidden; }
.role-bar { height: 100%; border-radius: var(--radius-pill); background: var(--primary); opacity: 0.7; }
.role-count { flex: 0 0 auto; min-width: 40px; text-align: right; color: var(--text-faint); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }

/* ---- Trace 溯源 ---- */
.trace-form { display: flex; gap: var(--space-1-5); margin-bottom: var(--space-2); }
.trace-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  outline: none;
}
.trace-input:focus { border-color: var(--primary); }
.trace-input::placeholder { color: var(--text-faint); font-family: inherit; }

/* 事件卡片 / 徽标：与 MemoryPage 同款 */
.mem-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-1); }
.mem-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}
.mem-card:hover { border-color: var(--border-default); }
.card-head { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.card-meta {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.card-content {
  margin: 0;
  color: var(--text-sub);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  white-space: pre-wrap;
  word-break: break-word;
}
.card-content.is-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---- 会话聚合表 ---- */
.sess-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-elevated);
  font-size: var(--text-xs);
}
.sess-table th, .sess-table td {
  padding: var(--space-1-5) var(--space-2);
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  color: var(--text-sub);
}
.sess-table thead th {
  background: var(--bg-sunken);
  color: var(--text-faint);
  font-weight: var(--font-medium);
}
.sess-table tbody tr:last-child td { border-bottom: 0; }
.sess-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.sess-table .mono { font-family: var(--font-mono); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary); }

/* ---- mini-btn：与资源/内存页同款 ---- */
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.mini-btn:hover:not(:disabled) { background: var(--overlay-hover); color: var(--text-main); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
