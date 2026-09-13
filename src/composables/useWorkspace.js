/**
 * useWorkspace —— 当前工作区（应用级上下文）
 *
 * ---------------------------------------------------------------------------
 * 为什么单独开一个单例，而不是塞进 usePiSession
 * ---------------------------------------------------------------------------
 * 会话记录上只有 `workspace` 这个**字符串**字段（见 mock/sessions.js），
 * 它回答的是「这条会话属于哪个项目目录」。而「我此刻在哪个工作区里工作」是
 * 另一个事实 —— 它决定新会话归到哪、主区域顶栏显示什么、设置里改的是哪一项。
 *
 * 把后者塞进 usePiSession 会让两件事互相纠缠：会话可以被归档清空，工作区不能；
 * 反过来，工作区从清单里移除也不该动到任何一条会话记录。所以两者分开建模。
 *
 * 依赖方向是**单向**的 `usePiSession → useWorkspace`：会话新建时要读当前工作区，
 * 而工作区不反过来统计会话数 —— 否则形成环，且「移除工作区」会变成一件有副作用的事。
 *
 * ---------------------------------------------------------------------------
 * 三条约束
 * ---------------------------------------------------------------------------
 * 1. 选择结果持久化到 localStorage。选工作区是跨会话偏好，刷新后应当保持；
 *    而会话列表本身不落库（那是模拟数据的性质），两者不能混为一谈。
 * 2. `name` 在清单内**唯一**。侧栏 THREADS 是按 workspace 名字分组的，
 *    同名不同路径会让两组会话在界面上合并成一组，用户无从分辨。
 * 3. 移除工作区**不删除会话**。已属于它的会话仍按原名分组显示 —— 这正是
 *    「工作区清单」与「会话分组」是两件事的体现。
 */
import { computed, ref } from 'vue'

/** 清单种子：对应 mock 会话里出现过的两个 workspace 名 + 侧栏 WORKSPACE 区的三个预设 */
const WORKSPACE_SEED = [
  { id: 'ws-agent-runner', name: 'agent_runner', path: 'D:\\codehub\\agent_runner', kind: 'local' },
  { id: 'ws-harness', name: 'harness', path: 'D:\\.app\\deepseek-harness', kind: 'local' },
  { id: 'ws-home', name: 'Home', path: '', kind: 'local' },
  { id: 'ws-sandbox', name: 'sandbox', path: '', kind: 'local' },
  { id: 'ws-org', name: '组织', path: '', kind: 'local' },
]

/** 默认激活的工作区（4/5 条 mock 会话都属于它） */
const DEFAULT_ACTIVE_ID = 'ws-agent-runner'

const LIST_KEY = 'harness.workspaces'
const ACTIVE_KEY = 'harness.activeWorkspace'

let uidSeq = 0
function uid() {
  uidSeq += 1
  return `ws-${Date.now().toString(36)}-${uidSeq}`
}

/** 读清单：损坏或为空时回落到种子，不让界面停在"没有工作区"的空态 */
function readList() {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (!raw) return WORKSPACE_SEED.map((w) => ({ ...w }))
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return WORKSPACE_SEED.map((w) => ({ ...w }))
    // 逐条校验：历史数据缺字段时补默认，避免 id/name 为 undefined 的项混进清单
    return parsed
      .filter((w) => w && typeof w.name === 'string' && w.name.trim())
      .map((w) => ({
        id: typeof w.id === 'string' && w.id ? w.id : uid(),
        name: w.name.trim(),
        path: typeof w.path === 'string' ? w.path : '',
        kind: w.kind === 'worktree' ? 'worktree' : 'local',
      }))
  } catch (err) {
    return WORKSPACE_SEED.map((w) => ({ ...w }))
  }
}

/**
 * 旧版本清单迁移：预设工作区（Home / sandbox / 组织）是后来加的，
 * 已经存过 localStorage 的用户清单里没有它们 —— 按 id（其次按名字）查缺补种，
 * 保证侧栏 WORKSPACE 区的三项在任何存量数据下都出现。
 */
function ensurePresetWorkspaces(list) {
  for (const preset of WORKSPACE_SEED) {
    const exists = list.some(
      (w) => w.id === preset.id || w.name.toLowerCase() === preset.name.toLowerCase(),
    )
    if (!exists) list.push({ ...preset })
  }
  return list
}

function readActiveId(list) {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY)
    if (saved && list.some((w) => w.id === saved)) return saved
  } catch (err) {
    /* 隐私模式下读不到就回落默认，不值得中断 */
  }
  // 默认值可能已经被用户从清单里删掉，此时退回第一条
  return list.some((w) => w.id === DEFAULT_ACTIVE_ID) ? DEFAULT_ACTIVE_ID : list[0]?.id || ''
}

function createWorkspaceStore() {
  const seedList = readList()
  /** 旧清单是否被补种过（补种过就顺手持久化，避免每次启动都重复迁移） */
  const migrated = seedList.length !== readList().length
  const workspaces = ref(ensurePresetWorkspaces(seedList))
  const activeWorkspaceId = ref(readActiveId(workspaces.value))

  const activeWorkspace = computed(
    () => workspaces.value.find((w) => w.id === activeWorkspaceId.value) || null,
  )
  /** 会话记录上的 workspace 字段用的是名字，这里统一出口，避免各处再取一次 `.name` */
  const activeWorkspaceName = computed(() => activeWorkspace.value?.name || '')

  function persistList() {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(workspaces.value))
    } catch (err) {
      /* 写不进去就只在本次会话内有效 */
    }
  }

  function persistActive() {
    try {
      localStorage.setItem(ACTIVE_KEY, activeWorkspaceId.value)
    } catch (err) {
      /* 同上 */
    }
  }

  // 旧清单迁移补种过就立即持久化，避免每次启动都重复迁移
  if (migrated) persistList()

  /**
   * 选中一个工作区。
   * @returns {{ok: boolean, reason?: string}}
   */
  function selectWorkspace(id) {
    if (!workspaces.value.some((w) => w.id === id)) return { ok: false, reason: 'not-found' }
    if (activeWorkspaceId.value === id) return { ok: true }
    activeWorkspaceId.value = id
    persistActive()
    return { ok: true }
  }

  /**
   * 把一条工作区加进清单。
   *
   * 路径与名字都要求唯一：路径重复是同一目录的两份记录，名字重复会让侧栏分组合并。
   *
   * @param {{name: string, path: string, kind?: 'local'|'worktree'}} input
   * @returns {{ok: boolean, reason?: string, id?: string}}
   */
  function addWorkspace(input = {}) {
    const name = String(input.name || '').trim()
    const path = String(input.path || '').trim()
    if (!name) return { ok: false, reason: 'empty-name' }
    if (workspaces.value.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, reason: 'duplicate-name' }
    }
    if (path && workspaces.value.some((w) => w.path && w.path.toLowerCase() === path.toLowerCase())) {
      return { ok: false, reason: 'duplicate-path' }
    }

    const id = uid()
    workspaces.value.push({ id, name, path, kind: input.kind === 'worktree' ? 'worktree' : 'local' })
    persistList()
    return { ok: true, id }
  }

  /**
   * 从清单移除一条工作区。
   *
   * **不会**删除属于它的会话 —— 见文件头约束 3。
   * 最后一条不允许移除：没有工作区时「新建会话」就没有归属，界面会进入一个
   * 需要额外空态处理的中间状态；那不值当，保持至少一条是更低的复杂度。
   */
  function removeWorkspace(id) {
    if (workspaces.value.length <= 1) return { ok: false, reason: 'last-workspace' }
    const idx = workspaces.value.findIndex((w) => w.id === id)
    if (idx < 0) return { ok: false, reason: 'not-found' }

    const [removed] = workspaces.value.splice(idx, 1)
    if (activeWorkspaceId.value === removed.id) {
      activeWorkspaceId.value = workspaces.value[0].id
      persistActive()
    }
    persistList()
    return { ok: true }
  }

  /** 恢复默认清单（设置面板里的兜底入口） */
  function resetWorkspaces() {
    workspaces.value = WORKSPACE_SEED.map((w) => ({ ...w }))
    activeWorkspaceId.value = activeWorkspace.value ? activeWorkspaceId.value : workspaces.value[0].id
    if (!workspaces.value.some((w) => w.id === activeWorkspaceId.value)) {
      activeWorkspaceId.value = workspaces.value[0].id
    }
    persistList()
    persistActive()
  }

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeWorkspaceName,
    selectWorkspace,
    addWorkspace,
    removeWorkspace,
    resetWorkspaces,
  }
}

/**
 * 单例入口。
 *
 * 与 usePiSession 同理：侧栏、主区域顶栏、设置面板三处都要读同一份「当前工作区」，
 * 各自新建一份就会出现「顶栏显示 A、新建会话归到 B」这类两边都不报错的漂移。
 */
let singleton = null

export function useWorkspace() {
  if (!singleton) singleton = createWorkspaceStore()
  return singleton
}

/** 供外部构造会话记录时复用同一套种子（避免"默认工作区名字"散落成字面量） */
export { WORKSPACE_SEED }
