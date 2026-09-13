<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click.self="close">
      <aside class="drawer" role="dialog" aria-label="链路详情" @keydown.esc="close">
        <header class="head">
          <div class="head-main">
            <h2 class="title"><AppIcon name="sitemap" :size="14" />链路详情</h2>
            <span class="status-chip" :class="trace?.status === 'failed' ? 'bad' : 'good'">
              <i class="dot-i" />{{ trace?.status === 'failed' ? '失败' : '成功' }}
            </span>
            <span v-if="diagnosis" class="dx-chip">
              <AppIcon name="bug" :size="10" />已定位根因
            </span>
          </div>
          <button type="button" class="x" aria-label="关闭" @click="close">
            <AppIcon name="close" :size="14" />
          </button>
        </header>

        <div class="kv-bar">
          <div class="kv"><span class="k">Trace</span><span class="v mono" :title="trace?.traceKey">{{ trace?.traceKey || '—' }}</span></div>
          <div class="kv"><span class="k">Session</span><span class="v mono" :title="trace?.sessionId">{{ trace?.sessionId || '—' }}</span></div>
          <div class="kv"><span class="k">智能体</span><span class="v">{{ trace?.agentName || '—' }}</span></div>
          <div class="kv"><span class="k">耗时</span><span class="v" :style="{ color: latencyColor(trace?.latencyMs) }">{{ fmtMs(trace?.latencyMs) }}</span></div>
          <div class="kv"><span class="k">Token</span><span class="v">{{ fmtNum(tokenSummary?.tokens ?? trace?.tokens) }}</span></div>
          <div class="kv"><span class="k">步骤</span><span class="v">{{ steps.length }} 个</span></div>
        </div>

        <div class="body">
          <p v-if="detailLoading" class="state">正在读取链路步骤…</p>
          <template v-else>
            <ObservSpanTree
              :roots="spanTree"
              :selected-id="selectedId"
              @pick="selected = $event"
            />
            <ObservStepDetail :node="selected" :token-summary="tokenSummary" :trace="trace" />
            <ObservEvalCard :evaluation="evaluation" />
            <ObservDebugPanel :steps="steps" :trace="trace" :diagnosis="diagnosis" />
            <ObservLogPanel :steps="steps" :trace="trace" :token-summary="tokenSummary" />
          </template>
        </div>

        <footer class="foot">
          <button type="button" class="act" @click="$emit('reload')">
            <AppIcon name="refresh" :size="12" />重新读取
          </button>
          <button type="button" class="act" @click="copyTrace">
            <AppIcon name="copy" :size="12" />{{ copied ? '已复制' : '复制 Trace ID' }}
          </button>
          <span class="foot-note">评估与诊断均为前端规则计算，非后端评分</span>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 链路详情抽屉（右侧滑出）。
 *
 * 内容装配：拓扑树 + 步骤详情 + 评估卡 + 调试台 + 日志，五个子组件各管一段，
 * 抽屉本身只负责"装配 + 关闭"。
 *
 * 默认选中节点：链路有失败步骤时自动选中**首个失败节点**，因为点开抽屉的
 * 动机绝大多数是排查；否则选第一个非容器步骤。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ObservSpanTree from './ObservSpanTree.vue'
import ObservStepDetail from './ObservStepDetail.vue'
import ObservEvalCard from './ObservEvalCard.vue'
import ObservDebugPanel from './ObservDebugPanel.vue'
import ObservLogPanel from './ObservLogPanel.vue'
import { fmtMs, fmtNum, latencyColor } from '@/composables/observFormat'

const props = defineProps({
  open: { type: Boolean, default: false },
  trace: { type: Object, default: null },
  steps: { type: Array, default: () => [] },
  spanTree: { type: Array, default: () => [] },
  evaluation: { type: Object, default: null },
  diagnosis: { type: Object, default: null },
  tokenSummary: { type: Object, default: null },
  detailLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'reload'])

const selected = ref(null)
const copied = ref(false)

/** 深度优先找首个失败节点。 */
function firstFailed(nodes) {
  for (const n of nodes || []) {
    if (n.status === 'failed') return n
    const hit = firstFailed(n.children)
    if (hit) return hit
  }
  return null
}

/** 链路或树变化时重置选中项。 */
watch(
  () => [props.open, props.spanTree],
  () => {
    if (!props.open) return
    const failed = firstFailed(props.spanTree)
    selected.value = failed || props.spanTree?.[0]?.children?.[0] || props.spanTree?.[0] || null
  },
  { deep: false },
)

const selectedId = computed(() => selected.value?.id || '')

function close() {
  emit('close')
}

/** 复制 traceKey；剪贴板被拒（非 https/localhost）时降级为不提示成功。 */
async function copyTrace() {
  const text = props.trace?.traceKey
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch {
    copied.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1200;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(940px, 92vw);
  height: 100%;
  background: var(--bg-app, var(--bg-card));
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  animation: slide-in 0.22s ease;
}
@keyframes slide-in {
  from { transform: translateX(24px); opacity: 0.4; }
  to { transform: translateX(0); opacity: 1; }
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  flex: 0 0 auto;
}
.head-main { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-main);
}
.status-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; }
.status-chip .dot-i { width: 6px; height: 6px; border-radius: 50%; }
.status-chip.good { color: var(--pass); }
.status-chip.good .dot-i { background: var(--pass); }
.status-chip.bad { color: var(--fail); }
.status-chip.bad .dot-i { background: var(--fail); }
.dx-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--running);
  background: color-mix(in srgb, var(--running) 13%, transparent);
  border-radius: 20px;
  padding: 2px 8px;
}
.x {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-sub);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.x:hover { color: var(--text-main); border-color: var(--primary); }

.kv-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-sunken);
  flex-wrap: wrap;
  flex: 0 0 auto;
}
.kv { display: flex; align-items: center; gap: 6px; min-width: 0; }
.kv .k { font-size: 10.5px; color: var(--text-faint); }
.kv .v {
  font-size: 11px;
  color: var(--text-main);
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.foot {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 16px;
  border-top: 1px solid var(--line);
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.act {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11.5px;
  padding: 4px 11px;
  cursor: pointer;
  font-family: inherit;
}
.act:hover { color: var(--text-main); border-color: var(--primary); }
.foot-note { margin-left: auto; font-size: 10.5px; color: var(--text-faint); }

.state {
  margin: 0;
  padding: 40px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}

@media (max-width: 720px) {
  .drawer { width: 100vw; }
  .foot-note { display: none; }
}
</style>
