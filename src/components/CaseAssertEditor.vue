<template>
  <div class="right-body">
    <div class="field">
      <label class="field-label">Case 输入 Prompt</label>
      <div :ref="hostRefs.casePrompt" class="monaco-host monaco-host-case" />
    </div>

    <div class="field">
      <label class="field-label">预期断言（JSON）</label>
      <div :ref="hostRefs.assert" class="monaco-host monaco-host-assert" />
    </div>

    <div class="field-actions">
      <n-button size="small" secondary type="primary" @click="emit('apply')">
        应用编辑内容
      </n-button>
      <n-button size="small" quaternary @click="emit('reset')">重置</n-button>
    </div>
  </div>
</template>

<script setup>
import { NButton } from 'naive-ui'

defineProps({
  /** Monaco 容器 ref 映射（由父级 useMonacoEditor 提供） */
  hostRefs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['apply', 'reset'])
</script>

<style scoped>
.right-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
}

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-label { font-size: 12px; color: var(--text-sub); }
.field-actions { display: flex; gap: 8px; }

/* Monaco 容器：必须有确定高度，否则编辑器高度为 0 */
.monaco-host {
  width: 100%;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  overflow: hidden;
}
.monaco-host-case { height: 150px; }
.monaco-host-assert { height: 190px; }
</style>
