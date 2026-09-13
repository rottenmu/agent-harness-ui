<template>
  <!-- ============================================================
       MCP 导入弹窗：粘贴或选择标准 mcpServers JSON 文件 → 解析预览 → 批量创建
       输入兼容 {mcpServers:{...}} / 裸映射 / 数组三种形状（见 resources/mcpIO.js）
       ============================================================ -->
  <n-modal
    v-model:show="show"
    :auto-focus="false"
    esc-close
    mask-closable
    transform-origin="center"
  >
    <div class="mcp-imp-card" role="dialog" aria-modal="true" aria-label="导入 MCP 配置">
      <header class="mcp-imp-head">
        <span class="mcp-imp-title">
          <AppIcon name="terminal" :size="12" />
          导入 MCP 配置
        </span>
        <button class="res-close" type="button" aria-label="关闭导入" @click="show = false">
          <AppIcon name="close" :size="12" />
        </button>
      </header>

      <div class="mcp-imp-body">
        <p class="mcp-imp-hint">
          粘贴标准 <code>mcpServers</code> JSON，或选择 .json 文件。支持一次导入多个服务；
          与现有配置重名的条目自动跳过。
        </p>

        <div class="mcp-imp-file-row">
          <label class="mini-btn mcp-imp-file-btn">
            <AppIcon name="folder" :size="11" />
            选择 JSON 文件
            <input
              type="file"
              accept=".json,application/json"
              @change="onPickFile"
            />
          </label>
          <span v-if="fileName" class="mcp-imp-file-name" :title="fileName">{{ fileName }}</span>
        </div>

        <textarea
          v-model="rawText"
          class="mcp-imp-text"
          spellcheck="false"
          placeholder='{
  "mcpServers": {
    "agent-memory": {
      "type": "http",
      "url": "http://localhost:9900/api/agent-memory/mcp",
      "description": "智能体记忆管理",
      "disabled": false
    }
  }
}'
          @input="onEditText"
        />

        <!-- 解析结果预览 -->
        <div v-if="parseError" class="mcp-imp-msg is-error">{{ parseError }}</div>
        <div v-else-if="parsed.length" class="mcp-imp-msg is-ok">
          解析到 {{ parsed.length }} 个服务：
          <span class="mcp-imp-names">{{ parsed.map((s) => s.name).join('、') }}</span>
          <span v-if="dupCount" class="mcp-imp-dup">（{{ dupCount }} 个与现有重名将跳过）</span>
        </div>

        <div v-if="resultMsg" class="mcp-imp-result" :class="{ 'is-error': failCount > 0 }">
          {{ resultMsg }}
        </div>
      </div>

      <footer class="mcp-imp-foot">
        <span class="mcp-imp-foot-note">导入即创建，创建后立即出现在列表中</span>
        <button class="mini-btn" type="button" @click="show = false">关闭</button>
        <n-button
          size="small"
          type="primary"
          :disabled="!parsed.length"
          :loading="importing"
          @click="onImport"
        >
          导入 {{ parsed.length ? `(${parsed.length})` : '' }}
        </n-button>
      </footer>
    </div>
  </n-modal>
</template>

<script setup>
/**
 * MCP 导入弹窗
 *
 * 职责边界：解析（mcpIO.parseMcpServersJson）→ 预览 → 逐条调 createMcpConfig。
 * 后端没有批量接口也没有重名校验 —— 重名去重在**前端**做（对照打开时的
 * existingNames 快照），失败逐条上报不中断（一条失败不影响其余条目落地）。
 */
import { computed, ref, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import { parseMcpServersJson, toBackendConfig } from '@/resources/mcpIO'
import { createMcpConfig } from '@/api/resources'

const show = defineModel('show', { type: Boolean, default: false })
const props = defineProps({
  /** 打开弹窗时的现有配置名快照，用于重名跳过（父组件在打开时刷新并传入） */
  existingNames: { type: Array, default: () => [] },
})
const emit = defineEmits(['imported'])

const rawText = ref('')
const fileName = ref('')
const parseError = ref('')
const importing = ref(false)
const resultMsg = ref('')
const failCount = ref(0)

/** 解析出的服务列表（实时随文本变化；非法时为空数组） */
const parsed = computed(() => {
  if (!rawText.value.trim()) return []
  const r = parseMcpServersJson(rawText.value)
  return r.ok ? r.servers : []
})

/** 与现有配置重名的条目数（导入时跳过） */
const dupCount = computed(() => {
  const have = new Set(props.existingNames)
  return parsed.value.filter((s) => have.has(s.name)).length
})

// 每次打开清掉上一次的粘贴内容与结果，避免误把旧配置再导一遍
watch(show, (v) => {
  if (v) {
    rawText.value = ''
    fileName.value = ''
    parseError.value = ''
    resultMsg.value = ''
    failCount.value = 0
  }
})

function onEditText() {
  fileName.value = ''
  resultMsg.value = ''
  const r = parseMcpServersJson(rawText.value)
  parseError.value = rawText.value.trim() && !r.ok ? r.error : ''
}

/** 文件选择：读进 textarea 走同一条解析路径（文件与粘贴不是两条管道） */
function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选择同一个文件
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    fileName.value = file.name
    rawText.value = String(reader.result || '')
    onEditText()
  }
  reader.onerror = () => {
    parseError.value = `读取文件失败：${file.name}`
  }
  reader.readAsText(file, 'utf-8')
}

async function onImport() {
  if (!parsed.value.length || importing.value) return
  importing.value = true
  resultMsg.value = ''
  const have = new Set(props.existingNames)
  let imported = 0
  let skipped = 0
  const failed = []

  for (const s of parsed.value) {
    if (have.has(s.name)) {
      skipped += 1
      continue
    }
    try {
      await createMcpConfig(toBackendConfig(s.name, s.cfg))
      have.add(s.name) // 同批内同名也视为已存在
      imported += 1
    } catch (err) {
      failed.push(`${s.name}（${err?.message || '创建失败'}）`)
    }
  }

  failCount.value = failed.length
  const parts = [`导入成功 ${imported} 个`]
  if (skipped) parts.push(`跳过重名 ${skipped} 个`)
  if (failed.length) parts.push(`失败 ${failed.length} 个：${failed.join('；')}`)
  resultMsg.value = parts.join('，')
  importing.value = false
  if (imported > 0) emit('imported')
}
</script>

<style scoped>
.mcp-imp-card {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - var(--space-8)));
  max-height: min(560px, calc(100vh - var(--space-8)));
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--elevation-menu);
}
.mcp-imp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.mcp-imp-title { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-md); font-weight: var(--font-medium); }

.mcp-imp-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--space-3) var(--space-4);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.mcp-imp-hint { margin: 0; color: var(--text-faint); font-size: var(--text-xs); }
.mcp-imp-hint code {
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: var(--overlay-active);
  font-family: var(--font-mono);
}

.mcp-imp-file-row { display: flex; align-items: center; gap: var(--space-2); min-height: 24px; }
.mcp-imp-file-btn { position: relative; overflow: hidden; cursor: pointer; }
.mcp-imp-file-btn input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.mcp-imp-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.mcp-imp-text {
  flex: 1 1 auto;
  min-height: 180px;
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.5;
  resize: vertical;
}
.mcp-imp-text:focus { outline: none; border-color: var(--primary); }

.mcp-imp-msg {
  padding: var(--space-1-5) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}
.mcp-imp-msg.is-error {
  border: 1px solid var(--danger-tint-border);
  background: var(--danger-tint-bg);
  color: var(--fail);
}
.mcp-imp-msg.is-ok {
  border: 1px solid var(--accent-tint-border);
  background: var(--accent-tint-bg);
  color: var(--text-sub);
}
.mcp-imp-names { color: var(--text-main); font-family: var(--font-mono); }
.mcp-imp-dup { color: var(--text-faint); }

.mcp-imp-result {
  padding: var(--space-1-5) var(--space-2);
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius-sm);
  background: var(--accent-tint-bg);
  color: var(--text-sub);
  font-size: var(--text-xs);
}
.mcp-imp-result.is-error {
  border-color: var(--danger-tint-border);
  background: var(--danger-tint-bg);
  color: var(--fail);
}

.mcp-imp-foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-light);
}
.mcp-imp-foot-note { flex: 1 1 auto; min-width: 0; color: var(--text-faint); font-size: var(--text-xs); }

/* 与 ResourceManagerModal 的关闭按钮同款（scoped 下各自一份，样式来源一致） */
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
</style>
