<template>
  <Teleport to="body">
    <div class="fm-mask" @click.self="$emit('close')">
      <div class="fm-panel modal-skin">
        <header class="fm-header">
          <h3>基金管理</h3>
          <button class="fm-close" @click="$emit('close')"><CloseIcon /></button>
        </header>

        <div class="fm-body">
          <div class="fm-add">
            <input
              v-model="draft"
              class="fm-input"
              maxlength="6"
              inputmode="numeric"
              placeholder="输入 6 位基金代码,如 161725"
              @keydown.enter="onAdd"
              @keydown.esc.stop="$emit('close')"
            />
            <button class="fm-add-btn" :disabled="!valid" @click="onAdd"><PlusIcon /> 添加</button>
          </div>

          <div v-if="codes.length" class="fm-list">
            <div v-for="c in codes" :key="c" class="fm-row">
              <span class="fm-code">{{ c }}</span>
              <span class="fm-name" :title="quoteOf(c)?.name">{{ quoteOf(c)?.name || '获取中…' }}</span>
              <span class="fm-src" :class="{ degrade: quoteOf(c)?.src === 'top10' }" :title="srcTitle(quoteOf(c))">{{ srcLabel(quoteOf(c)) }}</span>
              <span class="fm-pct" :class="pctClass(quoteOf(c))">{{ quoteOf(c) ? fmtPct(quoteOf(c)!.est) : '' }}</span>
              <button class="fm-del" title="移除" @click="onRemove(c)"><TrashIcon /></button>
            </div>
          </div>
          <div v-else class="fm-empty">还没有自选基金,输入代码添加第一只</div>

          <p class="fm-hint">估值基于基金最新公示持仓与个股实时行情穿透估算(官方盘中估值已按监管下线),结果 60s 刷新;仅供参考,不构成投资建议</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CloseIcon, PlusIcon, TrashIcon } from './icons'
import { api, type FundQuote } from '@/api'
import { useUI } from '@/composables/useUI'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { ui, setFundCodes } = useUI()
const { dialog, confirm: dialogConfirm } = useDialog()

const codes = computed<string[]>(() => (ui.fundCodes || []).filter(Boolean))
const draft = ref('')
const quotes = ref<FundQuote[]>([])

const valid = computed(() => /^\d{6}$/.test(draft.value))

function quoteOf(code: string) {
  return quotes.value.find((f) => f.code === code)
}

function pctClass(q?: FundQuote) {
  if (!q) return 'flat'
  return q.est > 0 ? 'up' : q.est < 0 ? 'down' : 'flat'
}
function fmtPct(v: number) {
  const n = Number.isFinite(v) ? v : 0
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}
// 估值来源徽标:f10 全量持仓为正常;top10 表示已降级到季报前十大(精度差)
function srcLabel(q?: FundQuote) {
  if (!q || q.err) return '—'
  if (q.src === 'f10') return `${q.holds ?? ''}只·${q.quarter || '全量'}`
  return '前十大'
}
function srcTitle(q?: FundQuote) {
  if (!q) return ''
  if (q.src === 'f10') return `基于${q.quarter || '最新'}全量公示持仓穿透估算,参与估算 ${q.holds ?? 0} 只股票,覆盖 ${q.coverage}% 净值`
  return '已降级:全量持仓获取失败,仅用季报前十大重仓股估算,精度较低'
}

async function refresh() {
  if (codes.value.length === 0) {
    quotes.value = []
    return
  }
  try {
    const res = await api.getFunds(codes.value)
    const map = new Map(res.funds.map((f) => [f.code, f]))
    quotes.value = codes.value.map((c) => map.get(c)).filter((f): f is FundQuote => !!f)
  } catch {
    /* 保留旧数据 */
  }
}

async function onAdd() {
  const code = draft.value.trim()
  if (!/^\d{6}$/.test(code)) return
  if (codes.value.includes(code)) {
    ;(window as any).$toast?.('该基金已在列表中', 'error')
    return
  }
  setFundCodes([...codes.value, code])
  draft.value = ''
  refresh()
}

async function onRemove(code: string) {
  const q = quoteOf(code)
  const ok = await dialogConfirm({
    title: '移除基金',
    message: `移除「${q?.name || code}」?`,
    confirmText: '移除',
    danger: true
  })
  if (!ok) return
  setFundCodes(codes.value.filter((c) => c !== code))
  quotes.value = quotes.value.filter((f) => f.code !== code)
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
.fm-mask {
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
  animation: fmFade 0.18s var(--ease);
}

@keyframes fmFade {
  from {
    opacity: 0;
  }
}

.fm-panel {
  width: 460px;
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
  animation: fmPop 0.22s var(--ease);
}

@keyframes fmPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}

.fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.fm-header h3 {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.fm-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: 0.15s;
}

.fm-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.fm-close svg {
  width: 14px;
  height: 14px;
}

.fm-body {
  padding: 14px 18px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fm-add {
  display: flex;
  gap: 8px;
}

.fm-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  font-variant-numeric: tabular-nums;
}

.fm-input:focus {
  border-color: var(--accent);
}

.fm-input::placeholder {
  color: var(--text-muted);
}

.fm-add-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  transition: 0.15s;
}

.fm-add-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.fm-add-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fm-add-btn svg {
  width: 13px;
  height: 13px;
}

.fm-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.fm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  transition: background 0.15s;
}

.fm-row + .fm-row {
  border-top: 1px solid var(--border-color);
}

.fm-row:hover {
  background: var(--bg-card);
}

.fm-code {
  font-size: 12.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.fm-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fm-pct {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* 估值来源徽标 */
.fm-src {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  white-space: nowrap;
}

.fm-src.degrade {
  background: color-mix(in srgb, #e67e22 15%, transparent);
  color: #d35400;
}

.fm-pct.up {
  color: var(--danger, #e02f2f);
}

.fm-pct.down {
  color: #0a9d58;
}

.fm-pct.flat {
  color: var(--text-secondary);
}

.fm-del {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0;
  flex-shrink: 0;
  transition: 0.15s;
}

.fm-row:hover .fm-del {
  opacity: 1;
}

.fm-del:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.fm-del svg {
  width: 13px;
  height: 13px;
}

.fm-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
}

.fm-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
