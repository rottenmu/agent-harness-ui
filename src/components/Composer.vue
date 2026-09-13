<template>
  <!-- ============================================================
       Composer —— 会话交互的**主控点**
       参照 pi-gui 的 composer-surface：大圆角输入盒 + 底部提示行 + 圆形发送键。
       模型 / 思考级别 / 投递方式集中在此，避免"换个模型要跨面板"。
       ============================================================ -->
  <div class="composer-wrap">
    <!-- 排队区：运行中发出的 followUp 消息在此可见、可撤销 -->
    <div v-if="queued.length" class="queue-strip">
      <span class="queue-label">
        <AppIcon name="clock" :size="11" />
        排队 {{ queued.length }}
      </span>
      <span v-for="q in queued" :key="q.id" class="queued-item">
        <span class="queued-text">{{ q.text }}</span>
        <span class="queued-drop" title="取消排队" @click="emit('drop-queued', q.id)">
          <AppIcon name="close" :size="10" />
        </span>
      </span>
    </div>

    <!--
      触发面板：`/` 列技能、`@` 列智能体，共用一个面板组件（标题随触发器变化）。
      数据由父级注入（真实后端资源），本组件只做「按已输入的前缀过滤 + 键盘导航」。
    -->
    <SlashMenu
      v-if="menuOpen"
      :items="menuItems"
      :active-index="menuIndex"
      :title="menuTitle"
      @select="pickItem"
      @hover="menuIndex = $event"
    />

    <div class="composer" :class="{ 'is-focused': focused }">
      <textarea
        ref="taRef"
        v-model="text"
        class="composer-input"
        rows="1"
        :placeholder="placeholder"
        @keydown="onKeydown"
        @focus="focused = true"
        @blur="focused = false"
        @input="autoGrow"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />

      <div class="composer-foot">
        <!-- MCP 多选（左下角第一位）：本次发送启用的 MCP 服务，可多选 -->
        <n-select
          v-model:value="mcpValue"
          class="foot-select foot-select-mcp"
          size="tiny"
          multiple
          :options="mcpOptions"
          placeholder="MCP"
          :max-tag-count="2"
          :consistent-menu-width="false"
        />

        <span class="foot-hint">Enter to send · Shift+Enter for newline</span>

        <span class="foot-spacer" />

        <n-select
          v-model:value="modelValue"
          class="foot-select"
          size="tiny"
          :options="modelOptions"
          :consistent-menu-width="false"
        />
        <n-select
          v-model:value="thinkingValue"
          class="foot-select foot-select-narrow"
          size="tiny"
          :options="thinkingOptions"
          :consistent-menu-width="false"
        />

        <!-- 投递语义切换：两种语义必须在发送前可见，否则"运行中发出去的消息去哪了"无从预期 -->
        <span class="deliver-toggle" role="group">
          <button
            v-for="opt in DELIVER_OPTIONS"
            :key="opt.value"
            class="deliver-btn"
            :class="{ 'is-active': deliverAsModel === opt.value }"
            type="button"
            :title="opt.title"
            @click="deliverAsModel = opt.value"
          >
            {{ opt.label }}
          </button>
        </span>

        <button
          class="send-btn"
          type="button"
          :disabled="!canSend"
          :title="canSend ? '发送' : '请输入内容'"
          @click="submit"
        >
          <AppIcon name="send" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Composer
 *
 * 四条约束：
 *  1. **Enter 发送 / Shift+Enter 换行**是硬约定且在底部常驻提示 —— 不靠用户猜。
 *     输入法组合期间（`isComposing`）必须放行 Enter，否则中文输入选词会被当成发送。
 *     这是中文环境下的高频误操作，代码里显式判了 compositionstart/end。
 *  2. **投递语义（steer / followUp）在发送前就可见可切**。运行中发消息的语义
 *     如果不可见，用户在界面上无法预期这条消息是"插进去"还是"排队"。
 *  3. 触发面板只看**首字符**（`/` 技能、`@` 智能体）—— 若用 `includes()`，
 *     任何含路径或邮箱的普通提问都会弹出面板。
 *  4. 本组件是 dumb 的：技能/智能体/MCP/模型四类数据全部经 props 注入，
 *     选中智能体这类会话状态变更通过 emit 交父级实现，组件自身不碰后端。
 */
import { computed, nextTick, ref } from 'vue'
import { NSelect } from 'naive-ui'
import AppIcon from './AppIcon.vue'
import SlashMenu from './SlashMenu.vue'
import { DeliverAs } from '@/api/sessionDriver'

const props = defineProps({
  /** 排队中的消息（运行中发出的 followUp） */
  queued: { type: Array, default: () => [] },
  /** 可选模型（真实模型配置，经 useComposerResources 注入） */
  modelOptions: { type: Array, default: () => [] },
  /** 可选思考级别 */
  thinkingOptions: { type: Array, default: () => [] },
  /** `/` 菜单条目：技能（父级已映射为 name/hint/detail） */
  skills: { type: Array, default: () => [] },
  /** `@` 菜单条目：智能体 */
  agents: { type: Array, default: () => [] },
  /** MCP 选项（foot 左侧多选） */
  mcpOptions: { type: Array, default: () => [] },
  placeholder: { type: String, default: '输入 Prompt，Enter 发送；/ 技能 · @ 智能体' },
})

const emit = defineEmits(['send', 'pick-agent', 'drop-queued'])

/** 草稿文本 */
const text = defineModel('text', { type: String, default: '' })
/** 当前模型 */
const modelValue = defineModel('model', { type: String, default: '' })
/** 当前思考级别 */
const thinkingValue = defineModel('thinking', { type: String, default: '' })
/** 下一次发送的投递语义 */
const deliverAsModel = defineModel('deliverAs', { type: String, default: DeliverAs.FOLLOW_UP })
/** 本次会话启用的 MCP 服务（配置 name 数组） */
const mcpValue = defineModel('mcp', { type: Array, default: () => [] })

const taRef = ref(null)
const focused = ref(false)
const menuIndex = ref(0)
/** 输入法组合状态：组合期间的 Enter 属于"选词确认"，不能当发送 */
const composing = ref(false)

const DELIVER_OPTIONS = [
  { value: DeliverAs.FOLLOW_UP, label: '排队', title: 'followUp —— 等当前运行结束后作为新一轮发出' },
  { value: DeliverAs.STEER, label: '插话', title: 'steer —— 立即注入当前这一轮运行' },
]

/**
 * 触发器解析：`/` → 技能菜单，`@` → 智能体菜单。
 * 与旧约定一致：只看首字符、且尚未出现空格 —— 一旦开始写正文就不再弹面板
 * （否则路径 / 邮箱类内容会误触发）。
 */
const trigger = computed(() => {
  const v = text.value
  if (!v || v.includes(' ')) return null
  if (v.startsWith('/')) return { kind: 'skill', q: v.toLowerCase() }
  if (v.startsWith('@')) return { kind: 'agent', q: v.toLowerCase() }
  return null
})

const menuItems = computed(() => {
  const t = trigger.value
  if (!t) return []
  const src = t.kind === 'skill' ? props.skills : props.agents
  return src.filter((c) => c.name && c.name.toLowerCase().startsWith(t.q))
})

const menuOpen = computed(() => menuItems.value.length > 0)
const menuTitle = computed(() => (trigger.value?.kind === 'agent' ? 'Agents' : 'Skills'))
const canSend = computed(() => text.value.trim().length > 0)

/** 输入框随内容增高：单行起步，最多 6 行后转为内部滚动 */
function autoGrow() {
  const el = taRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 132)}px`
}

function submit() {
  if (!canSend.value) return
  emit('send', text.value)
  text.value = ''
  menuIndex.value = 0
  nextTick(autoGrow)
}

/** 复位高亮并还焦点给输入框（选中条目后的公共收尾） */
function settleAfterPick() {
  menuIndex.value = 0
  nextTick(() => {
    autoGrow()
    taRef.value?.focus()
  })
}

/**
 * 选中技能：把 `/名称 ` 落进正文供继续描述。
 * 正文带上空格后 trigger 自动失效、面板收起 —— 不需要额外的关闭状态。
 * 这是纯文本操作，不涉及会话状态，所以留在本组件内完成。
 */
function applySkill(item) {
  text.value = `${item.name} `
  settleAfterPick()
}

/**
 * 选中智能体：切换执行目标是**会话状态**，交给父级实现
 * （与顶栏「执行 Agent」下拉同一落点），本组件只清空触发词。
 */
function applyAgent(item) {
  emit('pick-agent', item)
  text.value = ''
  settleAfterPick()
}

/** 面板选中分发：按当前触发器路由到技能 / 智能体 */
function pickItem(item) {
  if (!item) return
  if (trigger.value?.kind === 'agent') applyAgent(item)
  else applySkill(item)
}

function onKeydown(e) {
  // 中文输入法组合中：Enter 是选词，不拦截
  if (e.isComposing || composing.value) return

  if (e.key === 'Escape' && menuOpen.value) {
    e.preventDefault()
    text.value = ''
    menuIndex.value = 0
    return
  }

  if (menuOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      menuIndex.value = (menuIndex.value + 1) % menuItems.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      menuIndex.value = (menuIndex.value - 1 + menuItems.value.length) % menuItems.value.length
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      pickItem(menuItems.value[menuIndex.value])
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}
</script>

<style scoped>
.composer-wrap {
  position: relative;
  padding: var(--space-3);
  border-top: 1px solid var(--border-light);
  background: var(--bg-page);
}

/* ---- 排队区 ---- */
.queue-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1-5);
  margin-bottom: var(--space-2);
}
.queue-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-faint);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
}
.queued-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 320px;
  padding: 1px var(--space-1) 1px var(--space-2);
  border: 1px solid var(--warning-tint-border);
  border-radius: var(--radius-pill);
  background: var(--warning-tint-bg);
  color: var(--text-main);
  font-size: var(--text-xs);
}
.queued-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queued-drop { display: inline-flex; color: var(--text-faint); cursor: pointer; }
.queued-drop:hover { color: var(--fail); }

/* ---- 输入盒 ---- */
.composer {
  border: 1px solid var(--border-heavy);
  border-radius: var(--radius-composer);
  background: var(--bg-card);
  transition: border-color var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out);
}
.composer.is-focused {
  border-color: var(--focus-ring-border);
  box-shadow: var(--focus-ring);
}

.composer-input {
  display: block;
  width: 100%;
  padding: var(--space-3) var(--space-4) var(--space-1);
  border: 0;
  background: transparent;
  color: var(--text-main);
  font-family: inherit;
  font-size: var(--text-base);
  line-height: var(--leading-snug);
  resize: none;
  outline: none;
  overflow-y: auto;
}
.composer-input::placeholder { color: var(--text-faint); }

/* ---- 底部提示行 ---- */
.composer-foot {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2) var(--space-2) var(--space-4);
}
/*
 * 提示行必须**不折行**。
 * 它是最先被挤的那一项（flex-shrink 优先吃掉它），若允许换行，
 * 在窄中栏下会折成三行把输入盒撑高 —— 视觉上像是盒子坏了。
 * 改成 nowrap + 省略号：空间不够时优雅退化成 "Enter to send · Shift+En…"，
 * 而不是把整行高度改掉。
 */
.foot-hint {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.foot-spacer { flex: 1 1 auto; min-width: var(--space-1); }

/*
 * 模型 / 思考级别下拉的宽度**不写死**。
 *
 * 曾经写的是 `width: 108px` / `76px`，是按当时的标签手调的 —— 结果换成长一点的
 * 模型名（deepseek-chat 需 78px 内容宽、medium 需 44px）后，naive-ui 内部那层
 * `.n-base-selection-input__content` 被迫省略，真机上显示成「deepseek-c…」「medi…」。
 * 危险之处在于它**不报错、不溢出、不换行**，只是把词切一半，肉眼很容易当成设计如此。
 *
 * n-select 的根节点是 inline-block，`width: auto` 时会按**选中项文本**自适应
 * （真机实测：deepseek-chat 得 116px、medium 得 82px，内容零溢出）。
 * 于是宽度随内容走，以后加多长的模型名都不会再截断。
 *
 * `flex: 0 0 auto` 是配套的必要条件：默认的 flex-shrink:1 会在窄中栏下把下拉压回去，
 * 等于绕个圈又截断了。宁可让提示行先省略（它有 overflow:hidden + 省略号），
 * 也不能把模型名切一半 —— 提示行是"能猜出来"的冗余信息，模型名不是。
 */
.foot-select { flex: 0 0 auto; width: auto; min-width: 64px; }
.foot-select-narrow { flex: 0 0 auto; width: auto; min-width: 56px; }

/*
 * MCP 多选是 foot 行里唯一**内容可增长**的下拉（选中项渲染为 tag）。
 * max-tag-count=2 之外的数量由 naive-ui 折叠成 +N，但两个长名 tag 仍可能把
 * 提示行挤没 —— 它是四者中唯一允许收缩（flex-shrink:1）并带上限的：
 * 溢出由 naive-ui 内部的 tag 滚动消化，不牺牲模型名的完整展示。
 */
.foot-select-mcp { flex: 0 1 auto; width: auto; min-width: 76px; max-width: 240px; }

.deliver-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  padding: 1px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  background: var(--bg-sunken);
}
.deliver-btn {
  padding: 1px var(--space-2);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-faint);
  font-family: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}
.deliver-btn:hover { color: var(--text-main); }
.deliver-btn.is-active { background: var(--accent-tint-bg-strong); color: var(--primary); }

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border: 0;
  border-radius: var(--radius-round);
  background: var(--primary);
  color: var(--primary-ink);
  cursor: pointer;
  transition: opacity var(--motion-fast) var(--ease-out);
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn:not(:disabled):hover { background: var(--primary-hover); }
</style>
