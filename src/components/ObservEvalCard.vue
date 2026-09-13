<template>
  <section class="panel">
    <header class="panel-head">
      <h3 class="panel-title"><AppIcon name="shield" :size="12" />链路评估</h3>
      <span class="badge" :class="compliance">{{ COMPLIANCE_LABEL[compliance] }}</span>
    </header>

    <p v-if="!evaluation" class="state">选择一条链路后显示其评估结果</p>

    <template v-else>
      <div class="metric-grid">
        <div v-for="m in metrics" :key="m.key" class="metric">
          <div class="metric-head">
            <span class="metric-label">{{ m.label }}</span>
            <AppIcon :name="m.icon" :size="11" :style="{ color: m.color }" />
          </div>
          <div class="metric-value" :style="{ color: m.color }">{{ m.value }}</div>
          <div class="metric-bar">
            <span :style="{ width: `${m.ratio * 100}%`, background: m.color }" />
          </div>
          <p class="metric-foot">{{ m.foot }}</p>
        </div>
      </div>

      <div class="violations">
        <h4 class="v-title">
          违规项
          <span class="v-count" :class="{ zero: !evaluation.violations.length }">
            {{ evaluation.violations.length }}
          </span>
        </h4>
        <p v-if="!evaluation.violations.length" class="state small">未发现违规，链路各项指标均在规则阈值内</p>
        <ul v-else class="v-list">
          <li v-for="(v, i) in evaluation.violations" :key="i" class="v-item" :class="v.severity">
            <span class="v-sev">{{ SEV_LABEL[v.severity] }}</span>
            <div class="v-body">
              <span class="v-rule">{{ v.rule }}</span>
              <span class="v-detail">{{ v.detail }}</span>
            </div>
          </li>
        </ul>
      </div>

      <p class="source-note">
        <AppIcon name="info" :size="11" />
        以上指标按链路事实规则化计算（成功步骤占比 / 工具与模型调用成功率 / 耗时阈值），
        非后端评分字段、非模型评判。
      </p>
    </template>
  </section>
</template>

<script setup>
/**
 * 链路评估卡。
 *
 * ⚠️ 重要：后端**没有** evaluation 接口，这里的「工具成功率 / 输出相关性 / 合规性」
 * 全部由 `evaluateTrace` 按链路事实规则化计算（成功步骤占比、工具与模型调用
 * 成功率、耗时阈值）。组件底部固定渲染一行来源说明，避免被误读成 LLM 评分。
 *
 * 三个指标都配进度条：0-1 的分值光看数字不容易建立直觉，
 * 条长一眼就能看出"哪一项拖了后腿"。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { fmtScore, fmtPct } from '@/composables/observFormat'

const props = defineProps({
  /** evaluateTrace 的返回：{ toolRate, relevance, compliance, violations, toolTotal } */
  evaluation: { type: Object, default: null },
})

const COMPLIANCE_LABEL = { passed: '合规通过', warning: '存在告警', failed: '不合规' }
const SEV_LABEL = { high: '高', medium: '中', low: '低' }

const compliance = computed(() => props.evaluation?.compliance || 'passed')

const metrics = computed(() => {
  const e = props.evaluation
  if (!e) return []
  return [
    {
      key: 'relevance',
      label: '输出相关性',
      icon: 'sparkle',
      value: fmtScore(e.relevance),
      ratio: e.relevance,
      color: e.relevance >= 0.85 ? 'var(--pass)' : e.relevance >= 0.6 ? 'var(--running)' : 'var(--fail)',
      foot: '成功步骤占比 ×0.6 + 模型成功率 ×0.4',
    },
    {
      key: 'tool',
      label: '工具调用成功率',
      icon: 'wrench',
      value: e.toolTotal ? fmtPct(e.toolRate * 100, 1) : '无调用',
      ratio: e.toolTotal ? e.toolRate : 0,
      color: e.toolRate >= 0.99 ? 'var(--pass)' : e.toolRate >= 0.8 ? 'var(--running)' : 'var(--fail)',
      foot: e.toolTotal ? `共 ${e.toolTotal} 次工具调用` : '本次链路未触发工具',
    },
    {
      key: 'compliance',
      label: '合规评分',
      icon: 'shield',
      value: compliance.value === 'passed' ? '1.00' : compliance.value === 'warning' ? '0.60' : '0.00',
      ratio: compliance.value === 'passed' ? 1 : compliance.value === 'warning' ? 0.6 : 0,
      color:
        compliance.value === 'passed'
          ? 'var(--pass)'
          : compliance.value === 'warning'
            ? 'var(--running)'
            : 'var(--fail)',
      foot: `按 ${e.violations.length} 项违规判定`,
    },
  ]
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
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid;
}
.badge.passed { color: var(--pass); border-color: color-mix(in srgb, var(--pass) 45%, transparent); background: color-mix(in srgb, var(--pass) 12%, transparent); }
.badge.warning { color: var(--running); border-color: color-mix(in srgb, var(--running) 45%, transparent); background: color-mix(in srgb, var(--running) 12%, transparent); }
.badge.failed { color: var(--fail); border-color: color-mix(in srgb, var(--fail) 45%, transparent); background: color-mix(in srgb, var(--fail) 12%, transparent); }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--line);
  border-bottom: 1px solid var(--line);
}
.metric { background: var(--bg-card); padding: 10px 12px; }
.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 5px;
}
.metric-label { font-size: 11px; color: var(--text-sub); }
.metric-value { font-size: 19px; font-weight: 500; line-height: 1.1; font-variant-numeric: tabular-nums; }
.metric-bar {
  margin-top: 7px;
  height: 3px;
  border-radius: 2px;
  background: var(--bg-sunken);
  overflow: hidden;
}
.metric-bar span { display: block; height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.metric-foot { margin: 6px 0 0; font-size: 10.5px; color: var(--text-faint); line-height: 1.4; }

.violations { padding: 10px 14px 4px; }
.v-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-main);
}
.v-count {
  font-size: 10px;
  padding: 0 6px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--fail) 16%, transparent);
  color: var(--fail);
}
.v-count.zero { background: color-mix(in srgb, var(--pass) 16%, transparent); color: var(--pass); }
.v-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.v-item {
  display: flex;
  gap: 8px;
  padding: 6px 9px;
  border-radius: 6px;
  border-left: 2px solid;
  background: var(--bg-sunken);
}
.v-item.high { border-color: var(--fail); }
.v-item.medium { border-color: var(--running); }
.v-item.low { border-color: var(--primary); }
.v-sev {
  flex: 0 0 auto;
  font-size: 10px;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  background: var(--bg-card);
}
.v-item.high .v-sev { color: var(--fail); }
.v-item.medium .v-sev { color: var(--running); }
.v-item.low .v-sev { color: var(--primary); }
.v-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.v-rule { font-size: 11.5px; color: var(--text-main); }
.v-detail { font-size: 11px; color: var(--text-sub); line-height: 1.45; }

.source-note {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 6px 14px 12px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-faint);
}

.state {
  margin: 0;
  padding: 28px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
.state.small { padding: 12px 0; text-align: left; font-size: 11px; }
</style>
