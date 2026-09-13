<template>
  <!-- ============================================================
       设置面板（居中弹窗，左侧菜单 + 右侧内容）
       五节：外观 / 会话默认 / 工具集 / 工作区 / 内存管理
       「内存」页面是只读查看（MemoryPage，侧栏 RESOURCES 区的「内存」菜单进入）；
       这里的「内存管理」节管的是文件存储地址（agent-memory 文件兼容模式根目录）。
       ============================================================ -->
  <n-modal
    v-model:show="show"
    :auto-focus="false"
    esc-close
    mask-closable
    transform-origin="center"
  >
    <div class="set-card" role="dialog" aria-modal="true" aria-label="设置">
      <header class="set-card-head">
        <span class="set-title">设置</span>
        <button class="set-close" type="button" aria-label="关闭设置" @click="show = false">
          <AppIcon name="close" :size="12" />
        </button>
      </header>

      <!--
        双栏布局：左栏是节菜单，右栏只渲染当前节。
        隐藏的节用 v-show 留在 DOM 里（输入值都绑在单例 ref 上，没有重挂载成本），
        换节零延迟且外部脚本仍能查到全部节标题。
      -->
      <div class="set-layout">
        <nav class="set-nav" aria-label="设置分区">
          <button
            v-for="s in NAV_SECTIONS"
            :key="s.key"
            class="set-nav-btn"
            :class="{ 'is-active': section === s.key }"
            type="button"
            @click="section = s.key"
          >
            <AppIcon :name="s.icon" :size="12" />
            <span>{{ s.label }}</span>
          </button>
        </nav>

        <!-- 内容超出一屏时在右栏内部滚动，而不是把卡片撑破视口 -->
        <div class="set-content">
      <!-- ---------------- 外观 ---------------- -->
      <section v-show="section === 'appearance'" class="set-block">
        <div class="set-head">
          <AppIcon :name="mode === 'dark' ? 'moon' : 'sun'" :size="11" />
          <span>外观</span>
        </div>
        <div class="set-body">
          <div class="set-row">
            <span class="set-label">主题</span>
            <span class="seg" role="group">
              <button
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                class="seg-btn"
                :class="{ 'is-active': mode === opt.value }"
                type="button"
                @click="setThemeMode(opt.value)"
              >
                {{ opt.label }}
              </button>
            </span>
          </div>
          <p class="set-note">
            与侧栏页脚的开关共用同一个状态（theme.js 单例），改任一处两处都会变。
          </p>
        </div>
      </section>

      <!-- ---------------- 会话默认 ---------------- -->
      <section v-show="section === 'session'" class="set-block">
        <div class="set-head">
          <AppIcon name="sparkle" :size="11" />
          <span>会话默认</span>
        </div>
        <div class="set-body">
          <div class="set-row">
            <span class="set-label">模型</span>
            <n-select
              v-model:value="model"
              class="set-select"
              size="small"
              :options="MODEL_OPTIONS"
              :consistent-menu-width="false"
            />
          </div>
          <div class="set-row">
            <span class="set-label">思考级别</span>
            <n-select
              v-model:value="thinking"
              class="set-select"
              size="small"
              :options="THINKING_OPTIONS"
              :consistent-menu-width="false"
            />
          </div>
          <p class="set-note">
            这两项就是 Composer 底部提示行上的同名下拉 —— 同一份状态，不存在"设置里改了但发送时没生效"。
          </p>
        </div>
      </section>

      <!-- ---------------- 工具集 ---------------- -->
      <section v-show="section === 'tools'" class="set-block">
        <div class="set-head">
          <AppIcon name="terminal" :size="11" />
          <span>工具集</span>
          <span class="set-head-meta">启用 {{ enabledTools.length }} / {{ TOOL_OPTIONS.length }}</span>
        </div>
        <div class="set-body">
          <div v-for="t in TOOL_OPTIONS" :key="t.value" class="set-row set-tool-row">
            <span class="set-tool-name">
              <span class="set-tool-label">{{ t.label }}</span>
              <!-- 高危标记不是装饰：它说明该工具一旦被调用会走人工审批，关掉它可避免运行被卡在审批上 -->
              <span v-if="t.highRisk" class="set-tool-risk">高危 · 需审批</span>
            </span>
            <n-switch
              size="small"
              :value="enabledTools.includes(t.value)"
              @update:value="onToggleTool(t.value)"
            />
          </div>
          <p v-if="!enabledTools.length" class="set-warn">
            已停用全部工具：运行将只产出模型文本，不再产生任何工具调用步骤。
          </p>
          <p class="set-note">
            改动立刻生效：下一次运行按这里的清单生成步骤，不再出现被停用工具的调用记录。
          </p>
        </div>
      </section>

      <!-- ---------------- 工作区 ---------------- -->
      <section v-show="section === 'workspace'" class="set-block">
        <div class="set-head">
          <AppIcon name="folder" :size="11" />
          <span>工作区</span>
          <span class="set-head-meta">{{ workspaces.length }} 个</span>
        </div>
        <div class="set-body">
          <div v-for="w in workspaces" :key="w.id" class="set-ws-row">
            <span class="set-ws-row-check">
              <AppIcon v-if="w.id === activeWorkspaceId" name="check" :size="10" />
            </span>
            <span class="set-ws-row-body">
              <span class="set-ws-row-name">{{ w.name }}</span>
              <span class="set-ws-row-path">{{ w.path || '未记录路径' }}</span>
            </span>
            <span class="set-ws-row-actions">
              <button
                v-if="w.id !== activeWorkspaceId"
                class="mini-btn"
                type="button"
                @click="selectWorkspace(w.id)"
              >
                设为当前
              </button>
              <button
                v-else
                class="mini-btn is-static"
                type="button"
                disabled
              >
                当前
              </button>
              <button
                class="mini-btn is-danger"
                type="button"
                :disabled="workspaces.length <= 1"
                :title="workspaces.length <= 1 ? '至少要保留一个工作区' : '从清单移除（不影响已有会话）'"
                @click="onRemoveWorkspace(w.id)"
              >
                移除
              </button>
            </span>
          </div>

          <!-- 添加表单 -->
          <div class="set-ws-add">
            <n-input v-model:value="draftName" size="small" placeholder="工作区名称，如 my-project" />
            <n-input v-model:value="draftPath" size="small" placeholder="目录路径（可选），如 D:\\code\\my-project" />
            <div class="set-ws-add-foot">
              <span v-if="addError" class="set-error">{{ addError }}</span>
              <span v-else class="set-note set-ws-add-note">
                浏览器环境无法直接读取磁盘，这里登记的是路径文本与归属关系。
              </span>
              <n-button size="small" type="primary" @click="onAddWorkspace">添加</n-button>
            </div>
          </div>

          <div class="set-ws-foot">
            <button class="mini-btn" type="button" @click="onResetWorkspaces">恢复默认清单</button>
          </div>
        </div>
      </section>

      <!-- ---------------- 内存管理 ---------------- -->
      <!--
        agent-memory 模块文件兼容模式（MEMORY.md）的存储根目录。
        与「内存」页面的分工：那边是**看数据**（分层只读视图），这边是**配存储**（文件落在哪里）。
        保存走 PUT /api/agent-memory/file/config：立即生效且后端持久化，重启保留。
      -->
      <section v-show="section === 'memory'" class="set-block">
        <div class="set-head">
          <AppIcon name="summary" :size="11" />
          <span>内存管理</span>
          <span class="set-head-meta">{{ memoryMode === 'rocksdb' ? 'RocksDB 存储' : '文件存储' }}</span>
        </div>
        <div class="set-body">
          <p v-if="memoryError" class="set-error">{{ memoryError }}</p>

          <template v-if="memoryMode !== 'rocksdb'">
            <div class="set-row set-mem-current">
              <span class="set-label">当前地址</span>
              <span class="set-mem-path" :title="memoryBaseDir">{{ memoryBaseDir || '—' }}</span>
            </div>
            <div class="set-row">
              <span class="set-label">存储地址</span>
              <n-input
                v-model:value="memoryDraft"
                class="set-select"
                size="small"
                placeholder="如 D:\\data\\agent-memory-files"
                :disabled="memoryBusy"
              />
              <n-button size="small" type="primary" :loading="memoryBusy" @click="onSaveMemoryDir">
                保存
              </n-button>
            </div>
            <p class="set-note">
              记忆文件按 <code>{{ memoryLayout || DEFAULT_LAYOUT }}</code> 落盘，保存后立即生效并持久化（重启保留）。
              切换目录不会迁移已有文件。
            </p>
          </template>
          <p v-else class="set-note">
            当前为 RocksDB 存储后端，记忆文件不落本地磁盘，无路径可配置。
          </p>
        </div>
      </section>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
/**
 * 设置面板
 *
 * 三条约束：
 *
 * 1. **每一项都真实生效，不摆点不动的开关。**
 *    主题写 theme.js 单例、模型与思考级别写 usePiSession 的 ref、
 *    工具开关改的是 run 生成步骤时读的那张清单、工作区写 useWorkspace 单例。
 *    凡是本工程还没有后端支撑的项（如后端地址、快捷键）**一律不放进来** ——
 *    摆一个改了没反应的输入框，比缺少这一项更容易让人误判系统坏了。
 *
 * 2. **不自己持有状态副本。** 面板里的 v-model 直接绑在单例的 ref 上，
 *    因此弹窗关掉再打开、切表面回来，看到的都是当前真实值。
 *    若这里各自 ref 一份初值，就会出现"设置里显示 A、Composer 上是 B"。
 *
 * 3. **工作区的增删改都有理由地可能失败**，失败原因用中文回给用户，
 *    而不是静默吞掉 —— 名字重复会直接导致侧栏分组合并，这点必须说清楚。
 */
import { ref, watch } from 'vue'
import { NButton, NInput, NModal, NSelect, NSwitch } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import { useTheme } from '@/theme'
import { usePiSession } from '@/composables/usePiSession'
import { useWorkspace } from '@/composables/useWorkspace'
import { MODEL_OPTIONS, THINKING_OPTIONS, TOOL_OPTIONS } from '@/mock/sessions'
import { fetchMemoryFileConfig, updateMemoryFileConfig } from '@/api/memory'
// 静默登录只在 resources 模块里有一份，凭这里复用而不是再造一次登录流程
import { ensureBackendAuth } from '@/api/resources'

const show = defineModel('show', { type: Boolean, default: false })

/* ---------------- 左侧菜单（当前节） ---------------- */
const NAV_SECTIONS = [
  { key: 'appearance', label: '外观', icon: 'sun' },
  { key: 'session', label: '会话默认', icon: 'sparkle' },
  { key: 'tools', label: '工具集', icon: 'terminal' },
  { key: 'workspace', label: '工作区', icon: 'folder' },
  { key: 'memory', label: '内存管理', icon: 'summary' },
]
/** 当前显示的节；面板每次打开都回到第一节，预期稳定 */
const section = ref('appearance')

const { mode, setThemeMode } = useTheme()
const {
  model, thinking, enabledTools, toggleTool, pushLog,
} = usePiSession()
const {
  workspaces, activeWorkspaceId,
  selectWorkspace, addWorkspace, removeWorkspace, resetWorkspaces,
} = useWorkspace()

const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

/* ---------------- 工具集 ---------------- */

function onToggleTool(name) {
  const on = toggleTool(name)
  pushLog('info', `${on ? '已启用' : '已停用'}工具 ${name}`)
}

/* ---------------- 工作区 ---------------- */

const draftName = ref('')
const draftPath = ref('')
const addError = ref('')

/** 失败原因 -> 界面文案。集中一处，避免 reason 字符串散落在模板判断里 */
const ADD_REASON = {
  'empty-name': '请填写工作区名称',
  'duplicate-name': '已有同名工作区 —— 侧栏按名字分组，同名会合并成一组',
  'duplicate-path': '该路径已在清单中',
}

function onAddWorkspace() {
  const r = addWorkspace({ name: draftName.value, path: draftPath.value })
  if (!r.ok) {
    addError.value = ADD_REASON[r.reason] || '添加失败'
    return
  }
  addError.value = ''
  pushLog('info', `已添加工作区 ${draftName.value.trim()}`)
  draftName.value = ''
  draftPath.value = ''
}

function onRemoveWorkspace(id) {
  const target = workspaces.value.find((w) => w.id === id)
  const r = removeWorkspace(id)
  if (!r.ok) {
    addError.value = r.reason === 'last-workspace' ? '至少要保留一个工作区' : '移除失败'
    return
  }
  addError.value = ''
  pushLog('warn', `已从清单移除工作区 ${target?.name || id}（其会话仍保留在侧栏）`)
}

function onResetWorkspaces() {
  resetWorkspaces()
  addError.value = ''
  pushLog('info', '工作区清单已恢复默认')
}

/* ---------------- 内存管理（文件存储地址） ---------------- */

/** 后端 layout 字段缺失时的兜底文案（写在这里而不是模板内联：模板里出现 '{' 花括号会截断插值） */
const DEFAULT_LAYOUT = '{baseDir}/{agentId}/MEMORY.md'

const memoryMode = ref('file')
const memoryBaseDir = ref('')
const memoryLayout = ref('')
const memoryDraft = ref('')
const memoryBusy = ref(false)
const memoryError = ref('')

// 每次打开面板都重拉一次：地址可能在后端被别处（重启 / 接口）改过，
// 面板里存副本就会显示假值 —— 与约束 2 同理，这里只存「草稿」不存「真值」。
// 同时把菜单复位到第一节，弹窗每次出现的形态可预期。
watch(show, (v) => {
  if (v) {
    section.value = 'appearance'
    loadMemoryConfig()
  }
})

async function loadMemoryConfig() {
  memoryError.value = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) {
      memoryError.value = `连接后端失败：${auth.error}`
      return
    }
    const cfg = await fetchMemoryFileConfig()
    memoryMode.value = cfg?.mode || 'file'
    memoryBaseDir.value = cfg?.baseDir || ''
    memoryLayout.value = cfg?.layout || ''
    memoryDraft.value = ''
  } catch (err) {
    memoryError.value = err?.message || '读取存储配置失败'
  }
}

async function onSaveMemoryDir() {
  const dir = memoryDraft.value.trim()
  if (!dir) {
    memoryError.value = '请输入存储地址（清空恢复默认请直接填默认目录）'
    return
  }
  memoryBusy.value = true
  memoryError.value = ''
  try {
    const cfg = await updateMemoryFileConfig(dir)
    memoryBaseDir.value = cfg?.baseDir || dir
    memoryMode.value = cfg?.mode || memoryMode.value
    memoryDraft.value = ''
    pushLog('info', `内存文件存储地址已切换为 ${memoryBaseDir.value}`)
  } catch (err) {
    memoryError.value = err?.message || '保存失败'
  } finally {
    memoryBusy.value = false
  }
}
</script>

<style scoped>
/* ---- 弹窗卡片 ---- */
/* 固定尺寸：所有菜单节共用同一张卡片大小，切节时弹窗不再跳变；
   内容超出就在右栏内部滚动，max-width/max-height 负责小窗兜底 */
.set-card {
  display: flex;
  flex-direction: column;
  width: min(880px, calc(100vw - var(--space-8)));
  height: min(620px, calc(100vh - var(--space-8)));
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--elevation-menu);
}
.set-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.set-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.set-close:hover { background: var(--overlay-hover); color: var(--text-main); }

/* ---- 双栏：左菜单 + 右内容 ---- */
.set-layout {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.set-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 160px;
  padding: var(--space-3) var(--space-2);
  border-right: 1px solid var(--border-light);
  background: var(--bg-sidebar);
  border-radius: 0 0 0 var(--radius-lg);
  overflow-y: auto;
}
.set-nav-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1-5) var(--space-2);
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
.set-nav-btn:hover { background: var(--overlay-hover); color: var(--text-main); }
.set-nav-btn.is-active { background: var(--accent-tint-bg-strong); color: var(--primary); font-weight: var(--font-medium); }

.set-content {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--space-4) var(--space-5);
  overflow-y: auto;
}

.set-title { font-size: var(--text-md); font-weight: var(--font-medium); }

.set-block + .set-block {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-light);
}

.set-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.set-head-meta { margin-left: auto; font-variant-numeric: tabular-nums; text-transform: none; letter-spacing: 0; }

.set-body { padding-top: var(--space-2); }

.set-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 30px;
  padding: var(--space-1) 0;
}
.set-label { flex: 0 0 auto; width: 72px; color: var(--text-sub); font-size: var(--text-sm); }
.set-select { flex: 1 1 auto; min-width: 0; }

.set-note {
  margin: var(--space-1) 0 0;
  color: var(--text-faint);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}
.set-warn {
  margin: var(--space-1) 0 0;
  padding: var(--space-1-5) var(--space-2);
  border: 1px solid var(--warning-tint-border);
  border-radius: var(--radius-sm);
  background: var(--warning-tint-bg);
  color: var(--text-main);
  font-size: var(--text-xs);
}
.set-error { color: var(--fail); font-size: var(--text-xs); }

/* ---- 内存管理：当前存储地址（mono 长路径，超长省略 + title 悬停看全量） ---- */
.set-mem-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/* ---- 分段控件（主题） ---- */
.seg {
  display: inline-flex;
  flex: 0 0 auto;
  padding: 1px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  background: var(--bg-sunken);
}
.seg-btn {
  padding: 1px var(--space-3);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-faint);
  font-family: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.seg-btn:hover { color: var(--text-main); }
.seg-btn.is-active { background: var(--accent-tint-bg-strong); color: var(--primary); }

/* ---- 工具行 ---- */
.set-tool-row { justify-content: space-between; }
.set-tool-name { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.set-tool-label { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--text-main); }
.set-tool-risk {
  padding: 0 var(--space-1-5);
  border: 1px solid var(--danger-tint-border);
  border-radius: var(--radius-pill);
  background: var(--danger-tint-bg);
  color: var(--fail);
  font-size: var(--text-xs);
}

/* ---- 工作区行 ---- */
.set-ws-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1-5) var(--space-1);
  border-radius: var(--radius-sm);
}
.set-ws-row:hover { background: var(--overlay-hover); }

.set-ws-row-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  flex: 0 0 auto;
  color: var(--primary);
}
.set-ws-row-body { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.set-ws-row-name { color: var(--text-main); font-size: var(--text-sm); }
.set-ws-row-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.set-ws-row-actions { display: flex; align-items: center; gap: var(--space-1); flex: 0 0 auto; }

.mini-btn {
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
.mini-btn.is-static { color: var(--primary); border-color: var(--accent-tint-border); background: var(--accent-tint-bg); opacity: 1; }
.mini-btn.is-danger:hover:not(:disabled) { border-color: var(--danger-tint-border); background: var(--danger-tint-bg); color: var(--fail); }

/* ---- 添加表单 ---- */
.set-ws-add {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--border-heavy);
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
}
.set-ws-add-foot { display: flex; align-items: center; gap: var(--space-2); }
.set-ws-add-note { margin: 0; flex: 1 1 auto; min-width: 0; }
.set-ws-foot { display: flex; justify-content: flex-end; margin-top: var(--space-3); }
</style>
