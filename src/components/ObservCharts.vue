<template>
  <section class="chart-grid">
    <article class="chart-card">
      <header class="chart-head">
        <h3 class="chart-title"><AppIcon name="activity" :size="12" />调用量时序</h3>
        <div class="legend">
          <span class="lg"><i class="sw" :style="{ background: p.throughput }" />调用次数</span>
          <span class="lg"><i class="sw" :style="{ background: p.span }" />成功率</span>
        </div>
      </header>
      <div class="chart-body">
        <p v-if="failed" class="chart-state">图表库加载失败，请检查网络后刷新</p>
        <canvas v-else ref="throughputCanvas" role="img" aria-label="按天调用量与成功率时序图" />
      </div>
    </article>

    <article class="chart-card">
      <header class="chart-head">
        <h3 class="chart-title"><AppIcon name="warn" :size="12" />错误率趋势</h3>
        <div class="legend">
          <span class="lg"><i class="sw" :style="{ background: p.error }" />错误率</span>
          <span class="lg"><i class="sw dash" :style="{ background: p.threshold }" />阈值 5%</span>
        </div>
      </header>
      <div class="chart-body">
        <p v-if="failed" class="chart-state">图表库加载失败，请检查网络后刷新</p>
        <canvas v-else ref="errorCanvas" role="img" aria-label="按天错误率趋势图，含 5% 告警阈值参考线" />
      </div>
    </article>
  </section>
</template>

<script setup>
/**
 * 图表区：调用量时序 + 错误率趋势。
 *
 * 两个图都基于 `/observ/dashboard` 的 `trend.days`。注意后端返回的日期是
 * **稀疏的**（只包含有调用的天），因此这里做两件事：
 *  1. 按日期升序排序，保证曲线时间轴单调；
 *  2. 日期标签压成 MM-DD，避免长标签在窄屏堆叠。
 *
 * Chart.js 走动态 import（useChartCanvas），加载失败只让图表区降级，
 * 不影响页面其余部分。
 */
import { computed, ref, watch, onMounted } from 'vue'
import AppIcon from './AppIcon.vue'
import { useChartCanvas, chartPalette, tooltipStyle } from '@/composables/useChartCanvas'

const props = defineProps({
  /** trend.days: [{ date, calls, successRate }] */
  days: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})

const p = computed(() => chartPalette(props.isDark))

/** 升序 + 短标签。 */
const series = computed(() => {
  const rows = [...props.days].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return {
    labels: rows.map((d) => String(d.date).slice(5)),
    calls: rows.map((d) => Number(d.calls) || 0),
    rate: rows.map((d) => Number(d.successRate) || 0),
    errRate: rows.map((d) => +(100 - (Number(d.successRate) || 0)).toFixed(2)),
  }
})

/** 让一个 draw 函数复用同一套 scale/tooltip 配置。 */
function baseOptions(extra = {}) {
  const pal = p.value
  return {
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: tooltipStyle(pal) },
    scales: {
      x: {
        grid: { color: pal.grid },
        border: { color: pal.axis },
        ticks: { color: pal.tick, font: { size: 10 }, autoSkip: true, maxRotation: 0 },
      },
      ...extra,
    },
  }
}

const throughputCanvas = ref(null)
const errorCanvas = ref(null)

const { failed, redraw: redrawThroughput, destroy: destroyThroughput } = useChartCanvas(
  throughputCanvas,
  computed(() => props.isDark),
  () => {
    const s = series.value
    if (!s.labels.length) return null
    const pal = p.value
    return {
      type: 'line',
      data: {
        labels: s.labels,
        datasets: [
          {
            label: '调用次数',
            data: s.calls,
            borderColor: pal.throughput,
            backgroundColor: 'transparent',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'y',
          },
          {
            label: '成功率 %',
            data: s.rate,
            borderColor: pal.span,
            backgroundColor: 'transparent',
            borderDash: [5, 3],
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'y1',
          },
        ],
      },
      options: baseOptions({
        y: {
          position: 'left',
          grid: { color: pal.grid },
          border: { color: pal.axis },
          ticks: { color: pal.tick, font: { size: 10 } },
          title: { display: true, text: '调用次数', color: pal.tick, font: { size: 10 } },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          border: { color: pal.axis },
          min: 0,
          max: 100,
          ticks: { color: pal.tick, font: { size: 10 }, callback: (v) => `${v}%` },
        },
      }),
    }
  },
)

const { redraw: redrawError, destroy: destroyError } = useChartCanvas(
  errorCanvas,
  computed(() => props.isDark),
  () => {
    const s = series.value
    if (!s.labels.length) return null
    const pal = p.value
    return {
      type: 'line',
      data: {
        labels: s.labels,
        datasets: [
          {
            label: '错误率 %',
            data: s.errRate,
            borderColor: pal.error,
            backgroundColor: 'transparent',
            tension: 0.34,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: '阈值 5%',
            data: s.labels.map(() => 5),
            borderColor: pal.threshold,
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: baseOptions({
        y: {
          grid: { color: pal.grid },
          border: { color: pal.axis },
          beginAtZero: true,
          ticks: { color: pal.tick, font: { size: 10 }, callback: (v) => `${v}%` },
        },
      }),
    }
  },
)

/** 数据或主题变化时重绘（先销毁再建，避免实例泄漏）。 */
function redrawAll() {
  destroyThroughput()
  destroyError()
  redrawThroughput()
  redrawError()
}

watch(() => [props.days, props.isDark], redrawAll, { deep: true })
onMounted(redrawAll)
</script>

<style scoped>
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.chart-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
}
.legend {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  color: var(--text-sub);
}
.lg { display: inline-flex; align-items: center; gap: 5px; }
.sw { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
.sw.dash {
  height: 0;
  border-top: 2px dashed currentColor;
  width: 12px;
}
.chart-body {
  height: 216px;
  padding: 12px 14px 14px;
}
.chart-state {
  margin: 0;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--text-faint);
}

@media (max-width: 1280px) {
  .chart-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
