<template>
  <!-- ============================================================
       资源页面（智能体 / MCP 配置 / 技能 三合一）
         · 页头：图标 + 标题 + 数量 + 刷新 + 右上角「创建」
         · 页面主体：资源清单（真实后端 /api/biz/ai/*）
         · 创建走独立弹窗（ResourceManagerModal mode="create"），
           建完自动关弹窗并原地刷新列表
       差异全部来自 @/resources/defs 描述表，本组件不含任何按类型分支的字段映射。
       ============================================================ -->
  <div class="resource-page">
    <header class="page-head">
      <div class="head-left">
        <span class="head-icon"><AppIcon :name="def.icon" :size="15" /></span>
        <h2 class="head-title">{{ def.title }}</h2>
        <span class="head-count">{{ items.length }}</span>
      </div>

      <div class="head-actions">
        <button class="mini-btn" type="button" :disabled="loading" @click="load">
          <AppIcon name="refresh" :size="11" />
          刷新
        </button>
        <!--
          MCP 专属：标准 mcpServers JSON 的批量导入与导出（resources/mcpIO.js）。
          导入 = 粘贴/选文件 → 解析预览 → 逐条创建（重名跳过）；
          导出 = 当前列表序列化为 {mcpServers:{...}} 下载 .json，可直接喂给
          Claude/Cursor 等客户端，也可再导回本页。
        -->
        <template v-if="type === 'mcp'">
          <button class="mini-btn" type="button" :disabled="loading" @click="importOpen = true">
            <AppIcon name="download" :size="11" />
            导入 MCP
          </button>
          <button class="mini-btn" type="button" :disabled="loading || !items.length" @click="onExportMcp">
            <AppIcon name="summary" :size="11" />
            导出 MCP
          </button>
        </template>
        <!--
          右上角主操作：新增走独立弹窗，不把表单塞进页面。
          表单字段普遍 6 个以上（技能有 baseUrl/path/timeout），内联会把列表挤没；
          而它只在点「创建」的那一下有用，长期占半屏不划算。
        -->
        <n-button size="small" type="primary" @click="createOpen = true">
          <template #icon><AppIcon name="plus" :size="13" /></template>
          {{ def.createLabel }}
        </n-button>
      </div>
    </header>

    <div class="page-body">
      <p v-if="loadError" class="state is-error">{{ loadError }}</p>
      <p v-else-if="loading" class="state">正在加载{{ def.title }}…</p>
      <div v-else-if="!items.length" class="state is-empty">
        <p class="empty-title">{{ def.emptyText }}</p>
        <p class="empty-sub">点右上角「{{ def.createLabel }}」新建第一个。</p>
      </div>

      <!--
        内置 + 自建两段式（仅当 def.builtinCheck 存在，当前只有数据源用）：
        内置种子数据显示为顶部卡片网格（只读展示、不带删除），
        用户自建的留在下方列表（保留两步删除）。
      -->
      <template v-else-if="def.builtinCheck">
        <section v-if="builtinItems.length" class="ds-builtin">
          <h3 class="sec-title">内置数据源 <span class="sec-count">{{ builtinItems.length }}</span></h3>
          <div class="ds-cards">
            <article
              v-for="it in builtinItems"
              :key="def.itemKey(it)"
              class="ds-card"
              :class="{ 'is-off': it.enabled === false }"
            >
              <div class="ds-card-head">
                <span class="ds-card-icon" :class="{ 'is-off': it.enabled === false }">
                  <AppIcon :name="def.typeIcon(it)" :size="14" />
                </span>
                <span class="ds-card-name">{{ def.itemName(it) }}</span>
                <span class="ds-card-type">{{ def.typeLabel(it) }}</span>
              </div>
              <p class="ds-card-desc" :title="itemDescOf(it)">{{ itemDescOf(it) }}</p>
              <div class="ds-card-foot">
                <span class="ds-card-cfg" :title="def.cardSummary(it)">{{ def.cardSummary(it) }}</span>
                <span class="ds-card-state" :class="{ 'is-off': it.enabled === false }">
                  {{ it.enabled === false ? '已停用' : '启用' }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="userItems.length" class="ds-user">
          <h3 class="sec-title">我的数据源 <span class="sec-count">{{ userItems.length }}</span></h3>
          <ul class="res-list">
            <li v-for="it in userItems" :key="def.itemKey(it)" class="res-row">
              <span class="row-badge" :class="{ 'is-off': it.enabled === false }">
                <AppIcon :name="def.icon" :size="12" />
              </span>
              <span class="row-main">
                <span class="row-name">{{ def.itemName(it) }}</span>
                <span class="row-meta">{{ def.itemMeta(it) }}</span>
              </span>
              <span v-if="tagOf(it)" class="row-tag" :class="{ 'is-dim': tagOf(it).dim }">
                {{ tagOf(it).text }}
              </span>
              <span class="row-desc">{{ itemDescOf(it) }}</span>
              <button
                class="mini-btn is-danger"
                type="button"
                :disabled="busy"
                @click="onRemove(it)"
              >
                {{ armingKey === def.itemKey(it) ? '确认删除' : '删除' }}
              </button>
            </li>
          </ul>
        </section>

        <p v-if="!userItems.length" class="ds-hint">
          以上为系统内置数据源（只读展示）；点右上角「{{ def.createLabel }}」添加自己的。
        </p>
      </template>

      <ul v-else class="res-list">
        <li v-for="it in items" :key="def.itemKey(it)" class="res-row">
          <span class="row-badge" :class="{ 'is-off': it.enabled === false }">
            <AppIcon :name="def.icon" :size="12" />
          </span>
          <span class="row-main">
            <span class="row-name">{{ def.itemName(it) }}</span>
            <span class="row-meta">{{ def.itemMeta(it) }}</span>
          </span>
          <!-- tag(it) 可能返回 null（如自定义技能不打标），必须先判空再取字段 -->
          <span v-if="tagOf(it)" class="row-tag" :class="{ 'is-dim': tagOf(it).dim }">
            {{ tagOf(it).text }}
          </span>
          <span class="row-desc">{{ itemDescOf(it) }}</span>
          <!-- 内置 Bean 技能后端拒删，这里直接不渲染按钮（与判断同源，不是两处条件） -->
          <button
            v-if="!isLocked(it)"
            class="mini-btn is-danger"
            type="button"
            :disabled="busy"
            @click="onRemove(it)"
          >
            {{ armingKey === def.itemKey(it) ? '确认删除' : '删除' }}
          </button>
        </li>
      </ul>

      <p v-if="authUser && items.length" class="page-foot">已连接后端 · {{ authUser }}</p>
    </div>

    <!-- 新增表单：复用资源管理弹窗的 create 形态（同一份字段表，见 @/resources/defs） -->
    <ResourceManagerModal v-model:show="createOpen" :type="type" mode="create" @created="load" />

    <!-- MCP 批量导入（标准 mcpServers JSON：粘贴或 .json 文件） -->
    <McpImportModal
      v-model:show="importOpen"
      :existing-names="mcpNames"
      @imported="load"
    />
  </div>
</template>

<script setup>
/**
 * 通用资源页面
 *
 * 三种资源（agent / mcp / skill）与后端的交互形状完全同构 ——
 * GET 列表 → POST 创建 → DELETE 删除，只有字段与展示映射不同。
 * 而字段与展示映射已经收敛在 @/resources/defs 里，所以页面本身不需要
 * 按类型写第二份分支：一份组件 + 三个 def 就是三条完整链路。
 *
 * 与 ResourceManagerModal 的分工：**列表在页面、创建在弹窗**。
 * 管理弹窗那种「列表 + 表单同屏」适合一次性批量维护；作为常驻页面时，
 * 表单会长期占据半屏却只在点「创建」时才有用，所以拆成：
 * 页面负责查看/删除，创建按需弹窗。
 */
import { computed, ref, watch } from 'vue'
import { NButton } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import McpImportModal from './McpImportModal.vue'
import ResourceManagerModal from './ResourceManagerModal.vue'
import {
  deleteAgent, deleteDataSource, deleteMcpConfig, deleteModelConfig, deleteSkill,
  ensureBackendAuth,
  listAgents, listDataSources, listMcpConfigs, listModelConfigs, listSkills,
} from '@/api/resources'
import { buildMcpServersExport, downloadJson } from '@/resources/mcpIO'
import { RESOURCE_DEFS } from '@/resources/defs'

const props = defineProps({
  /** 资源类型：agent | datasource | mcp | model | skill */
  type: { type: String, required: true },
  /**
   * 该页面是否正处于激活状态（外表用 v-show 保活，三个实例同时挂着）。
   * 只在**首次**激活时发列表请求 —— 否则应用一启动就会同时打三次后端，
   * 而用户只看得到其中一个表面。
   */
  active: { type: Boolean, default: true },
})

/** 类型 → 接口：写在这里而不是 defs —— defs 是纯数据，不该拖住 api 模块 */
const LISTERS = { agent: listAgents, datasource: listDataSources, mcp: listMcpConfigs, model: listModelConfigs, skill: listSkills }
const REMOVERS = { agent: deleteAgent, datasource: deleteDataSource, mcp: deleteMcpConfig, model: deleteModelConfig, skill: deleteSkill }

const def = computed(() => RESOURCE_DEFS[props.type] || RESOURCE_DEFS.agent)

/** 内置数据源（def.builtinCheck 存在时生效，当前只有数据源 def 定义了它） */
const builtinItems = computed(() =>
  def.value.builtinCheck ? items.value.filter((it) => def.value.builtinCheck(it)) : [])
/** 用户自建数据源（其余部分走普通列表，保留删除） */
const userItems = computed(() =>
  def.value.builtinCheck ? items.value.filter((it) => !def.value.builtinCheck(it)) : [])

const items = ref([])
const loading = ref(false)
const busy = ref(false)
const loadError = ref('')
const authUser = ref('')
const createOpen = ref(false)

/** 两步删除确认：当前处于「确认删除」态的条目 key，null 表示无 */
const armingKey = ref(null)
let armingTimer = null

/** 是否已经发起过首次加载（见 active 的说明） */
const started = ref(false)

/* ---------------- MCP 导入 / 导出（仅 type === 'mcp' 时渲染入口） ---------------- */

const importOpen = ref(false)
/** 现有名称快照：导入弹窗用它做重名跳过；items 就是列表的真值，无需另拉接口 */
const mcpNames = computed(() => items.value.map((it) => it.name).filter(Boolean))

/** 导出当前列表为标准 mcpServers JSON 文件 */
function onExportMcp() {
  if (!items.value.length) return
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  downloadJson(`mcp-configs-${stamp}.json`, buildMcpServersExport(items.value))
}

watch(
  () => props.active,
  (v) => {
    if (!v || started.value) return
    started.value = true
    load()
  },
  { immediate: true },
)

async function load() {
  // 重入防护：切表面与外壳的「新建成功刷新」可能同帧到达，
  // 不做这层判断就会对同一个列表发两次请求，后到的那次可能覆盖先到的结果。
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  const auth = await ensureBackendAuth()
  if (!auth.ok) {
    loadError.value = `连接后端失败：${auth.error}（请确认 :9900 服务与登录凭证）`
    items.value = []
    loading.value = false
    return
  }
  // token 已存在时 ensureBackendAuth 不带 user，兜底展示文案（与弹窗同口径）
  authUser.value = auth.user || '已登录'
  try {
    const data = await (LISTERS[props.type] || listAgents)()
    items.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value = err?.message || '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

function tagOf(it) { return def.value.tag ? def.value.tag(it) : null }
function isLocked(it) { return def.value.locked ? !!def.value.locked(it) : false }
function itemDescOf(it) { return def.value.itemDesc?.(it) || '暂无描述' }

function onRemove(it) {
  const key = def.value.itemKey(it)
  if (armingKey.value !== key) {
    // 第一步：只武装确认态，3s 不点就还原 —— 误触成本为零，真删需要再点一下
    armingKey.value = key
    clearTimeout(armingTimer)
    armingTimer = setTimeout(() => { armingKey.value = null }, 3000)
    return
  }
  armingKey.value = null
  clearTimeout(armingTimer)
  busy.value = true
  ;(REMOVERS[props.type] || deleteAgent)(key)
    .then(() => load())
    .catch((err) => { loadError.value = err?.message || '删除失败' })
    .finally(() => { busy.value = false })
}
</script>

<style scoped>
.resource-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bg-page);
}

/* ---- 页头 ---- */
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.head-left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint-bg);
  color: var(--primary);
}
.head-title { margin: 0; font-size: var(--text-md); font-weight: var(--font-medium); }
.head-count {
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.head-actions { display: flex; align-items: center; gap: var(--space-2); flex: 0 0 auto; }

/* ---- 主体 ---- */
.page-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--space-3) var(--space-4); }

.state { margin: 0; padding: var(--space-4) 0; color: var(--text-faint); font-size: var(--text-sm); }
.state.is-error { color: var(--fail); }
.state.is-empty { padding-top: var(--space-8); text-align: center; }
.empty-title { margin: 0; color: var(--text-sub); font-size: var(--text-base); }
.empty-sub { margin: var(--space-1) 0 0; color: var(--text-faint); font-size: var(--text-sm); }

/* ---- 列表 ---- */
.res-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-1); }

.res-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}
.res-row:hover { border-color: var(--border-default); }

.row-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint-bg);
  color: var(--primary);
}
.row-badge.is-off { background: var(--overlay-active); color: var(--text-faint); }

.row-main { display: flex; flex-direction: column; gap: 1px; flex: 0 0 220px; min-width: 0; }
.row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
}
.row-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: var(--text-xs);
}

.row-tag {
  flex: 0 0 auto;
  padding: 0 var(--space-1-5);
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius-pill);
  background: var(--accent-tint-bg);
  color: var(--primary);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.row-tag.is-dim {
  border-color: var(--border-default);
  background: transparent;
  color: var(--text-faint);
}

/* 描述占剩余宽度：窄屏先压缩它，不挤掉名称与操作 */
.row-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-sub);
  font-size: var(--text-xs);
}

.page-foot {
  margin: var(--space-3) 0 0;
  color: var(--text-faint);
  font-size: var(--text-xs);
}

/* ---- 内置数据源卡片网格 ---- */
.sec-title {
  margin: 0 0 var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-sub);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}
.sec-count {
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.ds-builtin { margin-bottom: var(--space-4); }
.ds-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-2);
}
.ds-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  padding: var(--space-3);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  transition: border-color var(--motion-fast) var(--ease-out);
}
.ds-card:hover { border-color: var(--border-default); }
.ds-card.is-off { opacity: 0.6; }
.ds-card-head { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.ds-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--accent-tint-bg);
  color: var(--primary);
}
.ds-card-icon.is-off { background: var(--overlay-active); color: var(--text-faint); }
.ds-card-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.ds-card-type {
  flex: 0 0 auto;
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  color: var(--text-faint);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.ds-card-desc {
  margin: 0;
  min-height: 2.6em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--text-sub);
  font-size: var(--text-xs);
  line-height: 1.3;
}
.ds-card-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ds-card-cfg {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-family: var(--font-mono, monospace);
}
.ds-card-state {
  flex: 0 0 auto;
  color: var(--ok, var(--primary));
  font-size: var(--text-xs);
}
.ds-card-state.is-off { color: var(--text-faint); }
.ds-user { margin-bottom: var(--space-2); }
.ds-hint { margin: var(--space-3) 0 0; color: var(--text-faint); font-size: var(--text-xs); }

/* ---- mini-btn：与设置/资源弹窗同款 ---- */
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-sub);
  font-family: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.mini-btn:hover:not(:disabled) { background: var(--overlay-hover); color: var(--text-main); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-btn.is-danger:hover:not(:disabled) { border-color: var(--danger-tint-border); background: var(--danger-tint-bg); color: var(--fail); }
</style>
