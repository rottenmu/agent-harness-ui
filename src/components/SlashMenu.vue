<template>
  <!-- 命令面板：浮在 composer 上方，键盘上下 + Enter 选择，Esc 关闭 -->
  <div v-if="items.length" class="slash-menu" role="listbox">
    <div class="slash-menu-head">
      <AppIcon name="terminal" :size="11" />
      <span>{{ title }}</span>
      <span class="slash-menu-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
    </div>

    <button
      v-for="(it, i) in items"
      :key="it.name"
      class="slash-menu-item"
      :class="{ 'is-active': i === activeIndex }"
      type="button"
      role="option"
      :aria-selected="i === activeIndex"
      @mousedown.prevent="emit('select', it)"
      @mouseenter="emit('hover', i)"
    >
      <span class="item-name">{{ it.name }}</span>
      <span class="item-hint">{{ it.hint }}</span>
      <span class="item-detail">{{ it.detail }}</span>
    </button>
  </div>
</template>

<script setup>
/**
 * `/` 命令面板
 *
 * 为什么把模型 / 思考级别 / 工具集的切换收在这里：
 * 原先它们散落在右栏表单中，而「换模型再说一句话」是这个界面里最高频的复合动作；
 * 拆在两处意味着每次都要跨面板移动。收进 composer 后它成为**主控点**。
 *
 * 用 `@mousedown.prevent` 而不是 `@click`：点击前输入框会先失焦，
 * 某些浏览器上失焦会先触发外部关闭逻辑，导致 click 落空。
 */
import AppIcon from './AppIcon.vue'

defineProps({
  /** 已过滤的命令列表 */
  items: { type: Array, default: () => [] },
  /** 键盘高亮项下标 */
  activeIndex: { type: Number, default: 0 },
  /** 面板标题：`/` 技能为 Skills、`@` 智能体为 Agents（同一面板两种触发） */
  title: { type: String, default: 'Commands' },
})

const emit = defineEmits(['select', 'hover'])
</script>

<style scoped>
.slash-menu {
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: calc(100% + var(--space-1));
  z-index: 20;
  padding: var(--space-1);
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--elevation-menu);
}

.slash-menu-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.slash-menu-hint { margin-left: auto; text-transform: none; letter-spacing: 0; }

.slash-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.slash-menu-item.is-active { background: var(--accent-tint-bg); }

.item-name {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--primary);
}
.item-hint { flex: 0 0 auto; font-size: var(--text-sm); color: var(--text-main); }
.item-detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-faint);
}
</style>
