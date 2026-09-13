<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="sitemap" :size="12" />链路拓扑</h3>
      <div class="legend">
        <span v-for="m in legend" :key="m.key" class="lg">
          <i class="sw" :style="{ background: m.color }" />{{ m.label }}
        </span>
      </div>
    </header>

    <div class="tree-tools">
      <button type="button" class="ghost-btn" @click="expandAll">
        <AppIcon name="expand" :size="11" />展开全部
      </button>
      <button type="button" class="ghost-btn" @click="collapseAll">
        <AppIcon name="minus" :size="11" />收起全部
      </button>
      <button v-if="failedId" type="button" class="ghost-btn jump" @click="focusFailed">
        <AppIcon name="bug" :size="11" />定位首个失败节点
      </button>
      <span class="stat">
        共 {{ nodeCount }} 个节点 · {{ roots.length }} 条根链路
        <template v-if="failedCount"> · <b class="bad">{{ failedCount }} 个失败</b></template>
      </span>
    </div>

    <div class="tree-body">
      <p v-if="!roots.length" class="state">{{ emptyText }}</p>
      <ul v-else class="tree">
        <SpanNode
          v-for="n in roots"
          :key="n.id"
          :node="n"
          :depth="0"
          :expanded="expanded"
          :selected="selectedId"
          @toggle="toggle"
          @pick="$emit('pick', $event)"
        />
      </ul>
    </div>
  </section>
</template>

<script setup>
/**
 * Span 拓扑树。
 *
 * 后端 `steps` 是扁平列表，树由 `buildSpanTree` 在前端构建（见 useObservability）。
 * 这里只负责渲染 + 展开态管理，节点自身渲染抽到 SpanNode.vue 递归。
 *
 * 默认展开策略：全部展开（链路通常只有数个节点），但保留手动收起能力；
 * 有失败节点时额外提供跳转按钮，直接高亮首个失败节点。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import SpanNode from './SpanNode.vue'
import { STEP_META } from '@/composables/useObservability'

const props = defineProps({
  /** buildSpanTree 的返回：根节点数组 */
  roots: { type: Array, default: () => [] },
  /** 当前选中的节点 id */
  selectedId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['pick'])

const legend = Object.values(STEP_META)

/** 展开节点 id 集合。 */
const expanded = ref(new Set())

/** 收集所有节点 id（含子节点）。 */
function collectIds(nodes, out = []) {
  for (const n of nodes || []) {
    out.push(n.id)
    collectIds(n.children, out)
  }
  return out
}

function expandAll() {
  expanded.value = new Set(collectIds(props.roots))
}
function collapseAll() {
  expanded.value = new Set()
}
function toggle(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

/** 树变化时重置为全展开。 */
watch(() => props.roots, expandAll, { immediate: true })

const nodeCount = computed(() => collectIds(props.roots).length)

/** 首个失败节点（用于跳转）。 */
const failedId = computed(() => {
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.status === 'failed') return n.id
      const hit = walk(n.children)
      if (hit) return hit
    }
    return ''
  }
  return walk(props.roots)
})

const failedCount = computed(() => {
  const walk = (nodes) =>
    (nodes || []).reduce((sum, n) => sum + (n.status === 'failed' ? 1 : 0) + walk(n.children), 0)
  return walk(props.roots)
})

/** 跳转到失败节点：展开其所有祖先并选中。 */
function focusFailed() {
  const path = []
  const walk = (nodes, trail) => {
    for (const n of nodes || []) {
      if (n.status === 'failed') {
        path.push(...trail, n.id)
        return true
      }
      if (walk(n.children, [...trail, n.id])) return true
    }
    return false
  }
  walk(props.roots, [])
  const next = new Set(expanded.value)
  path.forEach((id) => next.add(id))
  expanded.value = next
  if (path.length) emit('pick', { id: path[path.length - 1] })
}

const emptyText = computed(() =>
  props.loading ? '正在读取链路步骤…' : '选择一个链路以查看其执行拓扑',
)
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
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
}
.legend { display: flex; align-items: center; gap: 11px; font-size: 10.5px; color: var(--text-sub); flex-wrap: wrap; }
.lg { display: inline-flex; align-items: center; gap: 4px; }
.sw { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

.tree-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
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
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
}
.ghost-btn:hover { color: var(--text-main); border-color: var(--primary); }
.ghost-btn.jump { color: var(--fail); border-color: color-mix(in srgb, var(--fail) 45%, transparent); }
.stat { margin-left: auto; font-size: 11px; color: var(--text-faint); }
.stat b.bad { color: var(--fail); }

.tree-body { padding: 8px 6px 12px; overflow: auto; max-height: 420px; }
.tree { list-style: none; margin: 0; padding: 0; }
.state {
  margin: 0;
  padding: 30px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
