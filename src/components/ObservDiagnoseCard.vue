<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="bug" :size="12" />异常分析</h3>
      <span v-if="diagnosis" class="badge">
        <AppIcon name="warn" :size="10" />{{ diagnosis.failedCount }} 个失败步骤
      </span>
    </header>

    <p v-if="!diagnosis" class="state">该链路没有失败步骤，无需异常分析</p>

    <template v-else>
      <p class="dx-root">{{ diagnosis.root }}</p>

      <div class="dx-sec">
        <h4 class="dx-h4">证据链</h4>
        <ul class="dx-list">
          <li v-for="(e, i) in diagnosis.evidence" :key="i">{{ e }}</li>
        </ul>
      </div>

      <div class="dx-sec">
        <h4 class="dx-h4">修复建议</h4>
        <ol class="fix-list">
          <li v-for="(f, i) in diagnosis.fixes" :key="i" class="fix-item" :class="f.priority.toLowerCase()">
            <span class="pri">{{ f.priority }}</span>
            <div class="fix-body">
              <span class="fix-title">{{ f.title }}</span>
              <span class="fix-desc">{{ f.desc }}</span>
            </div>
          </li>
        </ol>
      </div>

      <p class="source-note">
        <AppIcon name="info" :size="11" />
        根因与建议由前端规则库按错误文本特征匹配得出，非模型生成；未命中特征时仅给通用指引。
      </p>
    </template>
  </section>
</template>

<script setup>
/**
 * 异常分析卡：呈现 `diagnoseTrace` 的规则库输出。
 *
 * 组件本身不做任何判定——规则集中在 `useObservability` 里，便于后续增补错误特征
 * 而不用改 UI。这里只负责把"根因 / 证据 / 建议"三段的层次讲清楚。
 *
 * 建议按 P0/P1/P2 优先级上色：排查时最需要的是"先做什么"，
 * 而不是读完全部建议再自己排序。
 */
import AppIcon from './AppIcon.vue'

defineProps({
  /** diagnoseTrace 的返回，无失败步骤时为 null */
  diagnosis: { type: Object, default: null },
})
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
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--fail);
  background: color-mix(in srgb, var(--fail) 13%, transparent);
  border-radius: 20px;
  padding: 2px 8px;
}

.dx-root {
  margin: 10px 14px 12px;
  padding: 9px 11px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-sub);
  background: color-mix(in srgb, var(--fail) 8%, transparent);
  border-left: 2px solid var(--fail);
  border-radius: 0 6px 6px 0;
}
.dx-sec { margin: 0 14px 12px; }
.dx-h4 { margin: 0 0 6px; font-size: 11px; font-weight: 500; color: var(--text-faint); }
.dx-list { margin: 0; padding-left: 17px; }
.dx-list li { font-size: 11.5px; color: var(--text-sub); line-height: 1.65; }

.fix-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fix-item {
  display: flex;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  background: var(--bg-sunken);
  border-left: 2px solid;
}
.fix-item.p0 { border-color: var(--fail); }
.fix-item.p1 { border-color: var(--running); }
.fix-item.p2 { border-color: var(--primary); }
.pri {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  height: fit-content;
  background: var(--bg-card);
}
.fix-item.p0 .pri { color: var(--fail); }
.fix-item.p1 .pri { color: var(--running); }
.fix-item.p2 .pri { color: var(--primary); }
.fix-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fix-title { font-size: 11.5px; color: var(--text-main); }
.fix-desc { font-size: 11px; color: var(--text-sub); line-height: 1.5; }

.source-note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0 14px 12px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-faint);
}

.state {
  margin: 0;
  padding: 26px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
