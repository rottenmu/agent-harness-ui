import { createApp } from 'vue'
import App from './App.vue'

// 样式分层（顺序不可颠倒）：
//  1. theme-values.css —— 唯一色值源，浅色在 :root、深色在 :root.dark
//  2. tokens.css       —— 尺度体系 + 由色值 color-mix 派生的语义层
//  3. global.css       —— html/body 底线样式与全局滚动条
import './styles/theme-values.css'
import './styles/tokens.css'
import './styles/global.css'

import { initTheme } from './theme'

// 必须在样式导入**之后**、mount **之前**调用：
// initTheme 要从 CSS 变量读实际色值，样式没落定会读到上一套主题的值。
initTheme()

createApp(App).mount('#app')
