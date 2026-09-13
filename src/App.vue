<template>
  <!-- ============================================================
       Agent Harness · 应用根组件
       只做两件事：提供全局 Provider（主题 / 消息），以及渲染外壳 AppShell。
       分离原因：useMessage() 必须在 n-message-provider 内部的组件里调用，
                 若二者同处一个组件，setup 执行时 provider 尚未渲染，会拿到 undefined。
       ============================================================ -->
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <AppShell />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import AppShell from '@/components/AppShell.vue'
import { useTheme } from '@/theme'

// 主题对象与覆写色值都来自 theme.js（其值由 CSS 变量读出，不在此重复定义字面量）
const { naiveTheme, themeOverrides } = useTheme()
</script>
