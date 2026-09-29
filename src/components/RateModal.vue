<template>
  <Teleport to="body">
    <div class="rm-mask" @click.self="$emit('close')">
      <div class="rm-panel modal-skin">
        <header class="rm-header">
          <h3>汇率换算</h3>
          <button class="rm-close" @click="$emit('close')"><CloseIcon /></button>
        </header>

        <div class="rm-body">
          <!-- 换算器 -->
          <div class="rm-converter">
            <div class="rm-side">
              <input
                v-model="amountStr"
                class="rm-amount"
                inputmode="decimal"
                placeholder="输入金额"
                @keydown.esc.stop="$emit('close')"
              />
              <select v-model="fromCcy" class="rm-select">
                <option v-for="c in currencyOptions" :key="c" :value="c">{{ ccyLabel(c) }}</option>
              </select>
            </div>

            <button class="rm-swap" title="交换币种" @click="swap"><ExchangeIcon /></button>

            <div class="rm-side">
              <div class="rm-result" :title="resultText">{{ resultText }}</div>
              <select v-model="toCcy" class="rm-select">
                <option v-for="c in currencyOptions" :key="c" :value="c">{{ ccyLabel(c) }}</option>
              </select>
            </div>
          </div>

          <p class="rm-rate-line" v-if="crossRateText">{{ crossRateText }}</p>

          <!-- 常用币种对人民币汇率表 -->
          <div class="rm-table">
            <div class="rm-table-title">常用币种 · 兑人民币</div>
            <div class="rm-grid">
              <div v-for="c in tableCurrencies" :key="c.ccy" class="rm-cell" :title="cellTitle(c)">
                <span class="rm-cell-name">{{ c.name }}</span>
                <span class="rm-cell-ccy">{{ c.unit > 1 ? `${c.unit} ${c.ccy}` : c.ccy }}</span>
                <span class="rm-cell-val">{{ fmtCny(c) }}</span>
              </div>
            </div>
          </div>

          <p class="rm-hint">汇率以人民币为基准,数据每日更新(来源 open.er-api.com / 欧洲央行);仅供参考,实际交易以银行牌价为准</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CloseIcon, ExchangeIcon } from './icons'
import { api, RATE_CURRENCIES, type RateCurrencyMeta, type RateInfo } from '@/api'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { dialog } = useDialog()

const info = ref<RateInfo | null>(null)
const amountStr = ref('100')
const fromCcy = ref('USD')
const toCcy = ref('CNY')

const tableCurrencies = RATE_CURRENCIES.filter((c) => c.ccy !== 'CNY')

// 换算器可选币种 = 内置元数据 + 上游返回的其它币种
const currencyOptions = computed<string[]>(() => {
  const set = new Set(RATE_CURRENCIES.map((c) => c.ccy))
  for (const k of Object.keys(info.value?.rates || {})) {
    if (/^[A-Z]{3}$/.test(k)) set.add(k)
  }
  return [...set]
})

function rateOf(ccy: string): number {
  const v = info.value?.rates?.[ccy]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : NaN
}

function ccyLabel(ccy: string): string {
  const meta = RATE_CURRENCIES.find((c) => c.ccy === ccy)
  return meta ? `${ccy} · ${meta.name}` : ccy
}

const amount = computed(() => {
  const n = parseFloat(amountStr.value.replace(/[,，\s]/g, ''))
  return Number.isFinite(n) ? n : 0
})

// 跨币种汇率:1 from = x to(通过 CNY 中转)
const crossRate = computed(() => {
  const f = rateOf(fromCcy.value)
  const t = rateOf(toCcy.value)
  if (!Number.isFinite(f) || !Number.isFinite(t)) return NaN
  return t / f
})

const resultText = computed(() => {
  if (!Number.isFinite(crossRate.value)) return '—'
  const v = amount.value * crossRate.value
  return v >= 1000 ? v.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : v >= 1 ? v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : v.toFixed(6)
})

const crossRateText = computed(() => {
  if (!Number.isFinite(crossRate.value)) return ''
  return `1 ${fromCcy.value} = ${crossRate.value < 0.01 ? crossRate.value.toFixed(6) : crossRate.value.toFixed(4)} ${toCcy.value}`
})

function swap() {
  const f = fromCcy.value
  fromCcy.value = toCcy.value
  toCcy.value = f
}

// 汇率表:unit 单位外币 -> 人民币
function fmtCny(c: RateCurrencyMeta): string {
  const r = rateOf(c.ccy)
  if (!Number.isFinite(r)) return '—'
  const v = c.unit / r
  return v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v.toFixed(4)
}

function cellTitle(c: RateCurrencyMeta): string {
  const r = rateOf(c.ccy)
  if (!Number.isFinite(r)) return c.name
  return `${c.unit} ${c.name}(${c.ccy}) = ${fmtCny(c)} 人民币 · 1 人民币 = ${r.toFixed(4)} ${c.ccy}`
}

async function refresh() {
  try {
    info.value = await api.getRates()
  } catch {
    /* 磁贴已兜底提示,弹窗内显示 — */
  }
}

// ESC 关闭(应用内对话框打开时交给对话框处理)
function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (dialog.open) return
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onEscKey)
  refresh()
})
onUnmounted(() => window.removeEventListener('keydown', onEscKey))
</script>

<style scoped>
.rm-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: rmFade 0.18s var(--ease);
}

@keyframes rmFade {
  from {
    opacity: 0;
  }
}

.rm-panel {
  width: 480px;
  max-width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--bg-modal, #ffffff);
  box-shadow:
    0 0 0 0.5px rgba(17, 17, 17, 0.06),
    0 24px 70px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: rmPop 0.22s var(--ease);
}

@keyframes rmPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}

.rm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.rm-header h3 {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.rm-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: 0.15s;
}

.rm-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.rm-close svg {
  width: 14px;
  height: 14px;
}

.rm-body {
  padding: 16px 18px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 换算器 */
.rm-converter {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.rm-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rm-amount {
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 500;
  outline: none;
  transition: border-color 0.15s;
  font-variant-numeric: tabular-nums;
}

.rm-amount:focus {
  border-color: var(--accent);
}

.rm-result {
  height: 42px;
  line-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rm-select {
  height: 34px;
  padding: 0 8px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
  cursor: pointer;
}

.rm-swap {
  align-self: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: 0.15s;
}

.rm-swap:hover {
  color: var(--accent);
  border-color: var(--accent);
  transform: rotate(180deg);
}

.rm-swap svg {
  width: 14px;
  height: 14px;
}

.rm-rate-line {
  text-align: center;
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 汇率表 */
.rm-table {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
}

.rm-table-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.rm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 14px;
}

.rm-cell {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 2px;
}

.rm-cell-name {
  font-size: 12.5px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.rm-cell-ccy {
  font-size: 10.5px;
  color: var(--text-muted);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}

.rm-cell-val {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rm-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
