<template>
  <div class="pane-col">
    <div class="pane-head">
      <div class="pane-head-info">
        <span class="case-name">Agent 执行流</span>
        <span class="case-path">力导向图 · 可拖拽节点 / 滚轮缩放 / 空白处平移</span>
      </div>
      <div class="graph-actions">
        <n-button size="small" quaternary @click="resetZoom">重置视图</n-button>
        <n-button size="small" quaternary @click="relayout">重新布局</n-button>
      </div>
    </div>

    <div class="graph-wrap">
      <svg ref="svgRef" class="graph-svg" />
      <div class="graph-legend">
        <span v-for="lg in legend" :key="lg.label" class="legend-item">
          <i class="legend-dot" :style="{ background: lg.color }" />{{ lg.label }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { NButton } from 'naive-ui'
import { useExecutionGraph } from '@/composables/useExecutionGraph'
import { NODE_COLORS } from '@/theme'
import { LEGEND_ITEMS } from '@/mock/traces'

/** 窗口尺寸变化的防抖延时（viewBox 与力中心需重算） */
const RESIZE_DEBOUNCE_MS = 200

const props = defineProps({
  /** 图数据 { nodes, links } */
  graph: { type: Object, default: null },
  /** 当前中间 Tab（仅 graph 可见时才渲染，否则尺寸为 0） */
  activeTab: { type: String, default: 'trace' },
  /** 重新渲染的触发信号（如用例切换、执行完成） */
  renderKey: { type: [String, Number], default: 0 },
})

const { svgRef, setGraphData, render, relayout, resetZoom } = useExecutionGraph({
  colors: NODE_COLORS,
})

/** 图例：颜色从统一色板取，避免两处硬编码 */
const legend = computed(() =>
  LEGEND_ITEMS.map((item) => ({ ...item, color: NODE_COLORS[item.kind] })),
)

/** 只有当容器可见时才重绘（隐藏时 clientWidth 为 0） */
function renderIfVisible() {
  if (props.activeTab !== 'graph') return
  render()
}

/** 窗口尺寸变化：防抖后重绘（仅当前可见时） */
let resizeTimer = null
function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(renderIfVisible, RESIZE_DEBOUNCE_MS)
}

onMounted(() => {
  renderIfVisible()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  window.removeEventListener('resize', handleResize)
})

/** Tab 切到 graph 时重绘 */
watch(() => props.activeTab, (val) => {
  if (val === 'graph') requestAnimationFrame(() => render())
})

/** 数据变化：同步到 composable 后按可见性渲染 */
watch(
  () => props.graph,
  (val) => {
    setGraphData(val)
    renderIfVisible()
  },
  { immediate: true },
)

/** 外部显式请求重绘（如执行完成） */
watch(() => props.renderKey, renderIfVisible)
</script>

<style scoped>
.pane-col { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2-5) var(--space-3);
  border-bottom: 1px solid var(--border-soft);
  flex: 0 0 auto;
}
.pane-head-info { display: flex; flex-direction: column; gap: var(--space-0-5); min-width: 0; }
.case-name { font-size: var(--text-sm); font-weight: var(--font-medium); }
.case-path { font-size: var(--text-xs); color: var(--text-sub); }

.graph-actions { display: flex; gap: var(--space-1-5); }
.graph-wrap { position: relative; flex: 1 1 auto; min-height: 0; }
.graph-svg { width: 100%; height: 100%; display: block; cursor: move; }

/* 图例浮在画布上：底色必须来自令牌并带透明度，否则切浅色主题时
   会在浅色画布上盖一块深色板（这正是原先写死 rgba(30,34,41,.9) 的后果）。 */
.graph-legend {
  position: absolute;
  left: var(--space-3);
  bottom: var(--space-3);
  display: flex;
  gap: var(--space-3);
  padding: var(--space-1-5) var(--space-2-5);
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--text-sub);
}
.legend-item { display: inline-flex; align-items: center; gap: var(--space-1); }
.legend-dot { width: 8px; height: 8px; border-radius: var(--radius-2xs); }

:deep(.graph-node text) { pointer-events: none; user-select: none; }
</style>
