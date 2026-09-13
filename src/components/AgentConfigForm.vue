<template>
  <div class="right-body">
    <!--
      执行目标 Agent 是 Step Run 的真实落点，必须放在最前且可改选：
      后端只有部分用例绑定了 agentId，其余用例需要在此手动指定才能发起调用。
    -->
    <div class="field">
      <label class="field-label">执行目标 Agent</label>
      <n-select
        :value="config.agentId || null"
        :options="agentOptions"
        size="small"
        placeholder="选择要调用的智能体"
        @update:value="emit('select-agent', $event)"
      />
    </div>

    <div class="field">
      <label class="field-label">Agent 类型</label>
      <n-select v-model:value="config.agentType" :options="agentTypeOptions" size="small" />
    </div>

    <div class="field">
      <label class="field-label">模型</label>
      <n-select v-model:value="config.model" :options="modelOptions" size="small" />
    </div>

    <!--
      输出语言：后端 /chat 没有 systemPrompt 入参，模型语言行为由 agent 的 persona 决定，
      而库中多个智能体 persona 为空（会按模型默认语言回英文），故在此提供出站约束。
      详见 utils/prompt.js 的说明。
    -->
    <div class="field">
      <label class="field-label">输出语言</label>
      <n-select v-model:value="config.language" :options="languageOptions" size="small" />
    </div>

    <div class="field">
      <label class="field-label">System Prompt</label>
      <div :ref="hostRefs.system" class="monaco-host monaco-host-prompt" />
    </div>

    <div class="field-row">
      <div class="field">
        <label class="field-label">Temperature</label>
        <n-input-number
          v-model:value="config.temperature"
          size="small"
          :min="0"
          :max="2"
          :step="0.1"
          :precision="1"
          @update:value="(v) => (config.temperature = v ?? 0)"
        />
      </div>
      <div class="field">
        <label class="field-label">最大迭代次数</label>
        <n-input-number
          v-model:value="config.maxIterations"
          size="small"
          :min="1"
          :max="50"
          :step="1"
          @update:value="(v) => (config.maxIterations = v ?? 1)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { NInputNumber, NSelect } from 'naive-ui'
import { LANGUAGE_OPTIONS } from '@/utils/prompt'

defineProps({
  /** Agent 配置（reactive 对象，直接双向绑定字段） */
  config: { type: Object, required: true },
  /** 已装配的智能体下拉项（含 agentType / model，供父级回填配置） */
  agentOptions: { type: Array, default: () => [] },
  /** Agent 类型下拉项 */
  agentTypeOptions: { type: Array, default: () => [] },
  /** 模型下拉项 */
  modelOptions: { type: Array, default: () => [] },
  /** 输出语言下拉项（默认取 utils/prompt 的常量） */
  languageOptions: { type: Array, default: () => LANGUAGE_OPTIONS },
  /** Monaco 容器 ref 映射（由父级 useMonacoEditor 提供） */
  hostRefs: { type: Object, default: () => ({}) },
})

/** 改选 Agent 由父级处理：需要同时把类型/模型同步进配置 */
const emit = defineEmits(['select-agent'])
</script>

<style scoped>
.right-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
}

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-label { font-size: 12px; color: var(--text-sub); }

/* Monaco 容器：必须有确定高度，否则编辑器高度为 0 */
.monaco-host {
  width: 100%;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  overflow: hidden;
}
.monaco-host-prompt { height: 180px; }
</style>
