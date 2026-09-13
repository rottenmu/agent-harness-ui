/**
 * useBackend —— 后端连接状态与数据源开关
 *
 * 工作台有两种取数方式：
 *  - remote：真实调用 agent-application（:9900，经 Vite 代理），登录 + 观测中心接口
 *  - mock  ：使用内置 mock 数据，用于后端未启动时仍能演示界面
 *
 * 设计取舍：连接失败时**自动降级到 mock 并保留失败原因**，而不是让界面空转——
 * 工作台首要职责是可用；同时把 mode/status/error 暴露给顶栏，让"现在是假数据"这件事
 * 始终可见，避免把 mock 结果误当成真实评测结论。
 */
import { computed, ref } from 'vue'
import { fetchDashboard } from '@/api/observ'
import { DEPARTMENTS, DEV_CREDENTIALS, getToken, login, logout } from '@/api/auth'

/**
 * 单例（与 usePiSession / useWorkspace 同款模式）。
 *
 * 曾经是每次调用新建实例 —— 评测工作台与运行时控制台各持一份 mode/status，
 * 工作台探测失败降级 mock 后，控制台无从得知，两处对"现在是真实数据还是
 * 模拟数据"的认知可能相反。连接状态是**应用级**事实，收拢为单例。
 */
let singleton = null

/** 连接状态：idle 未连接 / connecting 连接中 / online 已连通 / offline 不可用 */
export const CONNECTION = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ONLINE: 'online',
  OFFLINE: 'offline',
}

/** 数据源模式 */
export const MODE = { REMOTE: 'remote', MOCK: 'mock' }

export function useBackend() {
  if (!singleton) singleton = createBackend()
  return singleton
}

function createBackend() {
  const mode = ref(MODE.REMOTE)
  const status = ref(CONNECTION.IDLE)
  const lastError = ref('')
  const user = ref(null)

  const isRemote = computed(() => mode.value === MODE.REMOTE)
  const isOnline = computed(() => status.value === CONNECTION.ONLINE)
  /** 顶栏展示用：状态 + 模式合成一句话 */
  const statusText = computed(() => {
    if (mode.value === MODE.MOCK) return '本地模拟数据'
    if (status.value === CONNECTION.CONNECTING) return '正在连接后端…'
    if (status.value === CONNECTION.ONLINE) return `已连接后端${user.value ? ` · ${user.value}` : ''}`
    return '后端未连接'
  })

  /**
   * 连接后端：必要时先登录，再用大盘接口做一次轻量探测。
   *
   * @param {object} [credentials] 覆盖默认凭证（见 api/auth.js 的 DEV_CREDENTIALS）
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function connect(credentials = {}) {
    mode.value = MODE.REMOTE
    status.value = CONNECTION.CONNECTING
    lastError.value = ''
    try {
      if (!getToken()) {
        const session = await login(credentials)
        user.value = session?.nickname || session?.username || 'admin'
      }
      // 探测：dashboard 轻量且始终启用，能同时验证鉴权与业务链路
      await fetchDashboard(1)
      status.value = CONNECTION.ONLINE
      if (!user.value) user.value = DEV_CREDENTIALS.username
      return { ok: true }
    } catch (err) {
      status.value = CONNECTION.OFFLINE
      lastError.value = err?.message || String(err)
      user.value = null
      // 降级到 mock，保证界面仍可操作；失败原因保留在 lastError 供顶栏提示
      mode.value = MODE.MOCK
      return { ok: false, error: lastError.value }
    }
  }

  /** 手动切到本地模拟 */
  function useMockData(reason = '') {
    mode.value = MODE.MOCK
    status.value = CONNECTION.OFFLINE
    if (reason) lastError.value = reason
  }

  /** 退出登录并回到未连接态 */
  function disconnect() {
    logout()
    user.value = null
    status.value = CONNECTION.IDLE
    lastError.value = ''
  }

  return {
    mode, status, lastError, user,
    isRemote, isOnline, statusText,
    connect, useMockData, disconnect,
    departments: DEPARTMENTS,
  }
}
