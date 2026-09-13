<template>
  <!-- ============================================================
       时间线项 —— 五个变体（user / assistant / activity / tool / summary）
       变体名与参照项目 pi-gui 的 `timeline-item.tsx` 对齐，便于日后对照源码。
       ============================================================ -->

  <!-- 用户消息。is-steer 标记「运行中插话」这一投递语义，与排队的 followUp 区分 -->
  <article
    v-if="item.kind === 'user'"
    class="timeline-item timeline-item--user"
    :class="{ 'is-steer': isSteer }"
  >
    <div class="item-head">
      <span class="item-kind">
        <AppIcon name="user" :size="10" />
        User
      </span>
      <span v-if="isSteer" class="steer-tag">steer · 插话</span>
      <span class="item-meta"><span>{{ clock }}</span></span>
    </div>
    <div class="item-body">{{ item.text }}</div>
  </article>

  <!-- 模型推理输出 -->
  <article v-else-if="item.kind === 'assistant'" class="timeline-item timeline-item--assistant">
    <div class="item-head">
      <span class="item-kind"><AppIcon name="sparkle" :size="10" />Agent Thought</span>
      <span class="item-meta">
        <span>{{ clock }}</span>
        <span v-if="item.tokens != null">{{ item.tokens }} tok</span>
        <span v-if="item.durationMs != null">{{ item.durationMs }} ms</span>
        <span v-if="item.cached" class="meta-cache">cache hit</span>
      </span>
    </div>
    <div class="item-body">{{ item.text }}</div>
  </article>

  <!-- 轻量活动行：不是工具调用但确实发生了事（装依赖 / 跑构建 / 起后台进程） -->
  <div
    v-else-if="item.kind === 'activity'"
    class="timeline-item timeline-item--activity"
    :class="{ 'is-error': item.variant === 'error' }"
  >
    <span class="activity-icon">
      <AppIcon :name="item.variant === 'error' ? 'error' : 'activity'" :size="11" />
    </span>
    <span class="activity-label">{{ item.label }}</span>
    <span class="activity-detail">{{ item.detail }}</span>
    <span v-if="item.meta?.durationMs != null" class="item-meta activity-meta">
      {{ item.meta.durationMs }} ms
    </span>
  </div>

  <!-- 工具调用：结构委托给 TimelineToolRow，本组件不重复实现行内布局 -->
  <div v-else-if="item.kind === 'tool'" class="timeline-item timeline-item--tool">
    <TimelineToolRow :item="item" @view-diff="emit('view-diff', $event)" />
  </div>

  <!-- 总结卡：一轮结束时带眉标的结论 -->
  <article v-else-if="item.kind === 'summary'" class="timeline-item timeline-item--summary">
    <div class="summary-eyebrow">{{ item.eyebrow }}</div>
    <div class="item-body">{{ item.text }}</div>
  </article>
</template>

<script setup>
/**
 * 时间线项（5 变体）
 *
 * 为什么把 activity 与 summary 独立成类型，而不是塞进 assistant 正文：
 * 「装依赖 / 跑构建 / 后台任务」这类事件既不是模型的推理，也不是工具调用，
 * 塞进 assistant 正文会与真正的模型输出混为一谈 —— 用户无法判断
 * 哪句话是模型说的、哪句是平台的运行状态。
 *
 * 这里刻意**不做**任何状态推导或格式化以外的事情：所有派生值（状态色、
 * 未读、是否有差异）都由上游准备好，组件是纯展示。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import TimelineToolRow from './TimelineToolRow.vue'
import { DeliverAs } from '@/api/sessionDriver'
import { formatClock } from '@/utils/format'

const props = defineProps({
  /** 时间线项（形状见 api/sessionDriver.js 的类型注释） */
  item: { type: Object, required: true },
})

const emit = defineEmits(['view-diff'])

const isSteer = computed(() => props.item.deliverAs === DeliverAs.STEER)
const clock = computed(() => formatClock(props.item.ts))
</script>

<style scoped>
.timeline-item {
  box-sizing: border-box;
  /*
   * ⚠️ 这行 min-height 是**虚拟滚动的不变式**，不是视觉偏好。
   * ConversationTimeline.vue 的 item-size 必须取到「不超过任一实际高度」的最大值，
   * 也就是这个 28px；两者一旦不一致，n-virtual-list 的渲染窗口估算会失效
   * （调大 → 可视区尾部留白；调小 → 实测行高修正产生正向漂移，滚到底仍有空隙）。
   * 改这里必须同步改 ConversationTimeline.vue 的 ITEM_MIN_H。
   */
  min-height: 28px;
  padding: var(--space-1-5) var(--space-3);
}

/* 行高上限 22px 是密度约束（见 tokens.css 顶部说明）：正文用 snug 行距 + 12px 字号达成 */
.item-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-0-5);
}
.item-kind {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-sub);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  letter-spacing: var(--tracking-wide);
}
.item-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.meta-cache { color: var(--success-tint-border); }

.item-body {
  color: var(--text-main);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---- user ---- */
.timeline-item--user .item-kind { color: var(--text-sub); }
.steer-tag {
  padding: 0 var(--space-1);
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius-xs);
  background: var(--accent-tint-bg);
  color: var(--primary);
  font-size: var(--text-xs);
}

/* ---- assistant ---- */
.timeline-item--assistant .item-kind { color: var(--primary); }

/* ---- activity：紧凑单行，视觉权重低于正文 ---- */
.timeline-item--activity {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-3);
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.activity-icon { display: inline-flex; flex: 0 0 auto; color: var(--text-faint); }
.activity-label {
  flex: 0 0 auto;
  padding: 0 var(--space-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  color: var(--text-sub);
}
.activity-detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}
.activity-meta { margin-left: auto; }

.timeline-item--activity.is-error { color: var(--fail); }
.timeline-item--activity.is-error .activity-icon,
.timeline-item--activity.is-error .activity-label { color: var(--fail); }
.timeline-item--activity.is-error .activity-label {
  border-color: var(--danger-tint-border);
  background: var(--danger-tint-bg);
}

/* ---- summary ---- */
.timeline-item--summary {
  margin: var(--space-1) var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--summary-card-border);
  border-radius: var(--radius-lg);
  background: var(--summary-card-bg);
}
.summary-eyebrow {
  margin-bottom: var(--space-1);
  color: var(--summary-eyebrow);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  letter-spacing: var(--tracking-wide);
}
</style>
