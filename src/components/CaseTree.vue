<template>
  <aside class="panel panel-left">
    <div class="panel-head">
      <span class="panel-title">评测用例</span>
      <n-tag size="small" :bordered="false" type="info">
        {{ selectedIds.length }}/{{ totalCount }}
      </n-tag>
    </div>

    <div class="panel-toolbar">
      <n-input v-model:value="search" size="small" clearable placeholder="搜索套件 / 用例…">
        <template #prefix><AppIcon name="search" :size="14" /></template>
      </n-input>
      <n-checkbox
        :checked="allSelected"
        :indeterminate="partiallySelected"
        @update:checked="emit('toggle-all', $event)"
      >
        <span class="mini-label">全选</span>
      </n-checkbox>
    </div>

    <div class="tree-scroll">
      <n-tree
        block-line
        cascade
        selectable
        expand-on-click
        :data="treeData"
        :checked-keys="selectedIds"
        :selected-keys="currentId ? [currentId] : []"
        :pattern="search"
        :show-irrelevant-nodes="false"
        :render-suffix="renderSuffix"
        @update:checked-keys="emit('update:checkedKeys', $event)"
        @update:selected-keys="handleSelect"
      />
    </div>
  </aside>
</template>

<script setup>
import { h } from 'vue'
import { NCheckbox, NInput, NTag, NTree } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import { STATUS_DOT_COLORS } from '@/theme'

defineProps({
  /** 树的渲染数据（Suite -> Case） */
  treeData: { type: Array, default: () => [] },
  /** 已勾选的用例 key */
  selectedIds: { type: Array, default: () => [] },
  /** 当前激活用例 key */
  currentId: { type: String, default: '' },
  totalCount: { type: Number, default: 0 },
  allSelected: { type: Boolean, default: false },
  partiallySelected: { type: Boolean, default: false },
})

const emit = defineEmits(['update:checkedKeys', 'select', 'toggle-all'])

/** 搜索关键字（双向绑定，过滤交给 NTree 的 pattern） */
const search = defineModel('search', { type: String, default: '' })

/** 树节点后缀：状态色点（idle 不显示） */
function renderSuffix({ option }) {
  const status = option.status
  if (!status || status === 'idle') return null
  return h('span', {
    class: 'node-dot',
    style: { background: STATUS_DOT_COLORS[status] || STATUS_DOT_COLORS.idle },
  })
}

/** 选中节点：上抛给父级决定是否切换用例 */
function handleSelect(keys, options) {
  const opt = Array.isArray(options) ? options[0] : options
  if (opt?.key) emit('select', opt.key)
}
</script>

<style scoped>
.panel-left { display: flex; flex-direction: column; overflow: hidden; }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  flex: 0 0 auto;
}
.panel-title { font-size: 13px; font-weight: 500; }

.panel-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
}
.mini-label { font-size: 12px; color: var(--text-sub); }

.tree-scroll {
  flex: 1 1 auto;
  overflow: auto;
  padding: 6px 8px 12px;
}

/* 状态色点由 renderSuffix 渲染，需穿透 scoped */
:deep(.node-dot) {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-left: 6px;
  vertical-align: middle;
}
</style>
