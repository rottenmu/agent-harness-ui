<template>
  <!-- ============================================================
       工作区选择器（主区域顶栏面包屑的第一段）
       参照 pi-gui 的 topbar：`工作区 / 环境 / 会话名`，其中工作区段可下拉切换。
       本工程没有 worktree 概念，第二段环境位只显示 local，不摆一个点不动的空菜单。
       ============================================================ -->
  <div class="ws-picker" ref="rootRef">
    <button
      class="ws-btn"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :title="activeWorkspace ? `当前工作区：${activeWorkspace.name}（${activeWorkspace.path || '未记录路径'}）` : '未选择工作区'"
      @click="toggle"
    >
      <AppIcon name="folder" :size="11" />
      <span class="ws-btn-name">{{ activeWorkspace?.name || '选择工作区' }}</span>
      <AppIcon name="chevronDown" :size="10" />
    </button>

    <div v-if="open" class="ws-menu" role="menu">
      <div class="ws-menu-head">
        <span>工作区</span>
        <span class="ws-menu-hint">{{ workspaces.length }} 个</span>
      </div>

      <button
        v-for="w in workspaces"
        :key="w.id"
        class="ws-item"
        :class="{ 'is-active': w.id === activeWorkspaceId }"
        type="button"
        role="menuitemradio"
        :aria-checked="w.id === activeWorkspaceId"
        @click="pick(w.id)"
      >
        <span class="ws-item-check">
          <AppIcon v-if="w.id === activeWorkspaceId" name="check" :size="10" />
        </span>
        <span class="ws-item-body">
          <span class="ws-item-name">{{ w.name }}</span>
          <span class="ws-item-path">{{ w.path || '未记录路径' }}</span>
        </span>
      </button>

      <!--
        菜单底部指向设置面板而不是就地放一个「+ 新建」表单：
        添加工作区要填名字与路径，两个输入框塞进这个 240px 宽的下拉里会变成
        一个缩略版的表单；而且"改了清单"这件事本身就属于设置面板的职责范围，
        两处都能改就会出现两套校验逻辑。
      -->
      <div class="ws-menu-foot">
        <button class="ws-foot-btn" type="button" @click="goManage">
          <AppIcon name="settings" :size="11" />
          管理工作区…
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 工作区选择器
 *
 * 关键决策：**它只改「当前工作区」这一个事实**（useWorkspace 单例），
 * 不自己去动会话列表。选择结果通过 activeWorkspaceName 被 usePiSession 消费
 * （新建会话的归属），通过本组件的显示被用户看到 —— 两处读的是同一份状态。
 *
 * 关闭时机用手写 document 监听而不是 naive-ui 的 popover：
 * 本组件挂在 44px 高的顶栏里，popover 的 teleport + 定位计算在这个高度下
 * 容易出现"箭头偏移/贴边翻转"，而这里的菜单是固定向左下展开的简单结构，
 * 自己管 mousedown 更可控（与 SlashMenu 的处理方式一致）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useWorkspace } from '@/composables/useWorkspace'

const emit = defineEmits(['manage'])

const { workspaces, activeWorkspaceId, activeWorkspace, selectWorkspace } = useWorkspace()

const open = ref(false)
const rootRef = ref(null)

function toggle() {
  open.value = !open.value
}

function pick(id) {
  if (selectWorkspace(id).ok) open.value = false
}

function goManage() {
  open.value = false
  emit('manage')
}

/** 点击组件外部即收起：菜单浮在时间线上方，点别处不收起会挡住正文 */
function onDocMouseDown(e) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target)) open.value = false
}

function onDocKeydown(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<style scoped>
.ws-picker { position: relative; flex: 0 0 auto; }

.ws-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 200px;
  height: 22px;
  padding: 0 var(--space-1-5);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.ws-btn:hover { background: var(--overlay-hover); color: var(--text-main); }

.ws-btn-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-menu {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  z-index: 30;
  width: 240px;
  padding: var(--space-1);
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--elevation-menu);
}

.ws-menu-head {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.ws-menu-hint { margin-left: auto; font-variant-numeric: tabular-nums; text-transform: none; letter-spacing: 0; }

.ws-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
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
.ws-item:hover { background: var(--overlay-hover); }
.ws-item.is-active { background: var(--accent-tint-bg); }

.ws-item-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--primary);
}

.ws-item-body { display: flex; flex-direction: column; min-width: 0; }
.ws-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
}
.ws-item.is-active .ws-item-name { color: var(--primary); }
.ws-item-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.ws-menu-foot {
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px solid var(--border-light);
}
.ws-foot-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.ws-foot-btn:hover { background: var(--overlay-hover); color: var(--text-main); }
</style>
