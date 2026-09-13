<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="layers" :size="12" />链路日志</h3>
      <div class="filters">
        <div class="seg" role="group" aria-label="按日志级别筛选">
          <button
            v-for="l in LEVELS"
            :key="l.value"
            type="button"
            class="seg-btn"
            :class="[`lv-${l.value}`, { on: level === l.value }]"
            @click="level = l.value"
          >
            {{ l.label }}<span class="cnt">{{ counts[l.value] }}</span>
          </button>
        </div>
        <label class="pick grow">
          <AppIcon name="search" :size="11" />
          <input v-model.trim="keyword" type="search" placeholder="过滤日志内容" aria-label="过滤日志" />
        </label>
      </div>
    </header>

    <div class="log-body">
      <p v-if="!filtered.length" class="state">
        {{ hasSource ? '当前筛选条件下无日志' : '选择一条链路后显示该次执行的事件日志' }}
      </p>
      <div v-else class="log-list">
        <div v-for="(e, i) in filtered" :key="i" class="log-line" :class="e.level.toLowerCase()">
          <span class="lvl">{{ e.level }}</span>
          <span class="ts">{{ e.ts }}</span>
          <span class="src" :title="e.src">{{ e.src }}</span>
          <span class="msg">{{ e.msg }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * 链路日志面板。
 *
 * ⚠️ 后端没有"整链路日志流"接口——`HarnessTraceMiddleware` 只把步骤写进
 * `trace_step` 表，没有独立的 log 表。因此本面板的日志行**由步骤事实推导**：
 * 每个步骤产出一行开始/结束（或失败）记录，再补一条链路级别的收尾行。
 * 界面上按 INFO/WARN/ERROR 分级，是为了给排查提供"从粗到细"的过滤能力，
 * 而不是声称后端存在该分级字段。
 *
 * 之所以还是把它做成独立面板而不是嵌在拓扑树里：排查时经常需要"先看全局
 * ERROR 有几条"再回树里定位，两者视角不同，合并会让两边都不好用。
 */
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { stepMeta } from '@/composables/useObservability'
import { fmtMs, fmtDateTime, fmtNum } from '@/composables/observFormat'

const props = defineProps({
  /** 扁平的步骤数组（activeSteps） */
  steps: { type: Array, default: () => [] },
  /** 当前链路 */
  trace: { type: Object, default: null },
  /** token 计量（用于收尾行） */
  tokenSummary: { type: Object, default: null },
})

const LEVELS = [
  { value: 'all', label: '全部' },
  { value: 'error', label: 'ERROR' },
  { value: 'warn', label: 'WARN' },
  { value: 'info', label: 'INFO' },
]

const level = ref('all')
const keyword = ref('')

const hasSource = computed(() => !!props.trace && props.steps.length > 0)

/** 由步骤推导日志行。 */
const entries = computed(() => {
  const list = [...props.steps].sort((a, b) => (a.seq || 0) - (b.seq || 0))
  const out = []
  list.forEach((s) => {
    const m = stepMeta(s.stepType)
    const src = `${m.label}·#${s.seq}`
    out.push({
      level: 'INFO',
      ts: fmtDateTime(s.createdAt),
      src,
      msg: `开始 ${s.name || m.label}`,
    })
    if (s.status === 'failed') {
      out.push({
        level: 'ERROR',
        ts: fmtDateTime(s.createdAt),
        src,
        msg: `${s.name || m.label} 执行失败，耗时 ${fmtMs(s.latencyMs)}`,
      })
    } else if ((s.latencyMs || 0) > 2000) {
      out.push({
        level: 'WARN',
        ts: fmtDateTime(s.createdAt),
        src,
        msg: `${s.name || m.label} 完成但耗时 ${fmtMs(s.latencyMs)}，超过 2s 阈值`,
      })
    } else {
      out.push({
        level: 'INFO',
        ts: fmtDateTime(s.createdAt),
        src,
        msg: `${s.name || m.label} 完成，耗时 ${fmtMs(s.latencyMs)}`,
      })
    }
  })

  const t = props.trace
  if (t) {
    const ts = props.tokenSummary
    const tail = ts?.tokens != null ? `，累计 token ${fmtNum(ts.tokens)}` : ''
    out.push({
      level: t.status === 'failed' ? 'ERROR' : 'INFO',
      ts: fmtDateTime(t.endedAt || t.startedAt),
      src: '链路收尾',
      msg:
        t.status === 'failed'
          ? `链路失败结束，总耗时 ${fmtMs(t.latencyMs)}${tail}`
          : `链路正常结束，总耗时 ${fmtMs(t.latencyMs)}${tail}`,
    })
  }
  return out
})

const counts = computed(() => {
  const c = { all: entries.value.length, error: 0, warn: 0, info: 0 }
  entries.value.forEach((e) => {
    const k = e.level.toLowerCase()
    if (k in c) c[k] += 1
  })
  return c
})

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase()
  return entries.value.filter((e) => {
    if (level.value !== 'all' && e.level.toLowerCase() !== level.value) return false
    if (kw && !`${e.src} ${e.msg}`.toLowerCase().includes(kw)) return false
    return true
  })
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
  flex-wrap: wrap;
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
.filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg-btn {
  border: 0;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.seg-btn + .seg-btn { border-left: 1px solid var(--line); }
.seg-btn:hover { background: var(--bg-sunken); color: var(--text-main); }
.seg-btn.on { background: var(--primary); color: #fff; }
.seg-btn.on .cnt { color: rgba(255, 255, 255, 0.8); }
.seg-btn.lv-error { color: var(--fail); }
.seg-btn.lv-warn { color: var(--running); }
.seg-btn.lv-all.on, .seg-btn.lv-info.on { background: var(--primary); }
.seg-btn.lv-error.on { background: var(--fail); }
.seg-btn.lv-warn.on { background: var(--running); }
.cnt { font-size: 10px; opacity: 0.75; font-variant-numeric: tabular-nums; }
.pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 7px;
  color: var(--text-faint);
  background: var(--bg-sunken);
}
.pick.grow { flex: 1 1 160px; min-width: 140px; }
.pick input {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-main);
  font-size: 11px;
  font-family: inherit;
  width: 100%;
}

.log-body { max-height: 300px; overflow: auto; padding: 8px 10px 10px; }
.log-list { display: flex; flex-direction: column; gap: 2px; }
.log-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 3px 7px;
  border-radius: 5px;
}
.log-line:hover { background: var(--bg-sunken); }
.log-line .lvl { flex: 0 0 42px; font-weight: 600; }
.log-line .ts { flex: 0 0 auto; color: var(--text-faint); }
.log-line .src { flex: 0 0 96px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-line .msg { flex: 1 1 auto; color: var(--text-sub); word-break: break-word; }
.log-line.info .lvl { color: var(--primary); }
.log-line.warn .lvl { color: var(--running); }
.log-line.warn .msg { color: var(--running); }
.log-line.error .lvl { color: var(--fail); }
.log-line.error .msg { color: var(--fail); }

.state {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
