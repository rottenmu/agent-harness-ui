<template>
  <!-- ============================================================
       会话侧栏（参照 pi-gui 的 sidebar.tsx 结构，非逐像素复刻）
         主按钮 → 分节 THREADS（可折叠）→ 按 workspace 分组 → 两行式会话行
         悬停才出「置顶 / 归档」，保持静止状态的信息密度
       ============================================================ -->
  <aside class="sidebar">
    <div class="sidebar-top">
      <n-input
        v-model:value="query"
        size="small"
        placeholder="搜索会话 / 工作区"
        clearable
      >
        <template #prefix><AppIcon name="search" :size="13" /></template>
      </n-input>

      <!--
        这里原本有一排资源创建快捷按钮（智能体 / MCP / 技能），已移除：
        三种资源现在都有独立页面，各自的右上角就是创建入口，
        再留一排「新建XX」等于同一动作两处入口，且与下方 RESOURCES 区的导航项语义重叠。
      -->
      <n-button class="new-btn" size="small" block @click="emit('create')">
        <template #icon><AppIcon name="plus" :size="13" /></template>
        新建会话
      </n-button>
    </div>

    <!--
      应用级导航：切换「表面」（surface）。
      为什么放在侧栏而不是顶栏：参照项目 pi-gui 的侧栏本身就是应用级导航
      （其 nav 是 Threads / Skills / Extensions / Settings）。表面切换与
      「当前看哪条会话」是同一层级的导航问题，放进会话内容区的顶栏会变成
      「在页面内部切换页面」，返回路径也就只能靠浏览器后退。
    -->
    <nav class="sidebar-nav">
      <button
        v-for="item in NAV_ITEMS"
        :key="item.key"
        class="nav-item"
        :class="{ 'is-active': item.key === surface }"
        type="button"
        :title="item.title"
        @click="emit('switch-surface', item.key)"
      >
        <AppIcon :name="item.icon" :size="13" />
        <span>{{ item.label }}</span>
        <span v-if="item.key === 'console'" class="nav-count">{{ sessionCount }}</span>
      </button>
    </nav>

    <!--
      资源导航：Agents / Plugins / MCP / Skills（上下顺序）。
      三种有后端 CRUD 的资源都走**独立页面**（列表在页面、创建在页内右上角），
      这里是它们唯一的入口 —— 侧栏不再另设「新建XX」快捷按钮。
      Plugins 没有后端 CRUD（后端是 Maven 模块，不是数据实体），走独立清单弹窗。
    -->
    <nav class="sidebar-nav" aria-label="资源管理">
      <button
        v-for="item in RESOURCE_NAV"
        :key="item.key"
        class="nav-item"
        :class="{ 'is-active': item.surface && item.surface === surface }"
        type="button"
        :title="item.title"
        @click="onResourceNav(item)"
      >
        <AppIcon :name="item.icon" :size="13" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-scroll">
      <!--
        WORKSPACE 区：列出全部工作区（含预设 Home / sandbox / 组织），
        点击切换当前工作区 —— 与顶栏 WorkspacePicker、设置面板共享同一单例，
        当前项带「当前」标记；新建会话会归到它。
      -->
      <section class="section">
        <button class="section-head" type="button" @click="wsSectionOpen = !wsSectionOpen">
          <span class="caret" :class="{ 'is-open': wsSectionOpen }">
            <AppIcon name="chevron" :size="11" />
          </span>
          <span class="section-title">WORKSPACE</span>
          <span class="section-count">{{ workspaces.length }}</span>
        </button>
        <div v-show="wsSectionOpen" class="section-body">
          <button
            v-for="w in workspaces"
            :key="w.id"
            class="ws-row"
            :class="{ 'is-active': w.id === activeWorkspaceId }"
            type="button"
            :title="w.path ? `当前工作区：${w.name}（${w.path}）` : `切换到 ${w.name}`"
            @click="selectWorkspace(w.id)"
          >
            <AppIcon name="folder" :size="12" />
            <span class="ws-row-name">{{ w.name }}</span>
            <span v-if="w.id === activeWorkspaceId" class="ws-current">当前</span>
          </button>
        </div>
      </section>

      <section class="section">
        <button class="section-head" type="button" @click="threadsOpen = !threadsOpen">
          <span class="caret" :class="{ 'is-open': threadsOpen }">
            <AppIcon name="chevron" :size="11" />
          </span>
          <span class="section-title">THREADS</span>
          <span class="section-count">{{ filteredCount }}</span>
        </button>

        <div v-show="threadsOpen" class="section-body">
          <p v-if="!groups.length" class="empty-hint">no session matched</p>

          <div v-for="g in groups" :key="g.workspace" class="ws-group">
            <div class="ws-head">
              <AppIcon name="folder" :size="11" />
              <span class="ws-name">{{ g.workspace }}</span>
              <!-- 「当前」标记指向顶栏选中的工作区：新建会话会归到它。
                   没有这个标记时，用户看不出"我选的工作区"与"这组会话"是不是同一个。 -->
              <span v-if="g.workspace === activeWorkspace" class="ws-current">当前</span>
              <span class="ws-count">{{ g.sessions.length }}</span>
            </div>

            <button
              v-for="s in g.sessions"
              :key="s.id"
              class="session-row"
              :class="{ 'is-active': s.id === activeId }"
              type="button"
              @click="emit('select', s.id)"
            >
              <span class="row-line-1">
                <span class="status-dot" :class="`tone-${s.statusTone}`" />
                <span class="row-title">{{ s.title }}</span>
                <span v-if="s.showUnseen" class="unseen-dot" />
                <span class="row-actions">
                  <span
                    class="row-action"
                    :title="s.pinned ? '取消置顶' : '置顶'"
                    @click.stop="emit('pin', s.id)"
                  >
                    <AppIcon name="pin" :size="11" />
                  </span>
                  <span class="row-action" title="归档" @click.stop="emit('archive', s.id)">
                    <AppIcon name="archive" :size="11" />
                  </span>
                </span>
              </span>
              <span class="row-line-2">{{ s.preview }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- 侧栏页脚：主题开关与设置入口常驻。放在这里而不是会话内容区，是因为它们作用于
         整个应用，而内容区在切换表面时会被替换掉，放那儿会导致「换个表面就找不到开关」。 -->
    <div class="sidebar-foot">
      <button class="foot-btn" type="button" @click="toggleMode">
        <AppIcon :name="mode === 'dark' ? 'moon' : 'sun'" :size="12" />
        <span>{{ mode === 'dark' ? '深色' : '浅色' }}</span>
        <span class="foot-meta">切换主题</span>
      </button>

      <button class="foot-btn" type="button" @click="emit('open-settings')">
        <AppIcon name="settings" :size="12" />
        <span>设置</span>
        <span class="foot-meta">模型 · 工具 · 工作区</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
/**
 * 会话侧栏
 *
 * 三条约束：
 *  1. **未读点与状态色不由本组件推导** —— 直接消费 `sidebarGroups` 里已算好的
 *     `showUnseen` / `statusTone`（唯一来源见 composables/sessionVisibility.js）。
 *     组件里再写一次 `if (unseen && ...)` 就是那份复盘里的漂移起点。
 *  2. 会话行是**两行式**：第一行标题 + 状态点 + 悬停动作，第二行预览。
 *     单行放不下标题与预览，两行又比把预览塞进 title 属性可发现。
 *  3. 悬停动作使用 `<span>` 而非 `<button>`：行本身已是 button，
 *     嵌套 button 是非法 HTML，浏览器会把内层按钮提到外层，点击区域全乱。
 */
import { ref } from 'vue'
import { NButton, NInput } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import { useTheme } from '@/theme'
import { useWorkspace } from '@/composables/useWorkspace'

defineProps({
  /** 已按「置顶 → updatedAt 倒序」排好并分好组的会话（含 showUnseen / statusTone） */
  groups: { type: Array, default: () => [] },
  /** 当前查看的会话 id */
  activeId: { type: String, default: '' },
  /** 全部会话数（导航计数用） */
  sessionCount: { type: Number, default: 0 },
  /** 过滤后的会话数 */
  filteredCount: { type: Number, default: 0 },
  /** 当前激活的表面：console | workbench | models | agents | mcp | skills | memory */
  surface: { type: String, default: 'console' },
  /** 顶栏当前选中的工作区名（与侧栏分组同名时打「当前」标记） */
  activeWorkspace: { type: String, default: '' },
})

const emit = defineEmits(['select', 'create', 'pin', 'archive', 'switch-surface', 'open-settings', 'open-plugins'])

const query = defineModel('query', { type: String, default: '' })
const threadsOpen = ref(true)
const wsSectionOpen = ref(true)

/** 主题是模块级单例（theme.js），这里直接消费，不需要父级再透传一层 */
const { mode, toggleMode } = useTheme()

/** WORKSPACE 区与顶栏选择器、设置面板共享同一工作区单例（漂移防护见 useWorkspace 头注释） */
const { workspaces, activeWorkspaceId, selectWorkspace } = useWorkspace()

/**
 * 资源导航清单（上下顺序即展示顺序）。
 *  · surface —— 切到主区域对应页面（三种资源页同构：清单 + 右上角创建）
 *  · 无 surface —— plugin 是只读清单弹窗（后端没有可 CRUD 的插件实体）
 * 「内存」同样落在工作区上方区域：它是 agent-memory 的只读视图页（分层 tab），
 * 不是可 CRUD 的资源，但交互与资源页一致（点菜单 → 切页面）。
 */
const RESOURCE_NAV = [
  { key: 'model', label: '模型', icon: 'activity', surface: 'models', title: '模型配置页面：供应商 / 密钥 / 运行环境，清单 + 右上角新建' },
  { key: 'agent', label: 'Agents', icon: 'sparkle', surface: 'agents', title: '智能体页面：清单 + 右上角创建' },
  { key: 'plugin', label: 'Plugins', icon: 'panel', title: '插件模块清单（后端 Maven 模块 + 前端插件）' },
  { key: 'mcp', label: 'MCP', icon: 'terminal', surface: 'mcp', title: 'MCP 配置页面：清单 + 右上角新建' },
  { key: 'skill', label: 'Skills', icon: 'code', surface: 'skills', title: '技能页面：清单 + 右上角新建' },
  { key: 'datasource', label: '数据源', icon: 'folder', surface: 'datasources', title: '数据源页面：数据库 / 文档 / OCR / 网页等七类，清单 + 右上角新建' },
  { key: 'memory', label: '内存', icon: 'summary', surface: 'memory', title: '内存页面：L3 人格 / L2 画像 / L1 会话 / L0 日志 分层 tab' },
  { key: 'observability', label: '可观测', icon: 'eye', surface: 'observability', title: '可观测页面：消息量时序 / 事件构成 / 会话聚合 / Trace 溯源' },
]

/** 资源导航点击分发：页面类走表面切换，弹窗类走各自事件 */
function onResourceNav(item) {
  if (item.surface) {
    emit('switch-surface', item.surface)
    return
  }
  if (item.key === 'plugin') {
    emit('open-plugins')
  }
}

/**
 * 表面清单（本节只放「工作区」类表面）。
 *
 * 资源类表面（agents / mcp / skills）刻意不列在这里，而是收在下方 RESOURCE_NAV 区：
 * 两处都列会出现同一目的地两个入口，且高亮的归属也变得含糊（同一时刻只有一处
 * 该是 active，但两份清单各自判断 item.key === surface）。
 * 原则不变：只摆**真实可达**的项 —— 点不动的图标只会制造「功能存在但坏了」的错觉。
 */
const NAV_ITEMS = [
  { key: 'console', label: '运行时控制台', icon: 'threads', title: '会话时间线 + Composer + 产出与差异' },
  { key: 'workbench', label: '评测工作台', icon: 'panel', title: '用例树 + 轨迹 + 断言 + 指标' },
]
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  /* 宽度固定：会话行是两行式，再窄标题与预览就会被截到不可辨识；
     而它同时承载应用级导航，不能做成可拖拽到归零的面板。 */
  flex: 0 0 256px;
  min-width: 0;
  min-height: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
}

.sidebar-top {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-2);
}

.new-btn { justify-content: flex-start; }

/* ---- 主导航 ---- */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  padding: 0 var(--space-2) var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 26px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out);
}
.nav-item:hover { background: var(--overlay-hover); color: var(--text-main); }
.nav-item.is-active { background: var(--overlay-active); color: var(--text-main); }
.nav-count { margin-left: auto; font-size: var(--text-xs); color: var(--text-faint); }

/* ---- 分节 ---- */
.sidebar-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding-bottom: var(--space-3); }

.section-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  height: 24px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--text-faint);
  font-family: inherit;
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  cursor: pointer;
}
.section-head:hover { color: var(--text-sub); }
.caret { display: inline-flex; transition: transform var(--motion-fast) var(--ease-out); }
.caret.is-open { transform: rotate(90deg); }
.section-title { font-weight: var(--font-medium); }
.section-count { margin-left: auto; font-variant-numeric: tabular-nums; }

.section-body { padding: 0 var(--space-2); }

/* ---- WORKSPACE 区：工作区切换行 ---- */
.ws-row + .ws-row { margin-top: 1px; }
.ws-row {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  width: 100%;
  height: 24px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out);
}
.ws-row:hover { background: var(--overlay-hover); color: var(--text-main); }
.ws-row.is-active {
  background: var(--accent-tint-bg);
  color: var(--text-main);
  box-shadow: inset 2px 0 0 var(--accent-rail);
}
.ws-row-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 「当前」徽标与 THREADS 分组头的复用同一外观 */
.ws-row .ws-current { margin-left: auto; }

/* ---- 工作区分组 ---- */
.ws-group + .ws-group { margin-top: var(--space-2); }

.ws-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}
.ws-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-current {
  flex: 0 0 auto;
  padding: 0 var(--space-1);
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius-pill);
  background: var(--accent-tint-bg);
  color: var(--primary);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.ws-count { margin-left: auto; font-variant-numeric: tabular-nums; }

/* ---- 会话行（两行式） ---- */
.session-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out);
}
.session-row:hover { background: var(--overlay-hover); }
.session-row.is-active {
  background: var(--accent-tint-bg);
  box-shadow: inset 2px 0 0 var(--accent-rail);
}

.row-line-1 { display: flex; align-items: center; gap: var(--space-1-5); min-width: 0; }

.status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: var(--radius-round);
  background: var(--status-neutral);
}
.status-dot.tone-running { background: var(--status-running); }
.status-dot.tone-error { background: var(--status-error); }

.row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-main);
}

.unseen-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: var(--radius-round);
  background: var(--primary);
}

.row-actions {
  display: none;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
}
.session-row:hover .row-actions { display: flex; }
.row-action {
  display: inline-flex;
  padding: 1px;
  border-radius: var(--radius-xs);
  color: var(--text-faint);
}
.row-action:hover { background: var(--overlay-active); color: var(--text-main); }

.row-line-2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-faint);
}

.empty-hint {
  margin: 0;
  padding: var(--space-3) var(--space-2);
  color: var(--text-faint);
  font-size: var(--text-sm);
  font-style: italic;
}

/* ---- 页脚：主题开关 + 设置入口 ---- */
.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  flex: 0 0 auto;
  padding: var(--space-2);
  border-top: 1px solid var(--border-light);
}

.foot-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 26px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.foot-btn:hover { background: var(--overlay-hover); color: var(--text-main); }
.foot-meta { margin-left: auto; color: var(--text-faint); font-size: var(--text-xs); }
</style>
