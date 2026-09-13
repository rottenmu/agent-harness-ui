<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">AH</span>
      <span class="brand-title">Agent Harness</span>
      <span class="brand-sep">｜</span>
      <span class="brand-sub">智能体评测工作台</span>
    </div>

    <div class="topbar-actions">
      <!--
        数据源状态必须常驻可见：mock 模式下的评测结论并非真实后端结果，
        不显式标注会让使用者误判。失败原因放进 title，鼠标悬停可见。
        `status-text` 类名保留为稳定观测点（自测计划里按它取顶栏状态文本），
        不要因为改了视觉而把它删掉。
      -->
      <div class="conn" :class="`conn-${mode}`" :title="lastError || statusText">
        <span class="conn-dot" />
        <span class="conn-text status-text">{{ statusText }}</span>
        <n-button
          v-if="mode === 'mock'"
          text
          size="tiny"
          class="conn-retry"
          @click="emit('reconnect')"
        >
          重连后端
        </n-button>
      </div>

      <n-button
        type="primary"
        :loading="running"
        :disabled="selectedCount === 0"
        @click="emit('run')"
      >
        <template #icon><AppIcon name="play" /></template>
        Run Selected ({{ selectedCount }})
      </n-button>

      <n-button :disabled="!running" @click="emit('stop')">
        <template #icon><AppIcon name="stop" /></template>
        Stop
      </n-button>

      <n-button quaternary @click="emit('export')">
        <template #icon><AppIcon name="download" /></template>
        Export Report
      </n-button>
    </div>
  </header>
</template>

<script setup>
import { NButton } from 'naive-ui'
import AppIcon from './AppIcon.vue'

defineProps({
  /** 已勾选用例数（驱动按钮文案与禁用态） */
  selectedCount: { type: Number, default: 0 },
  /** 是否有执行在进行中 */
  running: { type: Boolean, default: false },
  /** 数据源模式：remote | mock */
  mode: { type: String, default: 'remote' },
  /** 连接状态：idle | connecting | online | offline */
  connectionStatus: { type: String, default: 'idle' },
  /** 状态文案（由 useBackend 合成） */
  statusText: { type: String, default: '' },
  /** 最近一次失败原因，作为 title 悬浮提示 */
  lastError: { type: String, default: '' },
})

const emit = defineEmits(['run', 'stop', 'export', 'reconnect'])
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  flex: 0 0 52px;
  padding: 0 var(--space-4);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-soft);
}

.brand { display: flex; align-items: center; gap: var(--space-2); }

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-ink);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  letter-spacing: var(--tracking-wide);
}

.brand-title { font-size: var(--text-md); font-weight: var(--font-medium); }
.brand-sep { color: var(--border-soft); }
.brand-sub { font-size: var(--text-sm); color: var(--text-sub); }
.topbar-actions { display: flex; align-items: center; gap: var(--space-2); }

.conn {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  height: 26px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  color: var(--text-sub);
  cursor: default;
}
.conn-dot {
  width: 6px; height: 6px; border-radius: var(--radius-round);
  background: var(--text-faint);
  flex: 0 0 auto;
}
.conn-remote .conn-dot { background: var(--pass); }
.conn-mock .conn-dot { background: var(--running); }
.conn-mock { border-color: var(--running); color: var(--running); }
.conn-retry { color: var(--primary); margin-left: var(--space-0-5); }
</style>
