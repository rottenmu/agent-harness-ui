<template>
  <div class="msg-card" :class="`msg-${message.type.toLowerCase()}`">
    <div class="msg-head">
      <span
        class="msg-type"
        :style="{ color: typeColor, borderColor: typeColor }"
      >{{ message.type }}</span>
      <span class="msg-meta">{{ formatTime(message.timestamp) }}</span>
      <span class="msg-meta">tokens: {{ message.tokens ?? '-' }}</span>
      <span class="msg-meta">
        耗时: {{ message.durationMs != null ? message.durationMs + ' ms' : '-' }}
      </span>
    </div>

    <!-- ToolCall：折叠展示参数与返回 -->
    <n-collapse v-if="message.type === 'ToolCall'" class="msg-collapse" :default-expanded-names="[]">
      <n-collapse-item :name="message.id" :title="`工具调用 · ${message.toolName || 'tool'}`">
        <div class="code-block-label">参数（arguments）</div>
        <pre class="code-block">{{ prettyJson(message.toolArgs) }}</pre>
        <div class="code-block-label">返回（result）</div>
        <pre class="code-block">{{ prettyJson(message.toolResult) }}</pre>
      </n-collapse-item>
    </n-collapse>

    <div v-else class="msg-body">{{ message.content }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'
import { MESSAGE_TYPE_COLORS } from '@/theme'
import { formatTime, prettyJson } from '@/utils/format'

const props = defineProps({
  /** 一条消息：{ id, type, content, timestamp, tokens, durationMs, toolName, toolArgs, toolResult } */
  message: { type: Object, required: true },
})

const typeColor = computed(
  () => MESSAGE_TYPE_COLORS[props.message.type] || MESSAGE_TYPE_COLORS.User,
)
</script>

<style scoped>
.msg-card {
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-left: 2px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: var(--space-2-5) var(--space-3);
}
.msg-user { border-left-color: var(--text-sub); }
.msg-agent { border-left-color: var(--primary); }
.msg-toolcall { border-left-color: var(--pass); }
.msg-error { border-left-color: var(--fail); background: var(--danger-tint-bg); }

.msg-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 6px;
}

.msg-type {
  display: inline-block;
  padding: 1px 7px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}
.msg-meta { font-size: 11px; color: var(--text-sub); font-variant-numeric: tabular-nums; }
.msg-body { font-size: 13px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.msg-collapse { margin-top: 4px; }

.code-block-label { font-size: 11px; color: var(--text-sub); margin: 8px 0 4px; }
.code-block {
  margin: 0;
  padding: var(--space-2) var(--space-2-5);
  background: var(--code-block-bg);
  border: 1px solid var(--code-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--text-code);
  overflow-x: auto;
  white-space: pre;
}
</style>
