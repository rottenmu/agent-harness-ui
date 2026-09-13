<template>
  <!-- ============================================================
       Diff 侧栏 —— 只负责「展示给定的一组文件差异」
       不计算差异、不读文件系统、不发起请求（理由见下方脚本注释第 1 条）。
       ============================================================ -->
  <aside class="diff-panel" :class="{ 'is-open': open }" aria-hidden="!open">
    <header class="diff-head">
      <span class="diff-title">
        <AppIcon name="diff" :size="12" />
        文件差异
      </span>
      <span class="diff-count">{{ files.length }} file(s)</span>
      <span class="diff-spacer" />
      <span class="diff-kbd" title="快捷键">Ctrl+D</span>
      <button class="diff-close" type="button" title="关闭差异侧栏" @click="emit('close')">
        <AppIcon name="close" :size="11" />
      </button>
    </header>

    <div class="diff-scroll">
      <!--
        工具行的 view-in-diff 只带路径，不能保证该路径一定在本会话的差异负载里
        （后端可能因为裁剪、或该改动尚未落盘而没有给出）。
        这时**如实说明**，而不是让侧栏"打开了但什么都没高亮" ——
        后者会被读成「功能坏了」，而实际是数据没到。
      -->
      <p v-if="missingPath" class="diff-notice">
        <AppIcon name="warn" :size="11" />
        <span><code>{{ missingPath }}</code> 不在本次差异负载中 —— 差异由后端给出，前端不自行计算。</span>
      </p>

      <p v-if="!files.length" class="diff-empty">
        本条会话没有文件改动。写类工具执行后，差异会由后端给出并在此展示。
      </p>

      <section v-for="file in files" :key="file.path" class="diff-file">
        <button
          class="file-head"
          type="button"
          :class="{ 'is-active': file.path === activePath }"
          @click="emit('select-file', file.path)"
        >
          <span class="file-caret" :class="{ 'is-open': isOpen(file.path) }">
            <AppIcon name="chevron" :size="10" />
          </span>
          <span class="file-status" :class="`status-${file.status}`">{{ STATUS_LABEL[file.status] }}</span>
          <span class="file-path">{{ file.path }}</span>
          <span class="file-stat">
            <span class="add">+{{ file.additions }}</span>
            <span class="del">-{{ file.deletions }}</span>
          </span>
        </button>

        <div v-show="isOpen(file.path)" class="file-body">
          <div v-for="(hunk, hi) in file.hunks" :key="hi" class="hunk">
            <div class="hunk-head">{{ hunk.header }}</div>
            <div
              v-for="(line, li) in hunk.lines"
              :key="li"
              class="hunk-line"
              :class="`line-${line.kind}`"
            >
              <span class="line-sign">{{ SIGN[line.kind] }}</span>
              <span class="line-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
/**
 * Diff 侧栏
 *
 * 三条约束：
 *
 * 1. **前端不做差异计算。**
 *    参照项目 pi-gui 用的是 Node 侧的 `diff` 包；我们跑在浏览器里，而且差异的
 *    权威来源应该是后端（`modules/agent-harness` 掌握真实的文件改动）。
 *    前端算出来的差异会与权威记录漂移 —— 这跟 sessionVisibility 那份复盘里
 *    「同一事实两处推导」是同一个病，只是换成了文件内容。
 *    因此本组件只消费 `files` 负载：path / status / additions / deletions / hunks。
 *
 * 2. **关闭时保留 DOM（宽度归零）而不是 v-if 卸载。**
 *    开合状态是最常被验证的东西（快捷键、工具行直达），若关闭即卸载，
 *    「侧栏当前宽度」这个可观测量会变成 null 而不是 0，判定与断言都写不干净。
 *
 * 3. **从工具行直达时展开对应文件并高亮。** 否则用户点「view in diff」后
 *    还得自己在文件列表里找一次，这一步的收益就没了。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** 差异文件列表（形状见方案第六节第 4 条） */
  files: { type: Array, default: () => [] },
  /** 是否展开。关闭时宽度归零，但不卸载 DOM（约束 2） */
  open: { type: Boolean, default: false },
  /** 需要高亮 / 自动展开的文件路径（来自工具行的 view-in-diff） */
  activePath: { type: String, default: '' },
})

const emit = defineEmits(['close', 'select-file'])

const STATUS_LABEL = { added: 'A', modified: 'M', removed: 'D' }
const SIGN = { add: '+', del: '-', ctx: ' ' }

/** 被请求定位、但不在差异负载里的路径（用于给出如实提示，见模板注释） */
const missingPath = computed(() => {
  if (!props.activePath) return ''
  return props.files.some((f) => f.path === props.activePath) ? '' : props.activePath
})

/**
 * 已被用户折叠的文件路径集合。
 *
 * 只记「用户主动折叠过」的那些，未出现过的文件走默认值（展开）。
 * 这样既保留了用户的折叠选择，又不需要在 files 变化时同步一份副本 ——
 * 反过来记「展开集合」的话，每次收到新的差异都要把它与列表求交集。
 */
const collapsed = ref(new Set())

function isOpen(path) {
  return !collapsed.value.has(path)
}

/** 外部指定 activePath（工具行 view-in-diff）时：默认展开它，并把它从折叠集合里移除 */
watch(
  () => props.activePath,
  (path) => {
    if (!path || !collapsed.value.has(path)) return
    const next = new Set(collapsed.value)
    next.delete(path)
    // Set 的增删不会触发 ref 的依赖更新，必须换引用
    collapsed.value = next
  },
)
</script>

<style scoped>
.diff-panel {
  display: none;
  flex-direction: column;
  /*
   * 宽度 380px：diff 行是等宽文本，容不下时会折行，一旦折行
   * 就再也看不清「同一行的增删对应关系」，比窄一点更糟。
   * 380 是在 1064px 视口下（外壳侧栏 256px 已占用）仍能让中栏留在 400px 以上的值。
   */
  flex: 0 0 380px;
  min-width: 0;
  border-left: 1px solid var(--border-light);
  background: var(--bg-page);
}
/* 关闭态：宽度与高度都归零，且不参与 flex 分配（约束 2） */
.diff-panel.is-open {
  display: flex;
}

@media (max-width: 1280px) {
  .diff-panel { flex: 0 0 300px; }
}

.diff-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
  height: 40px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-card);
}
.diff-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-main);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.diff-count { color: var(--text-faint); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.diff-spacer { flex: 1 1 auto; }
.diff-kbd {
  padding: 1px var(--space-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.diff-close {
  display: inline-flex;
  padding: var(--space-1);
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}
.diff-close:hover { background: var(--overlay-hover); color: var(--text-main); }

.diff-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--space-2); }

.diff-empty {
  margin: 0;
  padding: var(--space-3);
  color: var(--text-faint);
  font-size: var(--text-sm);
}

.diff-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  margin: 0 0 var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--warning-tint-border);
  border-radius: var(--radius-sm);
  background: var(--warning-tint-bg);
  color: var(--text-sub);
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
}
.diff-notice code {
  color: var(--text-main);
  font-family: var(--font-mono);
}

.diff-file + .diff-file { margin-top: var(--space-2); }

.file-head {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  width: 100%;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--overlay-subtle);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.file-head:hover { background: var(--overlay-hover); }
.file-head.is-active { background: var(--accent-tint-bg); box-shadow: inset 2px 0 0 var(--accent-rail); }

.file-caret {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--text-faint);
  transition: transform var(--motion-fast) var(--ease-out);
}
.file-caret.is-open { transform: rotate(90deg); }

.file-status {
  flex: 0 0 auto;
  width: 14px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}
.status-added { color: var(--diff-added-ink); }
.status-modified { color: var(--diff-modified-ink); }
.status-removed { color: var(--diff-removed-ink); }

.file-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 路径左截断更有用（末段文件名最可辨识），但 CSS 无跨浏览器方案，保留右截断 */
  direction: ltr;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.file-stat { display: inline-flex; gap: var(--space-1); flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--text-xs); }
.file-stat .add { color: var(--diff-added-ink); }
.file-stat .del { color: var(--diff-removed-ink); }

.file-body {
  margin: var(--space-1) 0 0;
  border: 1px solid var(--code-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.hunk + .hunk { border-top: 1px solid var(--code-border); }

.hunk-head {
  padding: var(--space-1) var(--space-2);
  background: var(--diff-header-bg);
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.hunk-line {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  white-space: pre-wrap;
  word-break: break-word;
}
.line-sign { flex: 0 0 8px; color: var(--text-faint); }
.line-text { flex: 1 1 auto; min-width: 0; }

.line-add { background: var(--diff-added-bg); }
.line-add .line-text { color: var(--diff-added-ink); }
.line-del { background: var(--diff-removed-bg); }
.line-del .line-text { color: var(--diff-removed-ink); }
.line-ctx .line-text { color: var(--text-code); }
</style>
