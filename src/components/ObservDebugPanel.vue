<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="bug" :size="12" />调试工作台</h3>
      <div class="tabs" role="tablist" aria-label="调试视图切换">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          class="tab"
          :class="{ on: tab === t.value }"
          role="tab"
          :aria-selected="tab === t.value"
          @click="tab = t.value"
        >
          {{ t.label }}
          <span v-if="t.value === 'diagnose' && diagnosis" class="badge">{{ diagnosis.failedCount }}</span>
        </button>
      </div>
    </header>

    <p v-if="!trace" class="state">选择一条链路后可使用状态回放与异常分析</p>

    <template v-else>
      <ObservReplay v-show="tab === 'replay'" :steps="steps" :trace="trace" />
      <ObservDiagnoseCard v-show="tab === 'diagnose'" :diagnosis="diagnosis" />
    </template>
  </section>
</template>

<script setup>
/**
 * 调试工作台：状态回放与异常分析的切换壳。
 *
 * 两者都是独立面板（各自有标题栏与完整内容），因此这里只做 tab 切换，
 * 不把内容内联进来——否则这个组件会同时背两套样式与两套状态，越改越难动。
 *
 * 默认页签：有失败步骤时落在「异常分析」，否则落在「状态回放」。
 * 进这个面板的人，有失败时基本是想知道为什么失败，没失败才会想看过程。
 */
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ObservReplay from './ObservReplay.vue'
import ObservDiagnoseCard from './ObservDiagnoseCard.vue'

const props = defineProps({
  /** 扁平步骤数组 */
  steps: { type: Array, default: () => [] },
  /** 当前链路 */
  trace: { type: Object, default: null },
  /** diagnoseTrace 的返回，无失败步骤时为 null */
  diagnosis: { type: Object, default: null },
})

const TABS = [
  { value: 'replay', label: '状态回放' },
  { value: 'diagnose', label: '异常分析' },
]

const tab = ref('replay')

/** 链路变化时按有无失败决定默认页签。 */
watch(
  () => [props.trace?.traceKey, props.diagnosis],
  () => {
    tab.value = props.diagnosis ? 'diagnose' : 'replay'
  },
  { immediate: true },
)
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
}
.tabs { display: inline-flex; gap: 2px; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
}
.tab:hover { color: var(--text-main); background: var(--bg-sunken); }
.tab.on { background: var(--primary); color: #fff; }
.badge {
  font-size: 9.5px;
  padding: 0 5px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--fail) 18%, transparent);
  color: var(--fail);
  font-variant-numeric: tabular-nums;
}
.tab.on .badge { background: rgba(255, 255, 255, 0.24); color: #fff; }

/* 子面板已在自身内部画了边框，这里把它"贴"进来避免双层边框 */
:deep(.panel) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
:deep(.panel > .panel-head) { display: none; }

.state {
  margin: 0;
  padding: 26px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
