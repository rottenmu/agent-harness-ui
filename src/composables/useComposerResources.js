/**
 * Composer 资源加载器：技能 / MCP / 模型配置（模块级单例）
 *
 * 为什么是 composable 而不是在 Composer 里直接调接口：
 * Composer 是 dumb 组件（命令实现在父级、数据经 props 注入），它不该知道后端；
 * 而这些数据在多个表面间是同一份事实，做成单例后首个调用方触发加载、其余复用。
 *
 * Agent 不在这里：usePiSession.loadRuntimeAgentOptions 已经拉过一次执行目标
 * （顶栏下拉与 `@` 菜单同源），再拉一份就是同一事实的两个副本。
 */
import { computed, ref } from 'vue'
import { listMcpConfigs, listModelConfigs, listSkills, ensureBackendAuth } from '@/api/resources'

const skills = ref([])
const mcpConfigs = ref([])
const modelConfigs = ref([])

const loaded = ref(false)
const loading = ref(false)
const loadError = ref('')

/** 显式停用的行不进选项；字段缺省视为启用 */
const isEnabled = (row) => row?.enabled !== false

/**
 * 一次性加载（幂等）：静默登录兜底 → 三列表并行拉取。
 * 失败不抛出，把原因留在 loadError 供父级记录日志；列表保持为空，
 * 菜单/下拉自然为空态，与「后端不可用」的整体降级表现一致。
 */
async function ensureLoaded() {
  if (loaded.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const auth = await ensureBackendAuth()
    if (!auth.ok) throw new Error(auth.error || '后端登录失败')
    const [sk, mc, md] = await Promise.all([listSkills(), listMcpConfigs(), listModelConfigs()])
    skills.value = Array.isArray(sk) ? sk : []
    mcpConfigs.value = (Array.isArray(mc) ? mc : []).filter(isEnabled)
    modelConfigs.value = (Array.isArray(md) ? md : []).filter(isEnabled)
    loaded.value = true
  } catch (err) {
    loadError.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

/** `/` 菜单条目：技能 → 面板行（name/hint/detail 与 SlashMenu 契约一致） */
const skillMenuItems = computed(() =>
  skills.value.map((s) => ({
    name: `/${s.name}`,
    hint: s.readOnly === false ? '读写技能' : s.readOnly === true ? '只读技能' : '技能',
    detail: s.description || '',
  })),
)

/** MCP 多选选项（foot 左侧）：值与展示都用 name，语义直观且稳定 */
const mcpSelectOptions = computed(() =>
  mcpConfigs.value.map((m) => ({ label: m.name, value: m.name })),
)

/** 模型下拉选项：选中值即配置名（configName），随真实配置增删自动跟随 */
const modelSelectOptions = computed(() =>
  modelConfigs.value.map((m) => ({ label: m.configName, value: m.configName })),
)

export function useComposerResources() {
  return {
    skills, mcpConfigs, modelConfigs,
    loading, loadError, ensureLoaded,
    skillMenuItems, mcpSelectOptions, modelSelectOptions,
  }
}
