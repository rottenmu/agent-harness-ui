/**
 * useMonacoEditor —— Monaco 编辑器生命周期封装
 *
 * 解决三件事：
 *  1. 创建/销毁配对，杜绝编辑器泄漏；
 *  2. 隐藏容器（Tab 不可见）中 layout 失效，需在容器可见后手动 layout()；
 *  3. 切换内容时保留撤销栈 —— setValue() 会重置 undo 历史，改用 pushEditOperations。
 *
 * 用法：
 *  ```js
 *  const { hostRefs, editors, initEditors, setValue, getValue, layout } = useMonacoEditor({
 *    instances: [{ key: 'system', language: 'markdown', initial: '...' }],
 *  })
 *  // 模板：<div :ref="hostRefs.system" class="monaco-host" />
 *  ```
 */
import { nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import monaco, { ensureMonacoReady } from '@/monaco-setup'

// 挂载 worker（幂等）；monaco 需要 Web Worker 才有语法高亮与校验
ensureMonacoReady()

/** monaco 通用 options（vs-dark + 关 minimap） */
const BASE_OPTIONS = {
  theme: 'vs-dark',
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
}

/**
 * 写入编辑器内容但保留撤销历史。
 * 与原实现同一策略：setValue 会清空 undo 栈，pushEditOperations 不会。
 */
export function pushValue(editor, value) {
  const model = editor?.getModel()
  if (!model || model.getValue() === value) return
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null)
}

export function useMonacoEditor({ instances = [] } = {}) {
  /** 各编辑器容器 ref：key -> (el) => void，用于模板 :ref 绑定 */
  const hostRefs = {}
  const hostEls = {}
  instances.forEach(({ key }) => {
    hostEls[key] = ref(null)
    hostRefs[key] = (el) => {
      hostEls[key].value = el
    }
  })

  /** 创建完成的实例：key -> editor */
  const editors = shallowRef({})
  /** 待释放资源（editor + 内容变更订阅） */
  const disposables = []
  /** 各实例语言与初始值声明，供 init 使用 */
  const specs = instances

  /**
   * 创建一个编辑器；容器不存在或已创建过则跳过。
   * 容器可能因 Tab 懒渲染而晚于 onMounted 出现，故本函数必须可在后续时机重复调用。
   */
  function createOne(spec) {
    const existing = editors.value[spec.key]
    if (existing) return existing
    const host = hostEls[spec.key]?.value
    if (!host) return null
    const editor = monaco.editor.create(host, {
      ...BASE_OPTIONS,
      value: spec.initial ?? '',
      language: spec.language || 'plaintext',
    })
    const sub = editor.onDidChangeModelContent(() => spec.onChange?.(editor.getValue()))
    disposables.push({ editor, sub })
    editors.value = { ...editors.value, [spec.key]: editor }
    return editor
  }

  /**
   * 创建全部编辑器（容器须已挂载，通常在 onMounted 的 nextTick 中调用）。
   * 幂等：已存在的实例不会被重建；容器尚未渲染的实例会被跳过，可由 layout() 兜底补建。
   */
  async function initEditors() {
    await nextTick()
    const next = {}
    specs.forEach((spec) => {
      next[spec.key] = createOne(spec) || editors.value[spec.key] || null
    })
    editors.value = { ...editors.value, ...next }
    return next
  }

  function getEditor(key) {
    return editors.value[key] || null
  }

  function getValue(key) {
    return getEditor(key)?.getValue() ?? ''
  }

  function setValue(key, value) {
    pushValue(getEditor(key), value)
  }

  /**
   * 强制重新布局（容器由隐藏转可见后必须调用）。
   * 同时兜底补建：容器在 onMounted 时因 Tab 懒渲染尚不存在的编辑器，会在此处首次创建。
   */
  function layout(...keys) {
    const targets = keys.length ? keys : specs.map((s) => s.key)
    targets.forEach((k) => {
      const spec = specs.find((s) => s.key === k)
      const editor = getEditor(k) || (spec ? createOne(spec) : null)
      editor?.layout()
    })
  }

  /** 校验某编辑器内容是否为合法 JSON */
  function isValidJson(key) {
    try {
      JSON.parse(getValue(key))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  /** 释放全部资源；editor.dispose() 会一并销毁其绑定的 model */
  function disposeEditors() {
    disposables.forEach(({ editor, sub }) => {
      sub?.dispose()
      editor?.dispose()
    })
    disposables.length = 0
    editors.value = {}
  }

  onBeforeUnmount(disposeEditors)

  return {
    hostRefs,
    editors,
    initEditors,
    getEditor,
    getValue,
    setValue,
    layout,
    isValidJson,
    disposeEditors,
  }
}
