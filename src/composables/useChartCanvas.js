/**
 * Chart.js 按需加载与统一主题。
 *
 * 设计与项目既有做法一致：不把 Chart.js 打进主包，改为动态 import，
 * 图表组件挂载时才拉取；加载失败不影响页面其余部分（图表区降级为提示）。
 *
 * 主题色从 CSS 变量读取不可行（Canvas 无法解析 var()），因此这里维护
 * 一份与 theme-values.css 对齐的字面色值，深/浅色主题各一套。
 */
import { ref, onBeforeUnmount } from 'vue'

/** Chart.js 单例 Promise，避免多个图表组件重复 import。 */
let chartLibPromise = null

/**
 * 动态加载 Chart.js（UMD 式命名导出），失败时返回 null。
 * @returns {Promise<object|null>}
 */
export function loadChartLib() {
  if (!chartLibPromise) {
    chartLibPromise = import('chart.js/auto')
      .then((mod) => mod.default || mod)
      .catch(() => {
        // 允许下次重试（例如网络恢复），而不是永久缓存失败状态
        chartLibPromise = null
        return null
      })
  }
  return chartLibPromise
}

/** 按主题取一套图表配色（与 theme-values.css 的值保持一致）。 */
export function chartPalette(dark) {
  return dark
    ? {
        grid: 'rgba(58, 71, 95, 0.45)',
        tick: '#8b95a8',
        axis: '#2b3138',
        tooltipBg: '#0f1420',
        tooltipBorder: '#2b3138',
        title: '#e5e7eb',
        body: '#cbd5e1',
        throughput: '#4096ff',
        span: '#a78bfa',
        error: '#f87272',
        threshold: '#fbbf24',
      }
    : {
        grid: 'rgba(120, 130, 150, 0.18)',
        tick: '#5f6675',
        axis: '#e3e6ec',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e3e6ec',
        title: '#1f2430',
        body: '#5f6675',
        throughput: '#1677ff',
        span: '#7c5cff',
        error: '#d64545',
        threshold: '#cf8a00',
      }
}

/** 生成 tooltip 的统一样式配置。 */
export function tooltipStyle(p) {
  return {
    backgroundColor: p.tooltipBg,
    borderColor: p.tooltipBorder,
    borderWidth: 1,
    titleColor: p.title,
    bodyColor: p.body,
    padding: 10,
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
  }
}

/**
 * 把一个 canvas 交给 Chart.js 管理：自动创建、随主题重建、卸载时销毁。
 *
 * @param {import('vue').Ref} canvasRef canvas 元素 ref
 * @param {import('vue').Ref<boolean>} isDark 当前是否深色主题
 * @param {() => object|null} buildConfig 返回 Chart 配置；返回 null 表示暂不渲染
 * @returns {{ ready: import('vue').Ref<boolean>, failed: import('vue').Ref<boolean>, redraw: Function }}
 */
export function useChartCanvas(canvasRef, isDark, buildConfig) {
  const ready = ref(false)
  const failed = ref(false)
  let instance = null

  /** 销毁现有实例并重建。 */
  async function redraw() {
    const Chart = await loadChartLib()
    const canvas = canvasRef.value
    if (!canvas) return
    if (!Chart) {
      failed.value = true
      return
    }
    if (instance) {
      instance.destroy()
      instance = null
    }
    const config = buildConfig()
    if (!config) return
    instance = new Chart(canvas, {
      responsive: true,
      maintainAspectRatio: false,
      ...config,
    })
    ready.value = true
  }

  function destroy() {
    if (instance) {
      instance.destroy()
      instance = null
    }
  }

  onBeforeUnmount(destroy)

  return { ready, failed, redraw, destroy }
}
