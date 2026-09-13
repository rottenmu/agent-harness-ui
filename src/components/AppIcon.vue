<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="isFilled ? 'currentColor' : 'none'"
    :stroke="isFilled ? 'none' : 'currentColor'"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="ICON_PATHS[name] || ICON_PATHS.dot" />
  </svg>
</template>

<script setup>
/**
 * 内联 SVG 图标集
 *
 * 为什么不装图标库：`@vicons/material` 体积约 80MB、含数千文件，dev 安装与构建都慢；
 * 而本工程总共只用十几个图标，内联 path 数据成本更低。
 *
 * 采用**描边风格**（stroke）而非填充风格，原因有二：
 *  1. 描边图标在 11~14px 这个密集区间比填充图标更清晰，不会糊成一坨；
 *  2. 描边路径由简单几何构成，手写不易出错；填充路径一旦多个子路径方向相同，
 *     就会出现"该挖空的地方没挖空"。少数需要实心观感的图标（播放/暂停类）
 *     在 FILLED 集合里单独声明。
 */
import { computed } from 'vue'

const ICON_PATHS = {
  /* 通用 */
  search: 'M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12l5 5L20 6',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  dot: 'M12 12h.01',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6.5v5.5l4 2',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',

  /* 主题切换 */
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',

  /* 顶栏动作 */
  play: 'M7 4.5l12 7.5-12 7.5z',
  stop: 'M6.5 6.5h11v11h-11z',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',

  /* 侧栏 */
  threads: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  settings: 'M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3M2 15h4M10 8h4M18 17h4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  pin: 'M12 17v5M9 3h6l-1 7h2l-4 6-4-6h2z',
  archive: 'M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M2 3h20v5H2zM10 12h4',

  /* 时间线 / 工具 */
  terminal: 'M4 17l5-5-5-5M12 19h8',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  diff: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 14h6M12 11v6',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  panel: 'M3 5h18v14H3zM9 5v14',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  summary: 'M4 5h16M4 12h16M4 19h10',
  error: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  eye: 'M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',

  /* 可观测：步骤类型 */
  robot: 'M12 2v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9.5 13h.01M14.5 13h.01M9 17h6',
  brain: 'M9.5 3A3.5 3.5 0 0 0 6 6.5 3 3 0 0 0 4 9.3a3 3 0 0 0 1.5 2.6A3 3 0 0 0 7 17a3 3 0 0 0 2.5 3.9M14.5 3A3.5 3.5 0 0 1 18 6.5a3 3 0 0 1 2 2.8 3 3 0 0 1-1.5 2.6A3 3 0 0 1 17 17a3 3 0 0 1-2.5 3.9M12 3v18',
  wrench: 'M14.7 6.3a4 4 0 0 0 5.4 5.4l-9 9a2.8 2.8 0 0 1-4-4zM14.7 6.3l3-3a4 4 0 0 1 0 5.4',
  lightbulb: 'M9 18h6M10 22h4M12 2a6 6 0 0 0-3 11.2V18h6v-4.8A6 6 0 0 0 12 2z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2.5 5.5L8 16l2.5-5.5z',
  sitemap: 'M9 3h6v4H9zM2 17h6v4H2zM16 17h6v4h-6zM12 7v4M5 17v-2h14v2M12 11v4',
  gauge: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 12l4-3',
  bug: 'M8 6h8v6a4 4 0 0 1-8 0zM12 2v4M4 10h4M16 10h4M4 16h4M16 16h4M6 20l3-3M18 20l-3-3',
  replay: 'M3 12a9 9 0 1 0 3-6.7M3 3v6h6M12 8v5l3.5 2',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  expand: 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4',
  layers: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',

  /* 可观测：面板与评估 */
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 11.5l2 2 4-4',
  book: 'M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2zM19 16H6a2 2 0 0 0-2 2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  timeline: 'M4 4v16M8 7h12M8 12h9M8 17h13M5.5 7h.01M5.5 12h.01M5.5 17h.01',
  split: 'M12 3v6M12 21v-6M7 9h10v6H7zM3 6h4v6M17 12h4v6',
}

/** 需要实心观感的图标（描边画出来会显得发虚） */
const FILLED = new Set(['play', 'stop', 'sparkle'])

const props = defineProps({
  /** 图标名；未知名称回落为 dot，不会渲染成空白 */
  name: { type: String, required: true },
  /** 尺寸（px） */
  size: { type: [Number, String], default: 16 },
})

const isFilled = computed(() => FILLED.has(props.name))
</script>

<style scoped>
.icon { display: block; flex: 0 0 auto; }
</style>
