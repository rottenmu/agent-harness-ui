/**
 * Monaco Editor 装配
 *
 * monaco 需要 Web Worker 才能提供语法高亮/校验能力；Vite 下必须显式声明 worker
 * 入口，否则控制台会刷 "Could not create web worker" 并且编辑器退化为纯文本。
 * 采用 Vite 原生的 `?worker` 导入方式，无需额外插件。
 */
import * as monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let workersReady = false

/** 按语言分发到对应 worker */
function setupMonacoWorkers() {
  self.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    },
  }
}

/**
 * 幂等地完成 worker 装配。
 * 多次调用只生效一次，可安全地在模块顶层或编辑器初始化前调用。
 */
export function ensureMonacoReady() {
  if (workersReady) return monaco
  setupMonacoWorkers()
  workersReady = true
  return monaco
}

export default monaco
