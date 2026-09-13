<template>
  <section class="kpi-grid">
    <article v-for="c in cards" :key="c.key" class="kpi-card">
      <header class="kpi-head">
        <span class="kpi-label">{{ c.label }}</span>
        <AppIcon :name="c.icon" :size="13" :style="{ color: c.accent }" />
      </header>

      <div class="kpi-value-row">
        <span class="kpi-value" :style="{ color: c.color }">{{ c.value }}</span>
        <span v-if="c.unit" class="kpi-unit">{{ c.unit }}</span>
        <span v-if="c.secondary" class="kpi-secondary">{{ c.secondary.value }}</span>
        <span v-if="c.secondary" class="kpi-unit">{{ c.secondary.unit }}</span>
      </div>

      <!-- 质量分用进度条表达，其余用环比说明 -->
      <div v-if="c.bar != null" class="kpi-bar">
        <span :style="{ width: `${Math.min(100, c.bar * 100)}%`, background: c.color }" />
      </div>
      <p v-else class="kpi-foot" :title="c.footTitle">{{ c.foot }}</p>
    </article>
  </section>
</template>

<script setup>
/**
 * 全局指标总览（4 张卡）。
 *
 * 数据来自 `/observ/dashboard` 的 summary 与 trend：
 * - 吞吐量 → trend 各日 calls 求和（后端 summary 未直接给"每小时会话数"）
 * - P99/P90 → 后端只给 avgLatencyMs，故按平均值与失败率**估算**分位并在 tooltip 说明
 * - 错误率 → summary.successRate 取反
 * - 质量分 → 由成功步骤占比推导（与链路评估同一口径）
 *
 * ⚠️ 后端没有真实分位统计，P99/P90 是估算值，界面上以 `≈` 与脚注如实标注，
 * 不做"看起来精确"的伪装。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { fmtNum, fmtMs, fmtScore } from '@/composables/observFormat'

const props = defineProps({
  /** dashboard.summary */
  summary: { type: Object, default: null },
  /** dashboard.trend.days */
  trendDays: { type: Array, default: () => [] },
  /** dashboard.byAgent */
  byAgent: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

/** 近 N 天 calls 合计，作为吞吐量口径。 */
const totalCalls = computed(() =>
  props.trendDays.reduce((sum, d) => sum + (Number(d.calls) || 0), 0),
)

/** 失败率（0-100）。 */
const failRate = computed(() => {
  const s = props.summary
  if (!s) return 0
  if (Number.isFinite(s.failCount) && Number.isFinite(s.totalCalls) && s.totalCalls > 0) {
    return (s.failCount / s.totalCalls) * 100
  }
  return 100 - (Number(s.successRate) || 0)
})

/** 质量分：成功率与平均耗时的综合，0-1。 */
const quality = computed(() => {
  const s = props.summary
  if (!s) return 0
  const okRatio = (Number(s.successRate) || 0) / 100
  const latencyPenalty = Math.min(0.3, (Number(s.avgLatencyMs) || 0) / 100000)
  return Math.max(0, Math.min(1, okRatio * (1 - latencyPenalty)))
})

/** 吞吐量卡。 */
function throughputCard() {
  return {
    key: 'throughput',
    label: `吞吐量 · 近 ${props.trendDays.length || 7} 天调用`,
    icon: 'activity',
    accent: 'var(--primary)',
    color: 'var(--text-main)',
    value: fmtNum(totalCalls.value),
    unit: '次',
    foot: props.byAgent.length
      ? `${props.byAgent.length} 个智能体参与，最高 ${props.byAgent[0].agentName}`
      : '暂无智能体维度数据',
    footTitle: '按 trend.days 的 calls 求和',
  }
}

/** 延迟卡（P90/P99 为估算，tooltip 已说明）。 */
function latencyCard(avg) {
  return {
    key: 'latency',
    label: '响应延迟 · 均值(P90/P99 为估算)',
    icon: 'gauge',
    accent: 'var(--running)',
    color: 'var(--running)',
    value: `≈${fmtMs(Math.round(avg * 2.8))}`,
    unit: 'P99',
    secondary: { value: `≈${fmtMs(Math.round(avg * 1.4))}`, unit: 'P90' },
    foot: `平均 ${fmtMs(avg)}`,
    footTitle: '均值来自后端 avgLatencyMs；P90/P99 按均值倍数估算，后端未提供真实分位',
  }
}

/** 错误率卡。 */
function errorCard(s) {
  return {
    key: 'error',
    label: '错误率 · 失败占比',
    icon: 'error',
    accent: 'var(--fail)',
    color: failRate.value > 5 ? 'var(--fail)' : 'var(--running)',
    value: failRate.value.toFixed(2),
    unit: '%',
    foot: `${fmtNum(s.failCount)} / ${fmtNum(s.totalCalls)} 次失败`,
    footTitle: 'failCount ÷ totalCalls',
  }
}

/** 质量分卡（用进度条表达 0-1 分值）。 */
function qualityCard() {
  return {
    key: 'quality',
    label: '平均质量评分',
    icon: 'sparkle',
    accent: 'var(--pass)',
    color: 'var(--pass)',
    value: fmtScore(quality.value),
    unit: '/ 1.0',
    bar: quality.value,
  }
}

const cards = computed(() => [
  throughputCard(),
  latencyCard(Number(props.summary?.avgLatencyMs) || 0),
  errorCard(props.summary || {}),
  qualityCard(),
])
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.kpi-card {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}
.kpi-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.kpi-label {
  font-size: 11px;
  color: var(--text-sub);
  line-height: 1.4;
}
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.kpi-value {
  font-size: 24px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.kpi-unit {
  font-size: 11px;
  color: var(--text-faint);
}
.kpi-secondary {
  font-size: 14px;
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.kpi-bar {
  margin-top: 10px;
  height: 4px;
  border-radius: 2px;
  background: var(--bg-sunken);
  overflow: hidden;
}
.kpi-bar span {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.kpi-foot {
  margin: 9px 0 0;
  font-size: 11px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
