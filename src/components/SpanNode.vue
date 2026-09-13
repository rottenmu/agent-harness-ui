<template>
  <li class="node" :class="{ failed: node.status === 'failed' }">
    <div
      class="row"
      :class="{ sel: selected === node.id }"
      :style="{ paddingLeft: `${8 + depth * 16}px` }"
      tabindex="0"
      @click="onPick"
      @keydown.enter="onPick"
    >
      <!-- 展开箭头（仅容器节点） -->
      <button
        v-if="node.children.length"
        type="button"
        class="arrow"
        :class="{ open: expanded.has(node.id) }"
        :aria-label="expanded.has(node.id) ? '收起' : '展开'"
        @click.stop="$emit('toggle', node.id)"
      >
        <AppIcon name="chevron" :size="11" />
      </button>
      <span v-else class="arrow-spacer" />

      <span class="type-dot" :style="{ background: meta.color }" />
      <AppIcon :name="meta.icon" :size="12" :style="{ color: meta.color }" />

      <span class="name" :title="node.name">{{ node.name }}</span>
      <!-- 同名兄弟消歧：后端给多轮 ReAct 的步骤起同一串常量名，这里补 #N 区分轮次 -->
      <span v-if="node.dupIndex" class="dup-idx" :title="`同父节点下第 ${node.dupIndex} 个同名步骤`">·#{{ node.dupIndex }}</span>
      <span class="type-chip" :style="{ color: meta.color, borderColor: meta.color }">{{ meta.label }}</span>

      <span v-if="node.status === 'failed'" class="badge-bad">
        <AppIcon name="warn" :size="10" />失败
      </span>

      <span class="spacer" />
      <span class="seq">#{{ node.seq }}</span>
      <span class="latency" :style="{ color: latencyColor(node.latencyMs) }">{{ fmtMs(node.latencyMs) }}</span>
    </div>

    <!-- 递归子节点 -->
    <ul v-if="node.children.length && expanded.has(node.id)" class="children">
      <SpanNode
        v-for="c in node.children"
        :key="c.id"
        :node="c"
        :depth="depth + 1"
        :expanded="expanded"
        :selected="selected"
        @toggle="$emit('toggle', $event)"
        @pick="$emit('pick', $event)"
      />
    </ul>
  </li>
</template>

<script setup>
/**
 * 拓扑树单节点（自递归）。
 *
 * 递归组件在 `<script setup>` 里靠文件名自引用（Vue 3.3+ 支持），
 * 因此这里无需显式注册 `components`。
 *
 * 视觉设计：类型色只用在图标与标签上，行本身保持中性底色，
 * 避免整棵树变成色块拼盘；失败节点整行加红边，是唯一"抢眼"的元素
 * —— 排查链路时第一眼要能定位到它。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { stepMeta } from '@/composables/useObservability'
import { fmtMs, latencyColor } from '@/composables/observFormat'

// 自递归必须显式命名，否则模板里的 <SpanNode> 解析不到
defineOptions({ name: 'SpanNode' })

const props = defineProps({
  /** buildSpanTree 生成的节点 */
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  /** 展开 id 集合（Set） */
  expanded: { type: Object, required: true },
  selected: { type: String, default: '' },
})

const emit = defineEmits(['toggle', 'pick'])

const meta = computed(() => stepMeta(props.node.type))

function onPick() {
  emit('pick', props.node)
}
</script>

<style scoped>
.node { list-style: none; }
.children { list-style: none; margin: 0; padding: 0; position: relative; }
.children::before {
  content: '';
  position: absolute;
  left: 22px;
  top: 0;
  bottom: 4px;
  width: 1px;
  background: var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
}
.row:hover { background: var(--bg-sunken); }
.row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.row.sel {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  box-shadow: inset 2px 0 0 var(--primary);
}
.node.failed > .row { box-shadow: inset 2px 0 0 var(--fail); }
.node.failed > .row.sel { box-shadow: inset 3px 0 0 var(--fail); }

.arrow {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: transform 0.15s ease;
  flex: 0 0 auto;
}
.arrow:hover { color: var(--text-main); background: var(--bg-card); }
.arrow.open { transform: rotate(90deg); }
.arrow-spacer { width: 16px; flex: 0 0 auto; }

.type-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.name {
  font-size: 12px;
  color: var(--text-main);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dup-idx {
  font-size: 10.5px;
  color: var(--running);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}
.type-chip {
  font-size: 10px;
  padding: 0 5px;
  border: 1px solid;
  border-radius: 4px;
  opacity: 0.85;
  white-space: nowrap;
  flex: 0 0 auto;
}
.badge-bad {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--fail);
  background: color-mix(in srgb, var(--fail) 14%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
  flex: 0 0 auto;
}
.spacer { flex: 1 1 auto; }
.seq { font-size: 10.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.latency {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 52px;
  text-align: right;
}
</style>
