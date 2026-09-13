<template>
  <div class="pane-col">
    <div class="pane-head">
      <div class="pane-head-info">
        <span class="case-name">{{ caseMeta?.label || '未选择用例' }}</span>
        <span class="case-path">{{ caseMeta?.path || '请在左侧选择一个用例' }}</span>
      </div>
      <n-tag size="small" :bordered="false" :color="statusTagColor(caseMeta?.status)">
        {{ statusText(caseMeta?.status) }}
      </n-tag>
    </div>

    <!-- 消息列表 -->
    <div ref="scrollRef" class="trace-scroll">
      <n-empty
        v-if="messages.length === 0"
        description="该用例暂无对话记录，可在下方输入 Prompt 并 Step Run"
        class="trace-empty"
      />
      <MessageCard v-for="msg in messages" :key="msg.id" :message="msg" />

      <!-- 运行中指示 -->
      <div v-if="running" class="msg-card msg-running">
        <span class="dot-pulse" />
        <span class="running-text">Agent 正在执行…（第 {{ stepCounter }} 步）</span>
      </div>
    </div>

    <!-- 手动 Prompt + Step Run -->
    <div class="prompt-bar">
      <n-input
        v-model:value="prompt"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        placeholder="输入 Prompt，回车发送（Shift + Enter 换行）…"
        @keydown.enter.exact.prevent="emit('step-run')"
      />
      <n-button type="primary" secondary :disabled="!canStepRun" @click="emit('step-run')">
        Step Run
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { NButton, NEmpty, NInput, NTag } from 'naive-ui'
import MessageCard from './MessageCard.vue'
import { statusTagColor, statusText } from '@/utils/format'

const props = defineProps({
  /** 当前用例元信息（含 path / status） */
  caseMeta: { type: Object, default: null },
  /** 对话消息列表 */
  messages: { type: Array, default: () => [] },
  /** 是否有执行在进行中 */
  running: { type: Boolean, default: false },
  /** 当前步数（运行中指示文案用） */
  stepCounter: { type: Number, default: 0 },
  /** 是否可手动 Step Run */
  canStepRun: { type: Boolean, default: false },
  /** 切换用例时用于强制滚到底的标识 */
  caseKey: { type: String, default: '' },
})

const emit = defineEmits(['step-run'])

/** 输入框内容（v-model 双向绑定） */
const prompt = defineModel('prompt', { type: String, default: '' })

const scrollRef = ref(null)

/** 滚动到底部：新消息追加后调用 */
function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 消息条数变化即跟随滚动（覆盖单步与批量两种写入路径） */
watch(() => props.messages.length, scrollToBottom)

/** 切换用例时重置滚动位置 */
watch(() => props.caseKey, scrollToBottom)

defineExpose({ scrollToBottom })
</script>

<style scoped>
.pane-col { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  flex: 0 0 auto;
}
.pane-head-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.case-name { font-size: 13px; font-weight: 500; }
.case-path { font-size: 12px; color: var(--text-sub); }

.trace-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.trace-empty { margin: 40px 0; }

.msg-running {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-left: 2px solid var(--running);
  border-radius: 8px;
  padding: 10px 12px;
}
.running-text { font-size: 12px; color: var(--running); }
.dot-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--running);
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

.prompt-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-soft);
  background: var(--bg-card);
}
.prompt-bar :deep(.n-input) { flex: 1 1 auto; }
</style>
