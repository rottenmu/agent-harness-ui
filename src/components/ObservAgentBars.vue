<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="robot" :size="12" />智能体分布</h3>
      <span class="meta">{{ agents.length }} 个智能体 · 按调用量排序</span>
    </header>

    <p v-if="!agents.length" class="state">所选时间窗内没有智能体调用记录</p>

    <ul v-else class="agent-list">
      <li v-for="a in agents" :key="a.agentName" class="agent-row">
        <span class="a-name" :title="a.agentName">{{ a.agentName || '(未命名)' }}</span>
        <div class="a-bar-track">
          <div class="a-bar" :style="{ width: barWidth(a.calls) }" />
        </div>
        <span class="a-calls">{{ fmtNum(a.calls) }}</span>
        <span class="a-rate" :style="{ color: rateColor(a.successRate) }">
          {{ fmtPct(a.successRate, 1) }}
        </span>
      </li>
    </ul>
  </section>
</template>

<script setup>
/**
 * 智能体分布：按调用量排序的横向条 + 成功率。
 *
 * 后端 `/dashboard` 的 `byAgent` 已按调用量降序返回，但这里仍做一次排序兜底
 * ——后端排序是 SQL 层的 `order by`，一旦实现变动（例如换成聚合后再排序），
 * 界面顺序会静默错乱，成本很低的一道护栏。
 *
 * 条宽以**最大调用量**为满格基准而非总量占比：这样尾部智能体也能看见，
 * 否则一个超大智能体会把其余全部压成像素级细线。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { fmtNum, fmtPct } from '@/composables/observFormat'

const props = defineProps({
  /** dashboard.byAgent: [{ agentName, calls, successRate }] */
  agents: { type: Array, default: () => [] },
})

const sorted = computed(() =>
  [...props.agents].sort((a, b) => (Number(b.calls) || 0) - (Number(a.calls) || 0)).slice(0, 8),
)

/** 供模板直接用（避免 props 解构丢失响应性）。 */
const agents = sorted

const maxCalls = computed(() =>
  Math.max(1, ...sorted.value.map((a) => Number(a.calls) || 0)),
)

function barWidth(calls) {
  const ratio = (Number(calls) || 0) / maxCalls.value
  return `${Math.max(ratio * 100, 3)}%`
}

/** 成功率分色带：>=99 绿、>=95 黄、其余红。 */
function rateColor(rate) {
  const n = Number(rate)
  if (!Number.isFinite(n)) return 'var(--text-faint)'
  if (n >= 99) return 'var(--pass)'
  if (n >= 95) return 'var(--running)'
  return 'var(--fail)'
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
.meta { font-size: 10.5px; color: var(--text-faint); }

.agent-list {
  list-style: none;
  margin: 0;
  padding: 8px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.agent-row {
  display: grid;
  grid-template-columns: minmax(80px, 148px) minmax(0, 1fr) 68px 54px;
  align-items: center;
  gap: 10px;
}
.a-name {
  font-size: 11.5px;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.a-bar-track {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-sunken);
  overflow: hidden;
}
.a-bar {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 55%, transparent));
  transition: width 0.3s ease;
}
.a-calls {
  font-size: 11.5px;
  color: var(--text-main);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.a-rate {
  font-size: 11.5px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.state {
  margin: 0;
  padding: 24px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
