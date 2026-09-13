<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="replay" :size="12" />状态回放</h3>
      <span class="meta" v-if="trace">共 {{ rows.length }} 帧 · 总时长 {{ fmtMs(totalMs) }}</span>
    </header>

    <p v-if="!trace" class="state">选择一条链路后可使用状态回放</p>
    <template v-else>
      <div class="replay-bar">
        <button type="button" class="ctrl" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
          <AppIcon :name="playing ? 'stop' : 'play'" :size="12" />
        </button>
        <button type="button" class="ctrl" aria-label="回到开头" @click="seek(0)">
          <AppIcon name="refresh" :size="12" />
        </button>
        <input
          v-model.number="cursor"
          class="slider"
          type="range"
          min="0"
          :max="Math.max(0, rows.length - 1)"
          step="1"
          aria-label="回放进度"
        >
        <span class="clock">T+{{ String(activeRow?.offset || 0).padStart(5, '0') }}ms</span>
        <span class="step-idx">{{ rows.length ? cursor + 1 : 0 }} / {{ rows.length }}</span>
      </div>

      <ul v-if="rows.length" class="track">
        <li
          v-for="(r, i) in rows"
          :key="r.id"
          class="track-item"
          :class="{ done: i <= cursor, cur: i === cursor, bad: r.status === 'failed' }"
          @click="seek(i)"
        >
          <span class="t-dot" :style="{ background: i <= cursor ? r.color : 'var(--line)' }" />
          <span class="t-body">
            <span class="t-top">
              <span class="t-name">{{ r.name }}</span>
              <span class="t-lat" :style="{ color: i <= cursor ? latencyColor(r.latencyMs) : 'var(--text-faint)' }">
                {{ fmtMs(r.latencyMs) }}
              </span>
            </span>
            <span class="t-meta">{{ r.label }} · seq #{{ r.seq }}</span>
          </span>
        </li>
      </ul>
      <p v-else class="state small">该链路没有可回放的步骤</p>

      <div v-if="activeRow" class="replay-detail">
        <span class="rd-title">当前步骤 <b>{{ activeRow.name }}</b></span>
        <pre v-if="activePreview">{{ activePreview }}</pre>
        <p v-else class="state small">该步骤无输出记录</p>
      </div>
    </template>
  </section>
</template>

<script setup>
/**
 * 状态回放：把链路步骤排成时间轴，可逐步"走到"任一时刻。
 *
 * 帧序列由步骤时序在前端推导：按 seq 升序累加 `latencyMs` 得到相对链路起点的
 * `offset`。后端 `/replay` 接口的返回结构与 `/traces/{id}` 完全相同（没有额外的
 * 帧数据），所以回放无需额外请求，也不会因接口差异而失效。
 *
 * 拖动/点击轨道即可定位；播放到末尾自动停止，避免空转。
 */
import { computed, ref, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
import { stepMeta } from '@/composables/useObservability'
import { fmtMs, prettyJson, latencyColor } from '@/composables/observFormat'

const props = defineProps({
  /** 扁平步骤数组 */
  steps: { type: Array, default: () => [] },
  /** 当前链路 */
  trace: { type: Object, default: null },
  /** 外部控制当前帧（选中拓扑树节点时联动） */
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])

const cursor = ref(0)
const playing = ref(false)
let timer = null

const rows = computed(() => {
  const list = [...props.steps].sort((a, b) => (a.seq || 0) - (b.seq || 0))
  let offset = 0
  return list.map((s) => {
    const m = stepMeta(s.stepType)
    const row = {
      id: `tl-${s.id ?? s.seq}`,
      seq: s.seq,
      name: s.name || m.label,
      label: m.label,
      color: m.color,
      status: s.status,
      latencyMs: s.latencyMs || 0,
      outputJson: s.outputJson,
      offset,
    }
    offset += s.latencyMs || 0
    return row
  })
})

const totalMs = computed(() => rows.value.reduce((sum, r) => sum + r.latencyMs, 0))
const activeRow = computed(() => rows.value[cursor.value] || null)

/** 输出预览截断到 16 行，避免长返回体把面板撑爆。 */
const activePreview = computed(() => {
  const raw = prettyJson(activeRow.value?.outputJson)
  if (!raw) return ''
  const lines = raw.split('\n')
  return lines.length > 16 ? `${lines.slice(0, 16).join('\n')}\n… (共 ${lines.length} 行)` : raw
})

function togglePlay() {
  if (playing.value) return stopPlay()
  if (cursor.value >= rows.value.length - 1) cursor.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (cursor.value >= rows.value.length - 1) return stopPlay()
    cursor.value += 1
  }, 420)
}

function stopPlay() {
  playing.value = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function seek(i) {
  stopPlay()
  cursor.value = Math.max(0, Math.min(i, rows.value.length - 1))
}
</script>

<style scoped>
.panel {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
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
.meta { font-size: 10.5px; color: var(--text-faint); }

.replay { padding: 10px 14px 14px; }
.replay-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 10px 14px;
  padding: 7px 10px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.ctrl {
  border: 1px solid var(--line);
  background: var(--bg-card);
  color: var(--text-main);
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.ctrl:hover { border-color: var(--primary); color: var(--primary); }
.slider { flex: 1 1 auto; accent-color: var(--primary); min-width: 80px; }
.clock {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--running);
  flex: 0 0 auto;
  min-width: 80px;
}
.step-idx { font-size: 11px; color: var(--text-faint); flex: 0 0 auto; font-variant-numeric: tabular-nums; }

.track { list-style: none; margin: 0; padding: 0 14px; display: flex; flex-direction: column; }
.track-item {
  display: flex;
  align-items: stretch;
  gap: 9px;
  padding: 5px 7px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
}
.track-item:hover { background: var(--bg-sunken); }
.track-item + .track-item::before {
  content: '';
  position: absolute;
  left: 12.5px;
  top: -5px;
  height: 5px;
  width: 1px;
  background: var(--line);
}
.t-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto; }
.t-body { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-width: 0; }
.t-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.t-name {
  font-size: 11.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-item.done .t-name { color: var(--text-main); }
.track-item.bad .t-name { color: var(--fail); }
.t-lat { font-size: 11px; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.t-meta { font-size: 10.5px; color: var(--text-faint); }
.track-item.cur { background: color-mix(in srgb, var(--primary) 10%, transparent); }

.replay-detail { margin: 10px 14px 14px; }
.rd-title { font-size: 11px; color: var(--text-sub); }
.rd-title b { color: var(--text-main); font-weight: 500; }
.replay-detail pre {
  margin: 6px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-sub);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 9px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

.state {
  margin: 0;
  padding: 26px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
.state.small { padding: 10px 0; text-align: left; font-size: 11px; }
</style>
