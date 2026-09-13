<template>
  <!-- ============================================================
       应用外壳（Agent Harness）
       左侧是应用级导航 + 会话列表，右侧按「表面」切换内容：
         · console   —— 运行时控制台（默认）
         · workbench —— 智能体评测工作台（既有表面，本期只做统一外壳）
       ============================================================ -->
  <div class="app-shell">
    <SessionSidebar
      v-model:query="query"
      :groups="sidebarGroups"
      :active-id="viewedSessionId || ''"
      :session-count="sessionCount"
      :filtered-count="filteredCount"
      :surface="surface"
      :active-workspace="activeWorkspaceName"
      @select="onSelect"
      @create="onCreate"
      @pin="togglePin"
      @archive="archiveSession"
      @switch-surface="surface = $event"
      @open-settings="settingsOpen = true"
      @open-plugins="pluginsOpen = true"
    />

    <main class="shell-main">
      <!--
        所有表面都用 v-show 而不是 v-if。
        评测工作台里挂着 3 个 Monaco 实例（system / casePrompt / assert）与 d3 画布，
        v-if 卸载会把编辑器实例的宿主 DOM 一起销毁 —— 切回来是一片空白，
        而且**控制台不会报任何错**（这个坑在单文件调试平台里已经踩过一次）。
        代价是隐藏期间布局尺寸为 0，切回来必须补一次 layout，见下面的 watch(surface)。
      -->
      <RuntimeConsole
        v-show="surface === 'console'"
        :active="surface === 'console'"
        @open-settings="settingsOpen = true"
      />

      <HarnessWorkbench v-show="surface === 'workbench'" ref="workbenchRef" />

      <!--
        资源页面（Agents / MCP / Skills）：三个类型一份 ResourcePage，
        差异全在 @/resources/defs 描述表里，不复制三份页面组件。
        列表在页面、创建走弹窗；`:active` 让每个页面只在**首次**被切到时拉一次列表 ——
        三个实例是同时挂载的，不加这个护栏，应用启动就会同时打三次后端。
      -->
      <ResourcePage v-show="surface === 'models'" type="model" :active="surface === 'models'" />
      <ResourcePage v-show="surface === 'agents'" type="agent" :active="surface === 'agents'" />
      <ResourcePage v-show="surface === 'mcp'" type="mcp" :active="surface === 'mcp'" />
      <ResourcePage v-show="surface === 'skills'" type="skill" :active="surface === 'skills'" />
      <ResourcePage v-show="surface === 'datasources'" type="datasource" :active="surface === 'datasources'" />

      <!-- 内存页面：agent-memory 四层记忆的只读视图，分层以 tab 切换（同款惰性加载护栏） -->
      <MemoryPage v-show="surface === 'memory'" :active="surface === 'memory'" />

      <!-- 可观测页面：agent-memory OLAP 报表（时序/构成/聚合/溯源），只读单页 -->
      <ObservabilityPage v-show="surface === 'observability'" :active="surface === 'observability'" />
    </main>

    <!--
      设置面板挂在**外壳**这一层，而不是挂在侧栏或控制台内部：
      它有两个打开入口（侧栏页脚、顶栏工作区菜单里的「管理工作区…」），
      挂到任一入口内部都会让另一条路径依赖前者的组件树，
      而且换成 v-if 卸载后另一处就再也打不开它。
    -->
    <SettingsPanel v-model:show="settingsOpen" />

    <!--
      新增资源的弹窗不挂在壳体这一层：三个资源页面各自带一份（mode="create"）。
      壳体这层曾经也挂过一份，服务侧栏那排「新建XX」快捷按钮 ——
      该排按钮已随资源页面化一并移除，重复的实例也就跟着删了。
    -->

    <!-- 插件清单弹窗（只读，数据源见组件头注释） -->
    <PluginsModal v-model:show="pluginsOpen" />
  </div>
</template>

<script setup>
/**
 * 应用外壳
 *
 * 三条约束：
 *
 * 1. **会话状态不在这里派生。** 本组件只做两件事：把 `usePiSession()` 的
 *    **只读派生量**接到侧栏，把用户动作原样转发回去。任何 `if (unseen && ...)`
 *    之类的判断写在壳里，就等于在 sessionVisibility 之外又立了一处推导源
 *    （那正是参照项目 pi-gui 复盘的事故形态）。
 *
 * 2. **`surface` 是壳的状态，hash 只做镜像。** 两个表面共享同一份运行时会话
 *    上下文（同一个 usePiSession 单例），不拆 vue-router —— 拆路由会各自 mount
 *    一份组件树，极易演变成"两份状态"。但地址栏要能反映当前页面（可收藏、
 *    刷新后停留），所以 surface 与 `#/<surface>` 双向同步：切换即 replaceState，
 *    手改地址/前进后退经 hashchange 也能生效（见下方 surfaceFromHash）。
 *
 * 3. **只有这里能调 `dispose()`。** usePiSession 是单例，子组件卸载时清定时器
 *    会把正在跑的运行掐掉（切一次表面就复现）。真正的退出点只有应用卸载。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { nextTick } from 'vue'
import SessionSidebar from '@/components/SessionSidebar.vue'
import RuntimeConsole from '@/components/RuntimeConsole.vue'
import HarnessWorkbench from '@/components/HarnessWorkbench.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import PluginsModal from '@/components/PluginsModal.vue'
import ResourcePage from '@/components/ResourcePage.vue'
import MemoryPage from '@/components/MemoryPage.vue'
import ObservabilityPage from '@/components/ObservabilityPage.vue'
import { usePiSession } from '@/composables/usePiSession'
import { useWorkspace } from '@/composables/useWorkspace'

const {
  query, sidebarGroups, viewedSessionId, sessionCount, filteredCount,
  selectSession, createSession, togglePin, archiveSession, dispose,
} = usePiSession()

/**
 * 当前工作区名传给侧栏，只为在对应分组上打一个「当前」标记 ——
 * 侧栏不持有这份状态，标记的判定也不在它那里（判定写在本组件之外的单例里，
 * 侧栏只消费结果，与 showUnseen / statusTone 的处理方式一致）。
 */
const { activeWorkspaceName } = useWorkspace()

/**
 * 全部合法表面（与模板里 v-show 的七处判断一一对应，新增表面两处都要加）。
 * 同时作为 hash 白名单：`#/xxx` 不在表里一律回退 console。
 */
const SURFACES = ['console', 'workbench', 'models', 'agents', 'mcp', 'skills', 'datasources', 'memory', 'observability']

/** 从 URL hash 解析初始表面（`#/agents` → agents；非法/缺省 → console） */
function surfaceFromHash() {
  const m = /^#\/([a-z-]+)$/.exec(window.location.hash)
  return m && SURFACES.includes(m[1]) ? m[1] : 'console'
}

/** 当前表面：console | workbench | models | agents | mcp | skills | memory */
const surface = ref(surfaceFromHash())

/**
 * surface → 地址栏：切换菜单时把 `#/<surface>` 写进 URL。
 * 用 replaceState 不产生历史记录（回退键行为保持不变）；
 * 反向（地址 → surface）走 hashchange 监听，覆盖手改地址与前进后退。
 */
watch(surface, (val) => {
  const want = `#/${val}`
  if (window.location.hash !== want) history.replaceState(null, '', want)
})

function onHashChange() {
  const s = surfaceFromHash()
  if (s !== surface.value) surface.value = s
}
window.addEventListener('hashchange', onHashChange)
/** 设置弹窗的开关（外壳持有：两个入口都指向它） */
const settingsOpen = ref(false)
/** 插件清单弹窗（侧栏 RESOURCES 区的 Plugins 项） */
const pluginsOpen = ref(false)
const workbenchRef = ref(null)

function onSelect(id) {
  selectSession(id)
}

function onCreate() {
  createSession()
}

/**
 * 切回评测工作台时补一次 Monaco layout。
 *
 * 隐藏期间容器尺寸为 0（v-show 用 display:none），而 monaco 的 automaticLayout
 * 走 ResizeObserver 且有延迟；不补这一下，切回来编辑器高度会塌陷成一条线。
 */
watch(surface, (val) => {
  if (val !== 'workbench') return
  nextTick(() => workbenchRef.value?.layoutEditors?.())
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  dispose()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  min-height: 560px;
  overflow: hidden;
  background: var(--bg-page);
  color: var(--text-main);
  font-family: var(--font-sans);
  font-size: var(--text-base);
}

/* 侧栏宽度由 SessionSidebar 自己声明（见其 .sidebar 规则）。
   这里不再从父级穿透去改子组件根元素的布局 —— 父级用 scoped CSS 改子组件根
   依赖「scoped 属性会打在子组件根节点上」这一实现细节，子组件换个根元素就静默失效。 */

.shell-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
