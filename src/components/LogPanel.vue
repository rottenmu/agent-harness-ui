<template>
  <div ref="scrollRef" class="log-scroll">
    <div v-for="(line, i) in logs" :key="i" class="log-line" :class="`log-${line.level}`">
      <span class="log-time">{{ formatTime(line.ts) }}</span>
      <span class="log-level">{{ line.level.toUpperCase() }}</span>
      <span class="log-msg">{{ line.text }}</span>
    </div>
    <div v-if="logs.length === 0" class="log-empty">暂无日志</div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { formatTime } from '@/utils/format'

const props = defineProps({
  /** 日志行：{ level: info|warn|error, text, ts } */
  logs: { type: Array, default: () => [] },
})

const scrollRef = ref(null)

/** 新日志追加后自动滚到底，保持最新一条可见 */
watch(
  () => props.logs.length,
  () =>
    nextTick(() => {
      const el = scrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    }),
)
</script>

<style scoped>
.log-scroll {
  height: 132px;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
}
.log-line { display: flex; gap: 10px; white-space: pre-wrap; word-break: break-word; }
.log-time { color: var(--text-faint); flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.log-level { flex: 0 0 46px; }
.log-msg { flex: 1 1 auto; }
.log-info { color: var(--text-sub); }
.log-info .log-level { color: var(--text-faint); }
.log-warn { color: var(--running); }
.log-error { color: var(--fail); }
.log-empty { color: var(--text-faint); }
</style>
