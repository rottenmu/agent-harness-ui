<template>
  <!-- ============================================================
       资源管理弹窗（智能体 / MCP / 技能 三合一）
       与 SettingsPanel 同款居中卡片形态；内容由 RESOURCE_DEFS 描述驱动。
       每个资源：上半列表（含删除）+ 下半新建表单，创建成功后列表原地刷新。
       ============================================================ -->
  <n-modal
    v-model:show="show"
    :auto-focus="false"
    esc-close
    mask-closable
    transform-origin="center"
  >
    <div class="res-card" role="dialog" aria-modal="true" :aria-label="`${def.title}管理`">
      <header class="res-head">
        <span class="res-title">
          <AppIcon :name="def.icon" :size="12" />
          {{ mode === 'create' ? `新增${def.title}` : def.title }}
        </span>
        <button class="res-close" type="button" :aria-label="`关闭${def.title}管理`" @click="show = false">
          <AppIcon name="close" :size="12" />
        </button>
      </header>

      <div class="res-body">
        <!-- ---------------- 列表（仅 manage 形态） ---------------- -->
        <section v-if="mode === 'manage'" class="res-list-section">
          <div class="res-list-head">
            <span>已有{{ def.title }}（{{ items.length }}）</span>
            <button class="mini-btn" type="button" :disabled="loading" @click="load">
              <AppIcon name="refresh" :size="11" />
              刷新
            </button>
          </div>

          <p v-if="loadError" class="res-error">{{ loadError }}</p>
          <p v-else-if="loading" class="res-hint">正在加载…</p>
          <p v-else-if="!items.length" class="res-hint">
            还没有任何{{ def.title }}，用下方表单创建第一个。
          </p>

          <ul v-else class="res-list">
            <li v-for="it in items" :key="itemKeyOf(it)" class="res-item">
              <span class="res-item-main">
                <span class="res-item-name">{{ itemNameOf(it) }}</span>
                <span class="res-item-meta">{{ def.itemMeta(it) }}</span>
              </span>
              <!-- tag(it) 可能返回 null（如自定义技能不打标），必须先判空再取字段 -->
              <span v-if="def.tag && def.tag(it)" class="res-item-tag" :class="{ 'is-dim': def.tag(it).dim }">
                {{ def.tag(it).text }}
              </span>
              <button
                v-if="!def.locked || !def.locked(it)"
                class="mini-btn is-danger"
                type="button"
                :disabled="busy"
                @click="onRemove(it)"
              >
                {{ armingKey === itemKeyOf(it) ? '确认删除' : '删除' }}
              </button>
            </li>
          </ul>
        </section>

        <!-- ---------------- 新建表单 ---------------- -->
        <section class="res-form-section">
          <div class="res-list-head">
            <span>{{ mode === 'create' ? `新增${def.title}` : `新建${def.title}` }}</span>
            <span v-if="authUser" class="res-auth-ok">已连接后端 · {{ authUser }}</span>
          </div>

          <div class="res-form">
            <label v-for="f in def.fields" :key="f.key" class="res-field" :class="`is-${f.type}`">
              <span class="res-field-label">
                {{ f.label }}
                <i v-if="f.required" class="req">*</i>
              </span>

              <n-input
                v-if="f.type === 'text' || f.type === 'number'"
                v-model:value="form[f.key]"
                size="small"
                :placeholder="f.placeholder"
                clearable
              />
              <!-- 密钥类：点眼睛临时看明文，避免旁边有人时泄屏 -->
              <n-input
                v-else-if="f.type === 'password'"
                v-model:value="form[f.key]"
                size="small"
                type="password"
                show-password-on="click"
                :placeholder="f.placeholder"
              />
              <n-input
                v-else-if="f.type === 'textarea'"
                v-model:value="form[f.key]"
                type="textarea"
                size="small"
                :rows="3"
                :placeholder="f.placeholder"
              />
              <n-select
                v-else-if="f.type === 'select'"
                v-model:value="form[f.key]"
                size="small"
                :options="f.options"
                :consistent-menu-width="false"
              />
              <n-switch
                v-else-if="f.type === 'switch'"
                size="small"
                :value="!!form[f.key]"
                @update:value="form[f.key] = $event"
              />
            </label>
          </div>

          <div class="res-form-foot">
            <span v-if="formError" class="res-error res-form-error">{{ formError }}</span>
            <span v-else-if="formHint" class="res-hint res-form-hint">{{ formHint }}</span>
            <n-button size="small" type="primary" :loading="busy" @click="onCreate">
              创建
            </n-button>
          </div>
        </section>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
/**
 * 资源管理弹窗（智能体 / MCP / 技能）
 *
 * 为什么三合一而不是三个弹窗组件：三者与后端的交互形状完全同构
 * （GET 列表 → POST 创建 → DELETE 删除，字段 differ），拆成三个组件
 * 必然出现三份「加载态 / 错误态 / 两步删除确认」的复制粘贴，改一处漏两处。
 * 差异全部收敛到 RESOURCE_DEFS 的字段表与两个钩子（buildPayload / validate）里。
 *
 * 联调约束：
 *  - 打开时若本地无 token，先 ensureBackendAuth() 用开发凭证静默登录；
 *    登录失败在列表区展示原因，表单仍可看但创建会被拦（避免攒一屏假数据）。
 *  - 创建成功后不关弹窗：用户通常要连续建几个，列表原地刷新即反馈。
 *  - 删除是两步确认（点一次变「确认删除」，点别处或 3s 后还原），不用 useDialog。
 */
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NInput, NModal, NSelect, NSwitch } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import {
  createAgent, createDataSource, createMcpConfig, createModelConfig, createSkill,
  deleteAgent, deleteDataSource, deleteMcpConfig, deleteModelConfig, deleteSkill,
  ensureBackendAuth,
  listAgents, listDataSources, listMcpConfigs, listModelConfigs, listSkills,
} from '@/api/resources'
import { getToken } from '@/api/client'
/**
 * 资源描述表抽到 @/resources/defs：ResourcePage 与本弹窗共用同一份，
 * 否则字段与列表展示规则会长出第二处副本（改一处漏一处的静默漂移）。
 */
import { RESOURCE_DEFS } from '@/resources/defs'

const show = defineModel('show', { type: Boolean, default: false })

const props = defineProps({
  /** 资源类型：agent | datasource | mcp | model | skill */
  type: { type: String, required: true },
  /**
   * 形态：
   *  · create —— 仅新增表单。三个资源页面（agent / mcp / skill）都走这个：
   *              列表已由所在页面承担，弹窗里再来一份就是重复。
   *  · manage —— 列表 + 新建表单同屏。**当前没有调用方**（三种资源都改成独立页面了），
   *              保留是因为它是「一口气连建几条」的批量维护形态，重新接入口只需一行
   *              `mode="manage"`；确认不再需要时，可连同列表区与其 load/remove 一起删。
   */
  mode: { type: String, default: 'create' },
})

const emit = defineEmits(['created'])

const def = computed(() => RESOURCE_DEFS[props.type] || RESOURCE_DEFS.agent)
const form = reactive(def.value.defaults())

/* ---------------- 状态与加载 ---------------- */

const items = ref([])
const loading = ref(false)
const busy = ref(false)
const loadError = ref('')
const formError = ref('')
const authUser = ref('')
/** 两步删除确认：记录当前处于「确认删除」态的条目 key，null 表示无 */
const armingKey = ref(null)
let armingTimer = null

function resetForm() {
  Object.assign(form, def.value.defaults())
}

/**
 * 数据源「类型」切换时自动预填连接配置模板（仅 datasource def 有 configPreset）。
 * 只在配置框为空、或内容恰好是**别的类型的模板**时覆盖 —— 用户手改过的 JSON 不动。
 */
watch(() => form.type, (t, prev) => {
  const presets = def.value.configPreset
  if (!presets || !t || t === prev) return
  const current = String(form.configJson || '')
  const isPresetOrEmpty = !current.trim() || Object.values(presets).includes(current)
  if (isPresetOrEmpty && presets[t]) {
    form.configJson = presets[t]
  }
})

/** 切换资源类型时：表单按新类型重置，列表由 show watch 统一加载 */
watch(() => props.type, () => {
  resetForm()
  formError.value = ''
  armingKey.value = null
})

watch(show, (v) => {
  if (v) open()
  else {
    armingKey.value = null
    clearTimeout(armingTimer)
  }
})

async function open() {
  formError.value = ''
  loadError.value = ''
  const auth = await ensureBackendAuth()
  if (!auth.ok) {
    loadError.value = `连接后端失败：${auth.error}（请确认 :9900 服务与登录凭证）`
    items.value = []
    return
  }
  // token 已存在时 ensureBackendAuth 不带 user 信息 —— 兜底一个展示文案，
  // 绝不能让 authUser 停在空串：否则创建路径会误判"未登录"（见 onCreate 的注释）
  authUser.value = auth.user || '已登录'
  // 新增形态没有列表区，不必发这次列表请求
  if (props.mode === 'manage') await load()
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const fetcher = { agent: listAgents, datasource: listDataSources, mcp: listMcpConfigs, model: listModelConfigs, skill: listSkills }[props.type]
    const data = await fetcher()
    items.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value = err?.message || '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

/* ---------------- 创建 ---------------- */

const formHint = computed(() => def.value.hint || '')

function onCreate() {
  formError.value = ''
  const f = def.value
  const missing = f.fields.find((fd) => fd.required && !String(form[fd.key] ?? '').trim())
  if (missing) {
    formError.value = `请填写「${missing.label}」`
    return
  }
  const custom = f.validate?.(form)
  if (custom) {
    formError.value = custom
    return
  }
  runCreate(f)
}

/**
 * 创建的登录保障**不能用递归**：曾有版本写成
 * `if (!authUser) ensureBackendAuth().then(() => onCreate())` —— 当 token 已存在
 * （ensureBackendAuth 不返回 user）时 authUser 永远是空串，递归没有出口，
 * 微任务队列被打爆，页面主线程直接冻死（表现是点了创建整页无响应）。
 * 现在改为：无 token 才登录，有 token 直接发请求，循环不可能发生。
 */
async function runCreate(f) {
  if (!getToken()) {
    const auth = await ensureBackendAuth()
    if (!auth.ok) {
      formError.value = `连接后端失败：${auth.error}`
      return
    }
    authUser.value = auth.user || '已登录'
  } else if (!authUser.value) {
    authUser.value = '已登录'
  }

  busy.value = true
  const creator = { agent: createAgent, datasource: createDataSource, mcp: createMcpConfig, model: createModelConfig, skill: createSkill }[props.type]
  try {
    await creator(f.buildPayload(form))
    resetForm()
    emit('created')
    if (props.mode === 'create') {
      // 新增形态是一次性表单（列表在页面上）：建完即关，让用户回到列表看结果
      show.value = false
    } else {
      // 管理形态不关弹窗：用户通常要连续建几个，列表原地刷新即反馈
      await load()
    }
  } catch (err) {
    formError.value = err?.message || '创建失败'
  } finally {
    busy.value = false
  }
}

/* ---------------- 删除（两步确认） ---------------- */

function itemKeyOf(it) { return def.value.itemKey(it) }
function itemNameOf(it) { return def.value.itemName(it) }

function onRemove(it) {
  const key = itemKeyOf(it)
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
  const remover = { agent: deleteAgent, datasource: deleteDataSource, mcp: deleteMcpConfig, model: deleteModelConfig, skill: deleteSkill }[props.type]
  remover(key)
    .then(() => load())
    .catch((err) => { loadError.value = err?.message || '删除失败' })
    .finally(() => { busy.value = false })
}
</script>

<style scoped>
/* ---- 弹窗卡片：与 SettingsPanel 同形态 ---- */
.res-card {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: calc(100vw - var(--space-8));
  max-height: min(640px, calc(100vh - var(--space-8)));
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--elevation-menu);
}
.res-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.res-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  color: var(--text-main);
  font-size: var(--text-md);
  font-weight: var(--font-medium);
}
.res-close {
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
.res-close:hover { background: var(--overlay-hover); color: var(--text-main); }

.res-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--space-4);
  overflow-y: auto;
}

/* ---- 列表 ---- */
.res-list-section + .res-form-section {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-light);
}
.res-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.res-auth-ok { color: var(--ok, var(--primary)); text-transform: none; letter-spacing: 0; }

.res-list {
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}
.res-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1-5) var(--space-1);
  border-radius: var(--radius-sm);
}
.res-item:hover { background: var(--overlay-hover); }
.res-item-main { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.res-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
  font-size: var(--text-sm);
}
.res-item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.res-item-tag {
  flex: 0 0 auto;
  padding: 0 var(--space-1-5);
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius-pill);
  background: var(--accent-tint-bg);
  color: var(--primary);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.res-item-tag.is-dim {
  border-color: var(--border-default);
  background: transparent;
  color: var(--text-faint);
}

.res-hint {
  margin: var(--space-2) 0 0;
  color: var(--text-faint);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}
.res-error {
  margin: var(--space-2) 0 0;
  color: var(--fail);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}

/* ---- 表单 ---- */
.res-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2) var(--space-3);
  margin-top: var(--space-3);
}
/* 长字段独占一行：提示词 / JSON / 名称 */
.res-field.is-textarea,
.res-field:first-child { grid-column: 1 / -1; }

.res-field { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.res-field-label {
  color: var(--text-sub);
  font-size: var(--text-xs);
}
.req { color: var(--fail); font-style: normal; }

.res-form-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.res-form-error,
.res-form-hint { margin: 0; flex: 1 1 auto; min-width: 0; }

/* ---- mini-btn：与 SettingsPanel 同款 ---- */
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
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
