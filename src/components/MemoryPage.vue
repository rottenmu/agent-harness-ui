<template>
  <!-- ============================================================
       内存页面（agent-memory 四层记忆的可视化，只读）
         · 页头：图标 + 标题 + 五维统计摘要 + 刷新
         · 分层以 tab 形式展示：L3 人格 / L2 画像 / L1 会话 / L0 日志
           + 全局记忆 + 策略（后两层不属于金字塔分层，但同属一个模块的视图）
         · 每个 tab 首次激活才拉数据 —— 页面挂载即六个接口齐发是浪费
       ============================================================ -->
  <div class="memory-page">
    <header class="page-head">
      <div class="head-left">
        <span class="head-icon"><AppIcon name="summary" :size="15" /></span>
        <h2 class="head-title">内存</h2>
        <span class="head-count" :title="STATS_TITLE">{{ statsSummary }}</span>
      </div>
      <div class="head-actions">
        <button class="mini-btn" type="button" :disabled="current.loading" @click="refresh">
          <AppIcon name="refresh" :size="11" />
          刷新
        </button>
      </div>
    </header>

    <!-- 分层 tab：顺序即记忆金字塔自上而下（L3 → L0），后接两个横向视图 -->
    <div class="tab-bar" role="tablist" aria-label="内存分层">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="tab"
        :class="{ 'is-active': activeTab === t.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === t.key"
        :title="t.desc"
        @click="switchTab(t.key)"
      >
        <span>{{ t.label }}</span>
        <span v-if="tabCount(t) !== null" class="tab-count">{{ tabCount(t) }}</span>
      </button>
    </div>

    <div class="page-body" role="tabpanel" :aria-label="`内存分层：${currentDef.label}`">
      <p class="tab-desc">{{ currentDef.desc }}</p>

      <p v-if="current.error" class="state is-error">{{ current.error }}</p>
      <p v-else-if="current.loading" class="state">正在读取{{ currentDef.label }}…</p>

      <!--
        策略分支必须排在空态判断**之前**：策略 tab 的 rows 恒为空数组
        （它展示的是 policy 对象，不是列表），落进通用空态就永远渲染不出来。
      -->
      <div v-else-if="activeTab === 'policy'" class="policy-block">
        <div class="mem-row">
          <span class="mem-row-label">敏感过滤</span>
          <span class="mem-row-value">{{ policy.sensitiveFiltering ? '开启' : '关闭' }}</span>
        </div>
        <p v-if="policy.sensitiveRules?.length" class="policy-rules">
          <span v-for="r in policy.sensitiveRules" :key="r">{{ r }}</span>
        </p>
        <div class="mem-row">
          <span class="mem-row-label">白名单</span>
          <span class="mem-row-value">
            {{ policy.whitelistEnabled ? `开启 · ${policy.whitelistCategories?.length || 0} 类` : '关闭' }}
          </span>
        </div>
      </div>

      <div v-else-if="!current.rows.length" class="state is-empty">
        <p class="empty-title">{{ currentDef.emptyText }}</p>
      </div>

      <!-- L3 / L2：记忆条目卡片（name + summary + 可展开的 content） -->
      <ul v-else-if="activeTab === 'soul' || activeTab === 'user'" class="mem-list">
        <li v-for="it in current.rows" :key="it.id" class="mem-card">
          <div class="card-head">
            <span class="card-name">{{ it.name || '(未命名)' }}</span>
            <span class="card-meta">
              {{ it.source || '未知来源' }}
              <template v-if="it.version"> · v{{ it.version }}</template>
              <template v-if="it.updatedTs"> · {{ fmtTs(it.updatedTs) }}</template>
            </span>
          </div>
          <p v-if="it.summary" class="card-summary">{{ it.summary }}</p>
          <!-- 长正文默认钳到三行，点击展开：全量铺开会把画像列表变成阅读页 -->
          <p
            class="card-content"
            :class="{ 'is-clamped': !expanded.has(it.id) }"
            @click="toggleExpand(it.id)"
          >{{ it.content }}</p>
        </li>
      </ul>

      <!-- L1：当前会话的业务变量 -->
      <ul v-else-if="activeTab === 'session'" class="mem-list">
        <li v-for="(it, i) in current.rows" :key="it.key || it.id || i" class="mem-card">
          <div class="card-head">
            <span class="card-name">{{ it.key || it.id || '(未命名变量)' }}</span>
            <span v-if="it.updatedTs" class="card-meta">{{ fmtTs(it.updatedTs) }}</span>
          </div>
          <p class="card-content" :class="{ 'is-clamped': !expanded.has(it.key || it.id || i) }" @click="toggleExpand(it.key || it.id || i)">
            {{ it.value ?? it.content ?? '(空值)' }}
          </p>
        </li>
      </ul>

      <!-- L0：原始日志轮次（role 徽标 + 内容 + 时间） -->
      <ul v-else-if="activeTab === 'log'" class="mem-list">
        <li v-for="(it, i) in current.rows" :key="it.trace_id || i" class="mem-card">
          <div class="card-head">
            <span class="role-badge" :class="`role-${it.role || 'system'}`">{{ it.role || 'system' }}</span>
            <span class="card-meta">{{ it.session_id }}<template v-if="it.ts"> · {{ fmtTs(it.ts) }}</template></span>
          </div>
          <p class="card-content" :class="{ 'is-clamped': !expanded.has(it.trace_id || i) }" @click="toggleExpand(it.trace_id || i)">
            {{ it.content }}
          </p>
        </li>
      </ul>

      <!-- 全局记忆：id + 内容（复用 ts desc + id asc 确定性排序） -->
      <ul v-else-if="activeTab === 'global'" class="mem-list">
        <li v-for="g in current.rows" :key="g.id || g.key" class="mem-card">
          <div class="card-head">
            <span class="card-name mono">{{ g.id || g.key }}</span>
            <span v-if="g.ts" class="card-meta">{{ fmtTs(g.ts) }}</span>
          </div>
          <p class="card-content" :class="{ 'is-clamped': !expanded.has(g.id || g.key) }" @click="toggleExpand(g.id || g.key)">
            {{ g.content }}
          </p>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
/**
 * 内存页面
 *
 * 与 ResourcePage 的分工差异：资源页有创建/删除（CRUD），内存页是**纯只读视图**
 * —— agent-memory 的写入由运行时蒸馏与配置产生，前端不提供第二写入口。
 *
 * 三条约束：
 *  1. **tab 惰性加载**：六个视图六个接口，页面被切到时只拉 stats + 当前 tab；
 *     其余 tab 首次激活才发请求（`store[k].loaded` 护栏）。
 *  2. **计数先于数据**：tab 上的条数徽标来自 stats（一次请求覆盖 L3/L2/L0 三个
 *     计数），不必等每个 tab 各自加载完 —— 用户没点过的 tab 也能看到规模。
 *  3. **确定性排序**：后端列表对同 ts 条目没有 tie-breaker（批量写入共享时间戳），
 *     前端统一补 `(ts desc, id asc)`，见 byRecency / byUpdated。
 */
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  fetchArchConfigs, fetchGlobalMemory, fetchL0Messages,
  fetchMemoryPolicy, fetchMemoryStats, fetchSessionMemory,
} from '@/api/memory'
// 静默登录只在 resources 模块里有一份，凭这里复用而不是再造一次登录流程
import { ensureBackendAuth } from '@/api/resources'
import { usePiSession } from '@/composables/usePiSession'

const STATS_TITLE = '数据源：本机后端 agent-memory（OLTP H2 + OLAP Arrow）；「L1 会话」为当前会话的业务变量条数'

const TABS = [
  { key: 'soul', label: 'L3 人格', desc: 'SOUL 配置 —— 跨会话共享的人格层（最顶层，蒸馏自长期交互）', emptyText: '还没有人格配置。' },
  { key: 'user', label: 'L2 画像', desc: '用户长期记忆 —— 画像 / 偏好 / 历史（按用户维度持久化）', emptyText: '还没有用户画像。' },
  { key: 'session', label: 'L1 会话', desc: '当前会话的业务变量（会话结束即归档，只看当下）', emptyText: '当前会话还没有业务变量。' },
  { key: 'log', label: 'L0 日志', desc: '原始对话轮次 —— OLTP 落库、OLAP 加速查询（金字塔底座）', emptyText: '还没有原始日志。' },
  { key: 'global', label: '全局记忆', desc: '跨会话、跨智能体共享的持久记忆条目', emptyText: '还没有全局记忆条目。' },
  { key: 'policy', label: '策略', desc: '敏感信息过滤与白名单配置（由后端配置决定，此处只读展示）', emptyText: '' },
]

/** 每个加载器返回 `{ rows, total }`；策略返回原始 policy 对象（rows 恒空，模板单独分支） */
const LOADERS = {
  soul: () => fetchArchConfigs('SOUL').then((d) => ({ rows: d.rows || [], total: d.total })),
  user: () => fetchArchConfigs('USER').then((d) => ({ rows: d.rows || [], total: d.total })),
  session: () => fetchSessionMemory(currentSession.value?.id).then((rows) => ({ rows, total: rows.length })),
  log: () => fetchL0Messages().then((d) => ({ rows: d.rows || [], total: d.total })),
  global: () => fetchGlobalMemory(50).then((rows) => ({ rows, total: rows.length })),
  policy: () => fetchMemoryPolicy().then((p) => ({ rows: [], total: null, policy: p })),
}

const { currentSession } = usePiSession()

const props = defineProps({
  /**
   * 该页面是否正处于激活状态（外壳用 v-show 保活，页面常挂）。
   * 只在**首次**激活时发 stats + 当前 tab 的请求。
   */
  active: { type: Boolean, default: true },
})

const activeTab = ref('soul')
const stats = ref(null)
const statsError = ref('')
/** 每个 tab 独立的加载状态仓；未加载过的 tab 保持 loaded:false */
const store = reactive(Object.fromEntries(TABS.map((t) => [t.key, { rows: [], total: null, loading: false, loaded: false, error: '', policy: null }])))

/** 已展开正文的条目 key（长正文默认钳三行，点一下看全量） */
const expanded = reactive(new Set())

const currentDef = computed(() => TABS.find((t) => t.key === activeTab.value) || TABS[0])
const current = computed(() => store[activeTab.value])
const policy = computed(() => current.value.policy || {})

/**
 * 页头统计摘要（来自一次 stats 请求，同时喂给三个 tab 的计数徽标）。
 * 字段名与后端 MemoryArchService.stats() 保持一致，不做重命名。
 */
const statsSummary = computed(() => {
  const s = stats.value
  if (statsError.value) return '统计不可用'
  if (!s) return '点击查看'
  return `日志 ${fmt(s.totalDialogues)} · 画像 ${fmt(s.userProfileCount)} · 人格 ${fmt(s.soulConfigCount)} · 已蒸馏 ${fmt(s.extracted)}`
})

/** tab 计数：能从 stats 预填的先预填，其余等该 tab 自己加载完 */
function tabCount(t) {
  if (t.key === 'soul') return numOrNull(stats.value?.soulConfigCount)
  if (t.key === 'user') return numOrNull(stats.value?.userProfileCount)
  if (t.key === 'log') return numOrNull(stats.value?.totalDialogues)
  const s = store[t.key]
  if (!s.loaded) return null
  if (t.key === 'policy') return s.policy?.sensitiveRules?.length ?? null
  return s.total
}

function numOrNull(v) { return typeof v === 'number' ? v : null }

/** 首次激活才发请求（页面与三个资源页同款护栏） */
const started = ref(false)
watch(
  () => props.active,
  (v) => {
    if (!v || started.value) return
    started.value = true
    loadStats()
    loadTab(activeTab.value)
  },
  { immediate: true },
)

/** 切 tab：目标未加载过才发请求，已加载的直接展示缓存 */
function switchTab(key) {
  activeTab.value = key
  if (!store[key].loaded) loadTab(key)
}

/** 刷新 = 重拉 stats + 当前 tab（其它 tab 的缓存保留，不齐发） */
function refresh() {
  loadStats()
  loadTab(activeTab.value)
}

async function loadStats() {
  statsError.value = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) { statsError.value = `连接后端失败：${auth.error}`; return }
    stats.value = await fetchMemoryStats()
  } catch (err) {
    statsError.value = err?.message || String(err)
  }
}

async function loadTab(key) {
  const s = store[key]
  if (s.loading) return
  s.loading = true
  s.error = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) throw new Error(`连接后端失败：${auth.error}`)
    const data = await (LOADERS[key] || LOADERS.soul)()
    s.rows = sortRows(key, data.rows)
    s.total = data.total
    s.policy = data.policy || null
    s.loaded = true
  } catch (err) {
    s.error = err?.message || '加载失败'
    s.rows = []
  } finally {
    s.loading = false
  }
}

/**
 * 确定性排序：后端对同 ts 条目没有 tie-breaker，底层召回顺序不稳定，
 * 前端统一补 id 字典序 —— 界面顺序只由数据决定，不由底层容器决定。
 * （全局记忆与 L0 日志都吃过多条共享同一时间戳的亏。）
 */
function sortRows(key, rows) {
  if (key === 'policy') return rows
  if (key === 'soul' || key === 'user') return [...rows].sort(byUpdated)
  return [...rows].sort(byRecency)
}

function byRecency(a, b) {
  const d = (b.ts || 0) - (a.ts || 0)
  return d !== 0 ? d : String(a.id || a.trace_id || '').localeCompare(String(b.id || b.trace_id || ''))
}

function byUpdated(a, b) {
  const d = (b.updatedTs || 0) - (a.updatedTs || 0)
  return d !== 0 ? d : String(a.id || '').localeCompare(String(b.id || ''))
}

function toggleExpand(key) {
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
}

function fmtTs(ts) {
  return typeof ts === 'number' ? new Date(ts).toLocaleString() : '—'
}

/** 后端字段可能缺失（模块部分装配），统一走这里，避免界面上出现 undefined */
function fmt(v) {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}
</script>

<style scoped>
.memory-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bg-page);
}

/* ---- 页头（与 ResourcePage 同款骨架） ---- */
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

/* ---- 分层 tab ---- */
.tab-bar {
  display: flex;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border-light);
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
}
.tab:hover { color: var(--text-main); }
.tab.is-active { border-bottom-color: var(--primary); color: var(--text-main); font-weight: var(--font-medium); }
.tab-count {
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--overlay-active);
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.tab.is-active .tab-count { background: var(--accent-tint-bg); color: var(--primary); }

/* ---- 主体 ---- */
.page-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--space-3) var(--space-4); }
.tab-desc { margin: 0 0 var(--space-2); color: var(--text-faint); font-size: var(--text-xs); }

.state { margin: 0; padding: var(--space-4) 0; color: var(--text-faint); font-size: var(--text-sm); }
.state.is-error { color: var(--fail); }
.state.is-empty { padding-top: var(--space-8); text-align: center; }
.empty-title { margin: 0; color: var(--text-sub); font-size: var(--text-base); }

/* ---- 记忆条目卡片 ---- */
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
.card-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.card-name.mono { font-family: var(--font-mono); font-weight: normal; font-size: var(--text-xs); color: var(--primary); }
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

.role-badge {
  flex: 0 0 auto;
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

/* 正文：默认钳三行，点击展开全量 */
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
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
}

/* ---- 策略 ---- */
.policy-block { display: flex; flex-direction: column; gap: var(--space-2); max-width: 560px; }
.mem-row { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); }
.mem-row-label { flex: 0 0 auto; width: 64px; color: var(--text-sub); }
.mem-row-value { min-width: 0; color: var(--text-main); }
/* 规则名是 snake_case 长 token，逐条成标签而不是拼接 —— 整行会被 word-break 拦腰截断 */
.policy-rules { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0 0 0 72px; }
.policy-rules span {
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

/* ---- mini-btn：与资源/设置页同款 ---- */
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
