<template>
  <!-- 工具调用行：单行承载「折叠箭头 + 工具名 + 等宽参数 + 右侧 muted 元信息」 -->
  <div class="tool-row" :class="{ 'is-fail': item.status === 'fail' }">
    <div class="tool-line" @click="open = !open">
      <span class="tool-caret" :class="{ 'is-open': open }">
        <AppIcon name="chevron" :size="10" />
      </span>

      <span class="tool-name">
        <AppIcon v-if="item.highRisk" name="warn" :size="10" />
        {{ item.name }}
      </span>

      <span class="tool-target">{{ target }}</span>

      <span class="tool-meta">
        <!-- 差异统计：写类工具才有，read/grep 这类不显示 -->
        <!-- 差异统计：写类工具才有，read/grep 这类不显示。
             每一项各自判零 —— 只增不删的补丁渲染出「+142 -0」是纯噪音，
             而「-0」还会让人误以为删除数没统计出来。 -->
        <span v-if="showDiffStat" class="diff-stat">
          <span v-if="item.additions > 0" class="add">+{{ item.additions }}</span>
          <span v-if="item.deletions > 0" class="del">-{{ item.deletions }}</span>
        </span>
        <span v-if="item.result?.elapsedMs != null" class="meta-item">{{ item.result.elapsedMs }} ms</span>
        <!--
          `view in diff` 直接挂在**行上**而不是收进展开区：
          它是「这条改动长什么样」的入口，展开 JSON 只是参数细节 ——
          把它埋进展开区意味着看差异要先展开一次无关的内容，多一步无收益的操作。
          pi-gui 的写类工具行也是把该入口与 +N/-N 放在同一行。
        -->
        <button
          v-if="item.diffPath"
          class="view-diff"
          type="button"
          :title="`在差异侧栏中查看 ${item.diffPath}`"
          @click.stop="emit('view-diff', item.diffPath)"
        >
          <AppIcon name="diff" :size="10" />
          view in diff
        </button>
        <span
          class="tool-status"
          :class="item.status === 'fail' ? 'tone-error' : 'tone-ok'"
          :title="item.status === 'fail' ? '执行失败' : '执行成功'"
        />
      </span>
    </div>

    <div v-if="open" class="tool-detail">
      <div class="detail-col">
        <div class="detail-label">arguments</div>
        <pre class="code-block">{{ pretty(item.args) }}</pre>
      </div>
      <div class="detail-col">
        <div class="detail-label">result</div>
        <pre class="code-block">{{ pretty(item.result) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 工具调用行
 *
 * 三条约束：
 *  1. **元信息（+N/-N、耗时、状态点）必须靠右且 muted** —— 它们用于扫视而非阅读，
 *     与工具名同权重会让整行失去层次。
 *  2. `+N/-N` 只在**有差异统计的工具**上出现。给 read/grep 也渲染 `+0 -0`
 *     会让这个信号失效（每行都有 = 没有信号）。
 *  3. `view in diff` 用 `@click.stop` 单独拦截：它嵌在整行折叠热区里，
 *     不阻止冒泡会连带触发展开/折叠，用户点一次得到两个动作。
 *
 * 差异数据由消息负载给出（`additions` / `deletions` / `diffPath`），
 * 前端**不做 diff 计算** —— 权威来源应是后端，理由见方案第六节第 4 条。
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** 工具类时间线项 */
  item: { type: Object, required: true },
})

const emit = defineEmits(['view-diff'])

const open = ref(false)

/** 目标：优先取文件路径，其次取命令行，最后退回第一个参数值 */
const target = computed(() => {
  const a = props.item.args || {}
  return a.path || a.cmd || a.pattern || Object.values(a)[0] || ''
})

/** 只有真的带了增删数才展示差异统计 */
const showDiffStat = computed(
  () => Number(props.item.additions || 0) > 0 || Number(props.item.deletions || 0) > 0,
)

function pretty(v) {
  if (v === undefined) return '(等待人工审批，尚未执行)'
  try {
    return JSON.stringify(v, null, 2)
  } catch (err) {
    return String(v)
  }
}
</script>

<style scoped>
.tool-row { border-left: 2px solid var(--border-default); padding-left: var(--space-2); }

.tool-line {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  min-width: 0;
  padding: var(--space-0-5) 0;
  cursor: pointer;
}
.tool-line:hover .tool-name { color: var(--text-main); }

.tool-caret {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--text-faint);
  transition: transform var(--motion-fast) var(--ease-out);
}
.tool-caret.is-open { transform: rotate(90deg); }

.tool-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.tool-row.is-fail .tool-name { color: var(--fail); }

.tool-target {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.tool-meta { display: inline-flex; align-items: center; gap: var(--space-2); flex: 0 0 auto; }
.meta-item { color: var(--text-faint); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }

.diff-stat {
  display: inline-flex;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.diff-stat .add { color: var(--diff-added-ink); }
.diff-stat .del { color: var(--diff-removed-ink); }

.tool-status {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-round);
}
.tool-status.tone-ok { background: var(--status-success); }
.tool-status.tone-error { background: var(--status-error); }

/* ---- 展开区 ---- */
.tool-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);
  padding: var(--space-1) 0 var(--space-2);
}
.detail-col { min-width: 0; }
.detail-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: 2px;
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
}
.view-diff {
  display: inline-flex;
  align-items: center;
  gap: var(--space-0-5);
  padding: 0 var(--space-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--primary);
  font-family: inherit;
  font-size: var(--text-xs);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out);
}
.view-diff:hover { background: var(--accent-tint-bg); }

.code-block {
  margin: 0;
  max-height: 168px;
  padding: var(--space-1-5) var(--space-2);
  border: 1px solid var(--code-border);
  border-radius: var(--radius-sm);
  background: var(--code-block-bg);
  color: var(--text-code);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  overflow: auto;
}
</style>
