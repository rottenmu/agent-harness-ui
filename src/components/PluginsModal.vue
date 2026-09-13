<template>
  <!-- ============================================================
       插件模块清单（Plugins）
       插件是 Maven 模块 / 前端源码级模块，不是后端数据实体，
       没有增删端点 —— 本弹窗是**只读清单**，明确标注数据来源，
       不做点不动的假增删按钮。
       ============================================================ -->
  <n-modal v-model:show="show" :auto-focus="false" esc-close mask-closable transform-origin="center">
    <div class="plug-card" role="dialog" aria-label="插件模块清单">
      <header class="plug-head">
        <span class="plug-title">Plugins · 插件模块</span>
        <button class="plug-close" type="button" aria-label="关闭" @click="show = false">
          <AppIcon name="close" :size="13" />
        </button>
      </header>

      <div class="plug-body">
        <section class="plug-block">
          <h3 class="plug-sub">后端模块（modules/）</h3>
          <ul class="plug-list">
            <li v-for="m in BACKEND_PLUGINS" :key="m.name" class="plug-item">
              <span class="plug-name">{{ m.name }}</span>
              <span class="plug-desc">{{ m.desc }}</span>
            </li>
          </ul>
        </section>

        <section class="plug-block">
          <h3 class="plug-sub">前端插件（frontend/modules/）</h3>
          <ul class="plug-list">
            <li v-for="m in FRONTEND_PLUGINS" :key="m.name" class="plug-item">
              <span class="plug-name">{{ m.name }}</span>
              <span class="plug-desc">{{ m.desc }}</span>
            </li>
          </ul>
        </section>

        <p class="plug-note">
          清单为构建期静态数据（随仓库模块目录维护）；插件的启停由后端
          <code>*-autoconfig</code> 装配与主壳菜单路由决定，运行时不可在此增删。
        </p>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
/**
 * 插件清单弹窗
 *
 * 为什么不做 CRUD：后端插件以 Maven 模块形态参与编译装配（PluginRegister 声明身份、
 * *-autoconfig 完成装配），前端插件由主壳按菜单路由加载 —— 两者都不是「一条数据」，
 * 用表单增删只会制造假交互。清单来自仓库目录的静态快照，随模块目录演进同步维护。
 */
import { NModal } from 'naive-ui'
import AppIcon from './AppIcon.vue'

const show = defineModel('show', { type: Boolean, default: false })

/** 后端业务插件（modules/ 下的一级 Maven 模块） */
const BACKEND_PLUGINS = [
  { name: 'agent-harness', desc: '智能体运行时（会话/资源管理 API，:9900 的主要业务）' },
  { name: 'agent-memory', desc: '智能体四层记忆 L0~L3 + OLAP 分析' },
  { name: 'agent-trace', desc: '调用轨迹记录与查询' },
  { name: 'agent-rag', desc: '检索增强（知识库检索链路）' },
  { name: 'agent-intent', desc: '意图识别' },
  { name: 'agent-auth', desc: '鉴权扩展' },
  { name: 'agent-datasource', desc: '动态数据源接入' },
  { name: 'module-sys', desc: '系统管理（用户/角色/权限）' },
  { name: 'module-security', desc: '安全策略' },
  { name: 'module-tools', desc: '工具集' },
  { name: 'module-feishu', desc: '飞书集成' },
]

/** 前端源码级插件（frontend/modules/ 下，主壳按菜单加载） */
const FRONTEND_PLUGINS = [
  { name: 'ai', desc: 'AI 能力插件（资源管理弹窗所属能力域）' },
  { name: 'agentmemory', desc: '智能体记忆控制台' },
  { name: 'agent-trace-ui', desc: '轨迹可视化' },
  { name: 'workflow', desc: '工作流编排' },
  { name: 'datasource', desc: '数据源管理' },
  { name: 'rag', desc: '知识库 / 检索' },
  { name: 'tools', desc: '工具集' },
  { name: 'feishu', desc: '飞书集成' },
]
</script>

<style scoped>
.plug-card {
  width: 560px;
  max-width: calc(100vw - 48px);
  max-height: 640px;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-pop, 0 12px 40px rgba(0, 0, 0, 0.18));
  overflow: hidden;
}

.plug-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-light);
}
.plug-title { font-size: var(--text-md); font-weight: var(--font-medium); }
.plug-close {
  display: inline-flex;
  padding: var(--space-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}
.plug-close:hover { background: var(--overlay-hover); color: var(--text-main); }

.plug-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--space-3) var(--space-4); }
.plug-block + .plug-block { margin-top: var(--space-3); }
.plug-sub {
  margin: 0 0 var(--space-1-5);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-faint);
  letter-spacing: var(--tracking-wide);
}

.plug-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
}
.plug-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-1-5) var(--space-2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card, transparent);
  min-width: 0;
}
.plug-name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-main);
}
.plug-desc {
  font-size: var(--text-xs);
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plug-note {
  margin: var(--space-3) 0 0;
  font-size: var(--text-xs);
  color: var(--text-faint);
  line-height: 1.6;
}
.plug-note code {
  font-family: var(--font-mono);
  padding: 0 2px;
  border-radius: var(--radius-xs);
  background: var(--overlay-active);
}
</style>
