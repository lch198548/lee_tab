<template>
  <WidgetCard
    title="汇率"
    :badge="dateText"
    tile="linear-gradient(150deg, #4cc3b0 0%, #1ba99a 45%, #0b7d74 100%)"
    icon-bg="rgba(255,255,255,0.22)"
    :flip="ratesLoaded"
    @open="$emit('open')"
  >
    <template #mark><ExchangeIcon /></template>
    <template #icon><ExchangeIcon /></template>

    <!-- 正面:1 [单位外币] 兑 人民币 -->
    <div v-if="ratesLoaded" class="rw-list">
      <div v-for="c in mainCurrencies" :key="c.ccy" class="rw-row" :title="rowTitle(c)">
        <span class="rw-name">{{ c.name }}</span>
        <span class="rw-ccy">{{ c.unit > 1 ? `${c.unit} ${c.ccy}` : c.ccy }}</span>
        <span class="rw-val">{{ fmtCny(c) }}</span>
      </div>
    </div>
    <div v-else-if="loading" class="rw-empty">正在获取汇率…</div>
    <div v-else class="rw-empty">
      <p class="rw-empty-title">汇率暂时拉取不到</p>
      <p class="rw-empty-sub">稍后会自动重试</p>
    </div>

    <template #footer>
      <span class="rw-time">{{ dateText }}</span>
      <span class="rw-refresh">点击换算</span>
    </template>

    <!-- 背面:1 人民币 兑 外币 -->
    <template #back>
      <div v-for="c in mainCurrencies" :key="c.ccy" class="rw-back-row">
        <span class="rw-back-label">{{ c.name }}</span>
        <span class="rw-back-val">{{ fmtForeign(c) }}</span>
      </div>
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import WidgetCard from './WidgetCard.vue'
import { ExchangeIcon } from './icons'
import { api, RATE_CURRENCIES, type RateCurrencyMeta, type RateInfo } from '@/api'

defineEmits<{ (e: 'open'): void }>()

// 磁贴正面展示的 4 个主流币种
const MAIN = ['USD', 'EUR', 'JPY', 'HKD']
const mainCurrencies = RATE_CURRENCIES.filter((c) => MAIN.includes(c.ccy))

const info = ref<RateInfo | null>(null)
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const ratesLoaded = computed(() => !!info.value)
const dateText = computed(() => (info.value ? `${info.value.date} 更新` : '等待更新…'))

function rateOf(ccy: string): number {
  const v = info.value?.rates?.[ccy]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : NaN
}

// unit 单位外币 -> 人民币
function fmtCny(c: RateCurrencyMeta): string {
  const r = rateOf(c.ccy)
  if (!Number.isFinite(r)) return '—'
  const v = c.unit / r
  return v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v.toFixed(4)
}

// 1 人民币 -> 外币
function fmtForeign(c: RateCurrencyMeta): string {
  const r = rateOf(c.ccy)
  if (!Number.isFinite(r)) return '—'
  const v = r
  return v >= 100 ? v.toFixed(2) : v.toFixed(4)
}

function rowTitle(c: RateCurrencyMeta): string {
  const r = rateOf(c.ccy)
  if (!Number.isFinite(r)) return c.name
  return `${c.unit} ${c.name}(${c.ccy}) = ${fmtCny(c)} 人民币 · 1 人民币 = ${r.toFixed(4)} ${c.ccy}`
}

async function refresh() {
  loading.value = !info.value
  try {
    info.value = await api.getRates()
  } catch {
    // 失败保留旧数据;汇率变化慢,15 分钟后随定时器重试
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refresh()
  // 汇率每日更新,15 分钟轻量轮询兜底
  refreshTimer = setInterval(() => {
    if (!document.hidden) refresh()
  }, 900_000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
/* 汇率列表 */
.rw-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
}

.rw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 31px;
  padding: 0 2px;
  border-radius: 8px;
  flex-shrink: 0;
}

.rw-name {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.95);
  flex-shrink: 0;
}

.rw-ccy {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
}

.rw-val {
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* 空态 */
.rw-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.rw-empty-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.rw-empty-sub {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.6);
}

/* 底部 */
.rw-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.rw-refresh {
  margin-left: auto;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

/* 背面(1 人民币兑外币) */
.rw-back-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.rw-back-label {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.65);
  width: 56px;
  text-align: right;
}

.rw-back-val {
  font-size: 14.5px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
</style>
