<template>
  <WidgetCard
    title="基金"
    :badge="codes.length > 0 ? `${codes.length} 只` : ''"
    tile="linear-gradient(150deg, #a58bff 0%, #7b5cf0 45%, #5630c4 100%)"
    icon-bg="rgba(255,255,255,0.22)"
    :flip="quotes.length > 1"
    @open="$emit('open')"
  >
    <template #mark><TrendingUpIcon /></template>
    <template #icon><TrendingUpIcon /></template>

    <!-- 正面:估值列表 -->
    <div v-if="quotes.length" class="fw-list">
      <div
        v-for="f in quotes"
        :key="f.code"
        class="fw-row"
        :title="rowTitle(f)"
      >
        <span class="fw-name">{{ f.name }}</span>
        <span class="fw-nav">{{ f.live ? `覆盖 ${f.coverage}%` : '净值涨跌' }}</span>
        <span class="fw-pct" :class="pctClass(f.est)">{{ fmtPct(f.est) }}</span>
      </div>
    </div>
    <div v-else-if="loading" class="fw-empty">正在获取估值…</div>
    <div v-else class="fw-empty">
      <p class="fw-empty-title">还没有自选基金</p>
      <p class="fw-empty-sub">点击磁贴,输入代码添加</p>
    </div>

    <template #footer>
      <span class="fw-time">{{ timeText }}</span>
      <span class="fw-refresh">60s 自动刷新</span>
    </template>

    <!-- 背面:涨跌统计(实时磁贴翻转) -->
    <template #back>
      <div class="fw-back-row">
        <span class="fw-back-label">涨幅最佳</span>
        <span class="fw-back-val up">{{ best ? `${best.name}  ${fmtPct(best.est)}` : '—' }}</span>
      </div>
      <div class="fw-back-row">
        <span class="fw-back-label">跌幅最大</span>
        <span class="fw-back-val down">{{ worst ? `${worst.name}  ${fmtPct(worst.est)}` : '—' }}</span>
      </div>
      <div class="fw-back-row">
        <span class="fw-back-label">平均估算</span>
        <span class="fw-back-val" :class="pctClass(avg)">{{ fmtPct(avg) }}</span>
      </div>
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import WidgetCard from './WidgetCard.vue'
import { TrendingUpIcon } from './icons'
import { api, type FundQuote } from '@/api'
import { useUI } from '@/composables/useUI'

defineEmits<{ (e: 'open'): void }>()

const { ui, loadUI } = useUI()
const codes = computed<string[]>(() => (ui.fundCodes || []).filter(Boolean))

const quotes = ref<FundQuote[]>([])
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// A 股惯例:涨红跌绿
function pctClass(v: number) {
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}
function fmtPct(v: number) {
  const n = Number.isFinite(v) ? v : 0
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}
function rowTitle(f: FundQuote) {
  return `${f.name}(${f.code}) 估算 ${fmtPct(f.est)} · 昨日净值 ${fmtPct(f.navChg)}(${f.navDate})`
}

async function refresh() {
  if (codes.value.length === 0) {
    quotes.value = []
    return
  }
  loading.value = quotes.value.length === 0
  try {
    const res = await api.getFunds(codes.value)
    // 保持用户添加顺序
    const map = new Map(res.funds.map((f) => [f.code, f]))
    quotes.value = codes.value.map((c) => map.get(c)).filter((f): f is FundQuote => !!f)
  } catch {
    // 拉取失败保留旧数据,磁贴不打断
  } finally {
    loading.value = false
  }
}

watch(codes, refresh)
onMounted(() => {
  loadUI().then(refresh).catch(() => {})
  refreshTimer = setInterval(() => {
    if (!document.hidden) refresh()
  }, 60_000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

const timeText = computed(() => {
  const t = quotes.value.find((f) => f.estTime)?.estTime
  return t ? `估算 ${t}` : '等待估算…'
})

const best = computed(() => {
  const valid = quotes.value.filter((f) => !f.err)
  return valid.length ? valid.reduce((a, b) => (b.est > a.est ? b : a)) : null
})
const worst = computed(() => {
  const valid = quotes.value.filter((f) => !f.err)
  return valid.length ? valid.reduce((a, b) => (b.est < a.est ? b : a)) : null
})
const avg = computed(() => {
  const valid = quotes.value.filter((f) => !f.err)
  if (!valid.length) return 0
  return valid.reduce((s, f) => s + f.est, 0) / valid.length
})
</script>

<style scoped>
/* 估值列表 */
.fw-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
}

.fw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 31px;
  padding: 0 2px;
  border-radius: 8px;
  flex-shrink: 0;
}

.fw-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fw-nav {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
}

.fw-pct {
  min-width: 58px;
  text-align: right;
  font-size: 13.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fw-pct.up {
  color: #ffb0b0;
}

.fw-pct.down {
  color: #90e6b8;
}

.fw-pct.flat {
  color: rgba(255, 255, 255, 0.85);
}

/* 空态 */
.fw-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.fw-empty-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.fw-empty-sub {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.6);
}

/* 底部 */
.fw-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.fw-refresh {
  margin-left: auto;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

/* 背面(涨跌统计) */
.fw-back-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.fw-back-label {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.65);
  width: 56px;
  text-align: right;
}

.fw-back-val {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.fw-back-val.up {
  color: #ffb0b0;
}

.fw-back-val.down {
  color: #90e6b8;
}
</style>
