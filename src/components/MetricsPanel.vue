<template>
  <div class="metrics-wrap">
    <div class="metric-card">
      <div class="metric-label">Passed</div>
      <div class="metric-value metric-pass">{{ metrics.passed }}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Failed</div>
      <div class="metric-value metric-fail">{{ metrics.failed }}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total</div>
      <div class="metric-value">{{ metrics.total }}</div>
    </div>

    <div class="metrics-progress">
      <div class="metrics-progress-head">
        <span>通过率</span>
        <span class="metric-rate">{{ passRate }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: passRate + '%' }" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  /** 指标：{ passed, failed, total } */
  metrics: { type: Object, default: () => ({ passed: 0, failed: 0, total: 0 }) },
  /** 通过率（百分比整数） */
  passRate: { type: Number, default: 0 },
})
</script>

<style scoped>
.metrics-wrap { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }

.metric-card {
  flex: 0 0 auto;
  min-width: 104px;
  padding: 8px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}
.metric-label { font-size: 12px; color: var(--text-sub); margin-bottom: 2px; }
.metric-value {
  font-size: 22px;
  font-weight: 500;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.metric-pass { color: var(--pass); }
.metric-fail { color: var(--fail); }

.metrics-progress { flex: 1 1 auto; min-width: 160px; }
.metrics-progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 6px;
}
.metric-rate { color: var(--pass); font-weight: 500; }
.progress-track {
  height: 6px;
  background: var(--bg-page);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--pass);
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>
