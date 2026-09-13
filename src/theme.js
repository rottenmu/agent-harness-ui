/**
 * 主题与色板
 *
 * 设计原则：**颜色只有一个来源** —— `src/styles/theme-values.css` 里的 CSS 变量。
 *
 * 上一版这里同时还写了一份 `PALETTE` 字面量，改色必须两处同步，注释里也写着
 * 「改色时两处都要改」；这与参照项目 pi-gui 复盘里那类「同一状态两处各自推导」
 * 是同一个病。现在改为：
 *
 *   · CSS 侧：theme-values.css 的 `:root`（浅）与 `:root.dark`（深）
 *   · JS  侧：本文件在挂载后从 CSS 变量**读出**实际取值，填入 PALETTE 等映射表
 *
 * 为什么不能直接用 `getPropertyValue` 拿到值就完事：
 *   tokens.css 里大量颜色是 `color-mix(in srgb, ...)`，`getPropertyValue` 只会原样
 *   返回那个函数字符串。这个字符串在 CSS 里能用，但 JS 侧消费方（D3 设置 SVG 的
 *   fill/stroke 属性）不认。所以下面用探针元素读 `background-color` 的 computed 值，
 *   让浏览器把 color-mix 解析成确定的 rgb()。
 *
 * 用法：
 *   App.vue 调 useTheme() 拿 mode / naiveTheme / themeOverrides；
 *   需要具体色值的 JS 逻辑（D3、状态点）直接读 PALETTE 等映射表 ——
 *   它们在 setThemeMode() 时被原地更新，因此组件里的引用无需重建。
 */
import { computed, ref } from 'vue'
import { darkTheme, lightTheme } from 'naive-ui'

/** 主题模式：'dark' | 'light' */
const mode = ref('dark')

/**
 * 从 CSS 变量解析出一个**确定的颜色**。
 *
 * 做法是把变量挂到一个离屏探针元素的 background-color 上再读 computed 值 ——
 * 浏览器会在这里把 color-mix() / 相对颜色等表达式解析为 rgb()。
 * 直接对非颜色变量用本函数会得到透明色，故只用于颜色变量。
 *
 * 解析不出来时返回**空串**而不是某个"备选色值"。
 * 刻意不给备选色：一旦这里写死一个色值，它就变成了第二份色板 ——
 * 改了 theme-values.css 却忘了改这里，界面会在某个分支上悄悄退回旧色。
 * 调用方拿到空串要么用同一套里的其他令牌兜底（如 primaryHover 退回 primary），
 * 要么就该显式地失败。
 */
function resolveColor(varName) {
  if (typeof document === 'undefined') return ''
  const probe = document.createElement('span')
  probe.style.cssText =
    `position:absolute;left:-9999px;top:0;width:1px;height:1px;background:var(${varName})`
  document.body.appendChild(probe)
  const value = getComputedStyle(probe).backgroundColor
  probe.remove()
  // 变量不存在时 background 计算值为 rgba(0, 0, 0, 0)，视为无效
  return !value || value === 'rgba(0, 0, 0, 0)' ? '' : value
}

/**
 * 色板常量（供 JS 逻辑复用：状态点、图节点、消息类型标签）。
 *
 * 初值**全部为空串**，只作占位 —— 挂载前读到空串说明有组件在 initTheme 之前
 * 取了色值，那是时序缺陷，应该暴露出来而不是被一个看似合理的默认色掩盖。
 * 正常路径：main.js 在 mount 之前调 initTheme() → refreshPalette() 填满。
 */
export const PALETTE = {
  page: '',
  sidebar: '',
  card: '',
  elevated: '',
  border: '',
  primary: '',
  pass: '',
  fail: '',
  running: '',
  textMain: '',
  textSub: '',
  textFaint: '',
}

/** 用例状态 -> 色点颜色 */
export const STATUS_DOT_COLORS = {
  pass: PALETTE.pass,
  fail: PALETTE.fail,
  running: PALETTE.running,
  idle: PALETTE.textSub,
}

/** 消息类型 -> 边框/标签颜色 */
export const MESSAGE_TYPE_COLORS = {
  User: PALETTE.textSub,
  Agent: PALETTE.primary,
  ToolCall: PALETTE.pass,
  Error: PALETTE.fail,
}

/** 节点类型 -> 填充色（Execution Graph） */
export const NODE_COLORS = {
  start: PALETTE.textSub,
  llm: PALETTE.primary,
  tool: PALETTE.pass,
  end: PALETTE.fail,
  error: PALETTE.fail,
}

/** 图上的连线与节点文字色（原先硬编码在 useExecutionGraph 里） */
export const GRAPH_INK = {
  link: PALETTE.border,
  nodeText: PALETTE.textMain,
}

/** CSS 变量名 -> 上面几张表的键。集中一处，避免变量名散落在取值逻辑里。 */
const PALETTE_VARS = {
  page: '--bg-page',
  sidebar: '--bg-sidebar',
  card: '--bg-card',
  elevated: '--bg-elevated',
  border: '--border-heavy',
  primary: '--primary',
  pass: '--pass',
  fail: '--fail',
  running: '--running',
  textMain: '--text-main',
  textSub: '--text-sub',
  textFaint: '--text-faint',
}

/**
 * 把 CSS 变量的实际取值填回 JS 侧映射表（原地改，不换对象引用）。
 *
 * 时序要求：必须在 <html> 的 dark 类已经落定之后再调，否则读到的还是上一套值。
 */
export function refreshPalette() {
  Object.entries(PALETTE_VARS).forEach(([key, varName]) => {
    PALETTE[key] = resolveColor(varName)
  })

  STATUS_DOT_COLORS.pass = PALETTE.pass
  STATUS_DOT_COLORS.fail = PALETTE.fail
  STATUS_DOT_COLORS.running = PALETTE.running
  STATUS_DOT_COLORS.idle = PALETTE.textSub

  MESSAGE_TYPE_COLORS.User = PALETTE.textSub
  MESSAGE_TYPE_COLORS.Agent = PALETTE.primary
  MESSAGE_TYPE_COLORS.ToolCall = PALETTE.pass
  MESSAGE_TYPE_COLORS.Error = PALETTE.fail

  NODE_COLORS.start = PALETTE.textSub
  NODE_COLORS.llm = PALETTE.primary
  NODE_COLORS.tool = PALETTE.pass
  NODE_COLORS.end = PALETTE.fail
  NODE_COLORS.error = PALETTE.fail

  GRAPH_INK.link = PALETTE.border
  GRAPH_INK.nodeText = PALETTE.textMain
}

/** 本地偏好键名：刷新页面后保持用户选择 */
const MODE_KEY = 'harness.themeMode'

/** 从 CSS 变量重建 NaiveUI 的主题覆写；色值仍是「读出来的」，不是第二份字面量 */
function buildThemeOverrides() {
  return {
    common: {
      primaryColor: PALETTE.primary,
      // hover / pressed 是独立令牌；缺失时退回同一套里的 primary，而不是另写一个色值
      primaryColorHover: resolveColor('--primary-hover') || PALETTE.primary,
      primaryColorPressed: resolveColor('--primary-pressed') || PALETTE.primary,
      successColor: PALETTE.pass,
      errorColor: PALETTE.fail,
      warningColor: PALETTE.running,
      bodyColor: PALETTE.page,
      cardColor: PALETTE.card,
      modalColor: PALETTE.elevated,
      popoverColor: PALETTE.elevated,
      textColorBase: PALETTE.textMain,
      textColor1: PALETTE.textMain,
      textColor2: PALETTE.textSub,
      textColor3: PALETTE.textFaint,
      borderColor: PALETTE.border,
      dividerColor: PALETTE.border,
    },
  }
}

/** 传给 n-config-provider 的覆写对象；随模式切换整体替换以触发重算 */
const overrides = ref(buildThemeOverrides())

/** 当前模式对应的 NaiveUI 主题对象 */
const naiveTheme = computed(() => (mode.value === 'dark' ? darkTheme : lightTheme))

/**
 * 切换模式：先落 <html> 的类 → 再刷新两份 JS 侧取值。
 * 顺序不能反：refreshPalette 读的是 computed style，类没落定时读到的是旧主题。
 */
function setThemeMode(next, { persist = true } = {}) {
  mode.value = next === 'light' ? 'light' : 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', mode.value === 'dark')
  refreshPalette()
  overrides.value = buildThemeOverrides()
  if (persist) {
    try {
      localStorage.setItem(MODE_KEY, mode.value)
    } catch (err) {
      // 隐私模式下 localStorage 可能不可写，静默降级为「本次会话有效」
    }
  }
}

/** 读取持久化偏好；无偏好时跟随系统 */
function resolveInitialMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch (err) {
    /* 同上，忽略 */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** 挂载时调用一次：定模式、填色板、返回当前模式 */
export function initTheme() {
  setThemeMode(resolveInitialMode(), { persist: false })
  return mode.value
}

export function useTheme() {
  return {
    mode,
    naiveTheme,
    themeOverrides: overrides,
    setThemeMode,
    toggleMode: () => setThemeMode(mode.value === 'dark' ? 'light' : 'dark'),
  }
}

export { darkTheme, lightTheme }
