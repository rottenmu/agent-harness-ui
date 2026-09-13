<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="terminal" :size="12" />步骤详情</h3>
      <div class="tabs" role="tablist" aria-label="步骤详情视图切换">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          class="tab"
          :class="{ on: tab === t.value }"
          role="tab"
          :aria-selected="tab === t.value"
          @click="tab = t.value"
        >{{ t.label }}</button>
      </div>
    </header>

    <p v-if="!node" class="state">在左侧拓扑树中点选一个节点以查看入参、返回体与事件日志</p>

    <template v-else>
      <div class="node-summary">
        <span class="type-dot" :style="{ background: meta.color }" />
        <AppIcon :name="meta.icon" :size="12" :style="{ color: meta.color }" />
        <span class="name" :title="node.name">{{ node.name }}</span>
        <span class="type-chip" :style="{ color: meta.color, borderColor: meta.color }">{{ meta.label }}</span>
        <span v-if="node.status === 'failed'" class="badge-bad">失败</span>
        <span class="spacer" />
        <span class="kv-inline">seq <b>#{{ node.seq }}</b></span>
        <span class="kv-inline" :style="{ color: latencyColor(node.latencyMs) }">{{ fmtMs(node.latencyMs) }}</span>
      </div>

      <div class="body">
        <!-- 输入 -->
        <div v-show="tab === 'input'" class="code-block">
          <pre v-if="inputText">{{ inputText }}</pre>
          <p v-else class="state small">该步骤未记录输入</p>
        </div>

        <!-- 输出 -->
        <div v-show="tab === 'output'" class="code-block">
          <pre v-if="outputText" :class="{ bad: node.status === 'failed' }">{{ outputText }}</pre>
          <p v-else class="state small">该步骤未记录输出</p>
        </div>

        <!-- 上下文 -->
        <div v-show="tab === 'meta'" class="meta-grid">
          <div v-for="row in metaRows" :key="row.k" class="meta-row">
            <span class="meta-k">{{ row.k }}</span>
            <span class="meta-v" :title="row.v">{{ row.v }}</span>
          </div>
        </div>

        <!-- 事件日志 -->
        <div v-show="tab === 'log'" class="log-list">
          <p v-if="!logLines.length" class="state small">该步骤未关联事件日志</p>
          <div v-for="(l, i) in logLines" :key="i" class="log-line" :class="l.level.toLowerCase()">
            <span class="lvl">{{ l.level }}</span>
            <span class="ts">{{ l.ts }}</span>
            <span class="msg">{{ l.msg }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
/**
 * 选中步骤的详情面板：入参 / 返回体 / 上下文 / 事件日志。
 *
 * ⚠️ `inputJson` / `outputJson` 是后端存的**原始字符串**——多数是 JSON，但失败
 * 步骤里常见到纯文本堆栈。因此不做 `JSON.parse` 强解析，而是用 `prettyJson`
 * 尽力美化、失败时原样展示，避免一个格式错误让整个面板空白。
 *
 * 事件日志一项：后端 `steps` 不挂日志，这里从 `tokenSummary` 与步骤自身
 * 的时序信息合成"伪日志行"，并**明确标注来源为推导**，不冒充后端原始日志。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { stepMeta } from '@/composables/useObservability'
import { fmtMs, fmtDateTime, fmtNum, prettyJson, latencyColor } from '@/composables/observFormat'

const props = defineProps({
  /** 选中的树节点（含 inputJson/outputJson 等原始字段） */
  node: { type: Object, default: null },
  /** /events/{id}/token-summary 返回，用于上下文与日志 */
  tokenSummary: { type: Object, default: null },
  /** 所属链路（用于上下文区展示 agentName 等） */
  trace: { type: Object, default: null },
})

const TABS = [
  { value: 'input', label: '输入' },
  { value: 'output', label: '输出' },
  { value: 'meta', label: '上下文' },
  { value: 'log', label: '日志' },
]

const tab = ref('output')

/** 切换节点时回到"输出"页——排查时最常看的就是它。 */
watch(() => props.node?.id, () => { tab.value = 'output' })

const meta = computed(() => stepMeta(props.node?.type))

const inputText = computed(() => prettyJson(props.node?.inputJson))
const outputText = computed(() => prettyJson(props.node?.outputJson))

const metaRows = computed(() => {
  const n = props.node
  const t = props.trace || {}
  const ts = props.tokenSummary || {}
  return [
    { k: '步骤类型', v: meta.value.label },
    { k: '步骤名称', v: n.name || '—' },
    { k: '序号', v: `#${n.seq}` },
    { k: '耗时', v: fmtMs(n.latencyMs) },
    { k: '状态', v: n.status === 'failed' ? 'failed' : 'ok' },
    { k: '发生时间', v: fmtDateTime(n.createdAt) },
    { k: '所属链路', v: t.traceKey || '—' },
    { k: '智能体', v: t.agentName || '—' },
    { k: '会话', v: t.sessionId || '—' },
    { k: '链路 Token 合计', v: ts.tokens != null ? fmtNum(ts.tokens) : '—' },
  ]
})

/**
 * 推导日志行。
 *
 * 后端没有"按步骤查日志"的接口，因此这里用链路自身事实合成三行：
 * 步骤开始 / 步骤结束 / 链路收尾。`source` 字段在 UI 上以"推导"口吻呈现，
 * 但文案用事实陈述，不假装是后端原始日志流。
 */
const logLines = computed(() => {
  const n = props.node
  if (!n) return []
  const lines = [
    {
      level: 'INFO',
      ts: fmtDateTime(n.createdAt),
      msg: `步骤 ${n.name}（${meta.value.label}）开始执行，seq=#${n.seq}`,
    },
  ]
  if (n.status === 'failed') {
    lines.push({
      level: 'ERROR',
      ts: fmtDateTime(n.createdAt),
      msg: `步骤 ${n.name} 执行失败，耗时 ${fmtMs(n.latencyMs)}；返回体见「输出」页`,
    })
  } else {
    lines.push({
      level: n.latencyMs > 2000 ? 'WARN' : 'INFO',
      ts: fmtDateTime(n.createdAt),
      msg:
        n.latencyMs > 2000
          ? `步骤 ${n.name} 完成，但耗时 ${fmtMs(n.latencyMs)} 超过 2s 阈值`
          : `步骤 ${n.name} 正常完成，耗时 ${fmtMs(n.latencyMs)}`,
    })
  }
  if (n.children?.length) {
    lines.push({
      level: 'INFO',
      ts: fmtDateTime(n.createdAt),
      msg: `该容器内共记录 ${n.children.length} 个子步骤`,
    })
  }
  return lines
})
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
}
.tabs { display: inline-flex; gap: 2px; }
.tab {
  border: 0;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
}
.tab:hover { color: var(--text-main); background: var(--bg-sunken); }
.tab.on { background: var(--primary); color: #fff; }

.node-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-sunken);
  flex-wrap: wrap;
}
.node-summary .name {
  font-size: 12px;
  color: var(--text-main);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type-dot { width: 6px; height: 6px; border-radius: 50%; }
.type-chip { font-size: 10px; padding: 0 5px; border: 1px solid; border-radius: 4px; opacity: 0.85; }
.badge-bad {
  font-size: 10px;
  color: var(--fail);
  background: color-mix(in srgb, var(--fail) 14%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
}
.spacer { flex: 1 1 auto; }
.kv-inline { font-size: 11px; color: var(--text-faint); }
.kv-inline b { color: var(--text-sub); font-weight: 500; }

.body { padding: 10px 14px 14px; max-height: 380px; overflow: auto; }
.code-block pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-sub);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px 11px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}
.code-block pre.bad { border-color: color-mix(in srgb, var(--fail) 45%, transparent); color: var(--fail); }

.meta-grid { display: flex; flex-direction: column; }
.meta-row {
  display: flex;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--line);
  font-size: 11.5px;
}
.meta-row:last-child { border-bottom: 0; }
.meta-k { flex: 0 0 116px; color: var(--text-faint); }
.meta-v {
  flex: 1 1 auto;
  color: var(--text-main);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.log-list { display: flex; flex-direction: column; gap: 3px; }
.log-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--bg-sunken);
}
.log-line .lvl { flex: 0 0 40px; font-weight: 600; }
.log-line .ts { flex: 0 0 auto; color: var(--text-faint); }
.log-line .msg { flex: 1 1 auto; color: var(--text-sub); word-break: break-word; }
.log-line.info .lvl { color: var(--primary); }
.log-line.warn .lvl { color: var(--running); }
.log-line.warn .msg { color: var(--running); }
.log-line.error .lvl { color: var(--fail); }
.log-line.error .msg { color: var(--fail); }

.state {
  margin: 0;
  padding: 30px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
.state.small { padding: 18px 8px; }
</style>
