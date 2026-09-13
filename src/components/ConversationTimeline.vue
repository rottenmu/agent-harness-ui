<template>
  <!-- ============================================================
       会话时间线（虚拟滚动容器）
       职责边界：只管「滚动 + 跟随底部 + 空态」，行内渲染全部委托 TimelineItem。
       ============================================================ -->
  <div
    class="timeline-wrap"
    @wheel.passive="markUserGesture"
    @touchmove.passive="markUserGesture"
    @mousedown="handlePointerDown"
  >
    <div v-if="!items.length" class="timeline-empty">
      <AppIcon name="terminal" :size="14" />
      <span>本条会话还没有任何时间线记录 —— 在下方输入 Prompt 按 Enter 起一轮运行。</span>
    </div>

    <!--
      虚拟列表：只渲染可视区间内的项。

      为什么必须虚拟化：一条「十几轮工具调用」的会话就有 300+ 条时间线项，
      全量 v-for 会让 DOM 节点数随轮数线性增长，每来一条新消息都要整树 patch，
      滚动立刻掉帧。长链路在本平台是常态而非极端情况（mock 里的 sess-long 就是
      120 轮 = 361 项）。

      item-resizable 让 vueuc 用 ResizeObserver 实测每条高度，折叠 JSON 展开后
      也能自适应，并在上方行高变化时按 delta 补偿 scrollTop，保证可视内容不跳动。
      item-size 只是初始估算值，取值约束见下方 ITEM_MIN_H。
    -->
    <n-virtual-list
      v-else
      ref="listRef"
      class="timeline-list"
      :items="items"
      :item-size="ITEM_MIN_H"
      item-resizable
      key-field="id"
      @scroll="handleScroll"
    >
      <template #default="{ item }">
        <TimelineItem :item="item" @view-diff="emit('view-diff', $event)" />
      </template>
    </n-virtual-list>
  </div>
</template>

<script setup>
/**
 * 时间线虚拟滚动容器
 *
 * 本文件的四条约束全部来自 `docs/plans/2026-09-10-trace-virtual-scroll.md` 的真机实测结论
 * （那里是在单文件调试平台上验证的，这里只是把同一套写法搬进工程本体），
 * 以及参照项目 pi-gui 的 `conversation-timeline.tsx` 里那条最值钱的教训。
 * 逐条说明「为什么」，是因为每一条都是"看起来可以简化、一简化就静默失效"的类型：
 *
 * 1. **ITEM_MIN_H 必须等于 TimelineItem 的 CSS min-height，且取到不变式允许的最大值。**
 *    naive-ui 2.x 的 itemSize 只接受纯数字（不支持函数），渲染窗口的 endIndex 仍按它估算：
 *      endIndex = startIndex + ceil(listHeight / itemSize + 1)
 *    偏大 → 渲染条数不足 → 可视区尾部留白；一味偏小 → 实测行高修正产生
 *    (实际高度 - itemSize) 的正向漂移，滚到底后仍有明显空隙。取「最小行高」两头都最优。
 *
 * 2. **「用户是否在向上滚」只能认用户手势，不能直接听 scroll。**
 *    虚拟列表实测行高后会自行调整内容高度与 scrollTop，这类布局驱动的 scroll
 *    若参与判定，跟随模式会在第一次行高修正后就把自己关掉 —— 现象是"运行中不再自动滚动"，
 *    且**没有任何报错**，极难排查。故用 wheel / touchmove / 拖滚动条开一个 600ms 手势窗口。
 *
 * 3. **贴底必须钉两次。** 第一次滚动时尾部项用的还是估算行高，ResizeObserver 实测后
 *    内容会继续变高，于是又离底部一段距离（实测可达 200px+）。第二次在 160ms 后补钉，
 *    且只在跟随模式仍开启时执行，不会跟用户抢滚动。
 *
 * 4. **切会话要由替换方自己决定滚动位置。** 切会话会让长度 watcher 也触发，
 *    但那是"整体替换"而不是"追加新消息"，语义不同。用 reloading 标志把这一次排除掉。
 *
 * 反过来的取舍：**不复刻 pi-gui 的二分查找 + 实测行高数组**。
 * 那套是为了摆脱第三方依赖（Electron 对包体敏感）；我们在浏览器里已经有 vueuc 的成熟实现，
 * 手写一套只会多出维护面。复刻可观察行为（DOM 节点数与总条数解耦），不复刻算法。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NVirtualList } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import TimelineItem from './TimelineItem.vue'

const props = defineProps({
  /** 时间线项（5 类，形状见 api/sessionDriver.js 的类型注释） */
  items: { type: Array, default: () => [] },
  /** 当前会话 id。变化即视为「整体替换」，由本组件负责归位到最新一条。 */
  sessionId: { type: String, default: '' },
})

const emit = defineEmits(['view-diff'])

/**
 * 单条时间线项的初始估算高度，**必须与 TimelineItem.vue 里 `.timeline-item` 的
 * min-height（28px）相等**。改一处必须改另一处，否则第 1 条约束静默失效。
 */
const ITEM_MIN_H = 28

/** 距底小于该像素仍视为「跟随中」，避免亚像素误差把跟随误判成「用户已上滚」 */
const FOLLOW_THRESHOLD = 24

/** 手势窗口时长：覆盖一次连续滚动，又短到不会把下一次布局修正误判成用户手势 */
const GESTURE_WINDOW = 600

/** 第二次贴底的延迟：等 ResizeObserver 实测完尾部项的新高度 */
const STICK_RETRY_DELAY = 160

const listRef = ref(null)

/** 视口是否贴在底部：只有贴底时才在追加消息后自动跟随，否则保持用户阅读位置 */
const atBottom = ref(true)

/** 「接下来这段时间内的 scroll 事件来自用户手势」 */
let userGesture = false
let gestureTimer = null
let stickTimer = null

/** 是否正在整体替换（切会话）：用它把长度 watcher 的那一次触发排除掉 */
let reloading = false

function markUserGesture() {
  userGesture = true
  clearTimeout(gestureTimer)
  gestureTimer = setTimeout(() => {
    userGesture = false
  }, GESTURE_WINDOW)
}

/**
 * 只有拖动滚动条才代表滚动意图。
 * 直接监听 mousedown 会把「点击工具行展开 JSON」也误判成滚动意图 —— 展开同样会改变高度。
 */
function handlePointerDown(e) {
  const target = e.target
  if (target && typeof target.closest === 'function' && target.closest('.n-scrollbar-rail')) {
    markUserGesture()
  }
}

/**
 * 维护「是否贴底」。只在用户手势窗口内更新 —— 布局驱动的 scroll 不参与判定，
 * 否则跟随模式会在第一次行高修正后自动关闭，运行中就不再滚动了。
 */
function handleScroll(e) {
  if (!userGesture) return
  const el = e.target
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD
}

/**
 * 把视口钉到底部。
 *
 * 用组件暴露的 `scrollTo({ position: 'bottom' })` 而不是改 DOM 的 scrollTop：
 * 真正的滚动容器是虚拟列表内部的 `.v-vl`（外套 n-scrollbar），外部拿不到稳定引用。
 * `position: 'bottom'` 内部走 scrollToPosition(0, MAX_SAFE_INTEGER) 由浏览器钳制，
 * 不需要预先知道 scrollHeight（虚拟列表的内容高度本来就只是估算值 + 实测修正）。
 */
function stickToBottom() {
  nextTick(() => {
    listRef.value?.scrollTo({ position: 'bottom' })
    clearTimeout(stickTimer)
    stickTimer = setTimeout(() => {
      if (atBottom.value) listRef.value?.scrollTo({ position: 'bottom' })
    }, STICK_RETRY_DELAY)
  })
}

/** 切会话：整体替换，跟着最新一条走（约束 4） */
watch(
  () => props.sessionId,
  () => {
    reloading = true
    atBottom.value = true
    stickToBottom()
    nextTick(() => {
      reloading = false
    })
  },
)

/**
 * 追加新项后滚到底。
 * 只在「原本就贴底」或「时间线由空变非空」时跟随 —— 否则用户正在向上翻阅历史，
 * 每来一条新消息就被拽回底部，长链路下这个面板根本没法读。
 */
watch(
  () => props.items.length,
  (len, prev) => {
    if (reloading) return
    if (prev !== 0 && !atBottom.value) return
    stickToBottom()
  },
)

onBeforeUnmount(() => {
  clearTimeout(gestureTimer)
  clearTimeout(stickTimer)
})
</script>

<style scoped>
.timeline-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.timeline-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--border-heavy);
  border-radius: var(--radius-lg);
  color: var(--text-faint);
  font-size: var(--text-sm);
}

/* 滚动交给虚拟列表自己管（内部 .v-vl + n-scrollbar）。这里再留 overflow:auto
   会出现双滚动条，且外层容器会先把手势吃掉，跟随判定拿不到事件。 */
.timeline-list {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
</style>
