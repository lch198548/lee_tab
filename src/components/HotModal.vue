<template>
  <Teleport to="body">
    <div class="hm-mask" @click.self="$emit('close')">
      <div class="hm-panel modal-skin">
        <header class="hm-header">
          <h3>热榜聚合</h3>
          <button class="hm-close" @click="$emit('close')"><CloseIcon /></button>
        </header>

        <div class="hm-tabs">
          <button
            v-for="s in HOT_SOURCES"
            :key="s.id"
            class="hm-tab"
            :class="{ active: s.id === active }"
            @click="switchSource(s.id)"
          >
            {{ s.name }}
          </button>
        </div>

        <div class="hm-body">
          <!-- 加载骨架屏 -->
          <div v-if="loading" class="hm-skeleton" aria-hidden="true">
            <div v-for="(w, n) in SK_W" :key="n" class="hm-sk-row">
              <span class="hm-sk-rank"></span>
              <span class="hm-sk-title" :style="{ width: w + '%' }"></span>
              <span class="hm-sk-hot"></span>
            </div>
          </div>
          <div v-else-if="items.length" class="hm-list">
            <a
              v-for="(it, i) in items"
              :key="i"
              class="hm-row"
              :href="it.url"
              target="_blank"
              rel="noopener noreferrer"
              :title="it.title"
            >
              <span class="hm-rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="hm-title">{{ it.title }}</span>
              <span v-if="fmtHot(it.hot)" class="hm-hot">{{ fmtHot(it.hot) }}</span>
            </a>
          </div>
          <div v-else class="hm-empty">{{ errMsg || '暂无数据' }}</div>
        </div>

        <footer class="hm-footer">
          <span>{{ updatedText }}</span>
          <span>点击条目在新标签页打开</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CloseIcon } from './icons'
import { api, HOT_SOURCES, type HotItem } from '@/api'
import { useUI } from '@/composables/useUI'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { ui, setHotSource } = useUI()
const { dialog } = useDialog()

const active = ref<string>(ui.hotSource || HOT_SOURCES[0].id)
const items = ref<HotItem[]>([])
const loading = ref(false)
const errMsg = ref('')
const updated = ref('')

// 骨架屏行宽(%,伪随机但固定,避免每次渲染跳动)
const SK_W = [82, 64, 91, 73, 56, 88, 69, 47]

// 客户端按源缓存:切换回看过的源立即显示(后台仍静默刷新)
const cache = new Map<string, { items: HotItem[]; updated: string }>()

// 热度格式化:12345 -> "1.2万";过小不显示
function fmtHot(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return ''
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}亿`
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

const updatedText = computed(() => {
  if (!updated.value) return ''
  const d = new Date(updated.value)
  if (Number.isNaN(d.getTime())) return ''
  return `更新于 ${d.toTimeString().slice(0, 5)}`
})

async function refresh() {
  errMsg.value = ''
  // 命中缓存立即渲染,无缓存才显示骨架屏(避免切源时旧列表挂着像没反应)
  const cached = cache.get(active.value)
  if (cached) {
    items.value = cached.items
    updated.value = cached.updated
    loading.value = false
  } else {
    items.value = []
    updated.value = ''
    loading.value = true
  }
  try {
    const res = await api.getHot(active.value)
    items.value = res.items || []
    updated.value = res.updated || ''
    cache.set(active.value, { items: items.value, updated: updated.value })
  } catch (e) {
    // 失败:有缓存保留缓存,无缓存才提示错误
    if (!cached) {
      items.value = []
      errMsg.value = e instanceof Error ? e.message : '获取失败'
    }
  } finally {
    loading.value = false
  }
}

function switchSource(id: string) {
  if (id === active.value) return
  active.value = id
  // 切换即记住为磁贴默认源
  setHotSource(id)
}

watch(active, refresh)

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
.hm-mask {
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
  animation: hmFade 0.18s var(--ease);
}

@keyframes hmFade {
  from {
    opacity: 0;
  }
}

.hm-panel {
  width: 520px;
  max-width: 100%;
  height: 72vh;
  max-height: 720px;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--bg-modal, #ffffff);
  box-shadow:
    0 0 0 0.5px rgba(17, 17, 17, 0.06),
    0 24px 70px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: hmPop 0.22s var(--ease);
}

@keyframes hmPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}

.hm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.hm-header h3 {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.hm-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: 0.15s;
}

.hm-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.hm-close svg {
  width: 14px;
  height: 14px;
}

/* 源切换 tabs */
.hm-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 18px 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.hm-tab {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: 0.15s;
}

.hm-tab:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.hm-tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 500;
}

.hm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 10px 6px;
}

.hm-list {
  display: flex;
  flex-direction: column;
}

.hm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  text-decoration: none;
  transition: background 0.15s;
}

.hm-row:hover {
  background: var(--bg-card);
}

.hm-rank {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-card);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.hm-rank.top {
  color: #fff;
  background: var(--accent);
}

.hm-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hm-hot {
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.hm-empty {
  padding: 60px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

/* 加载骨架屏(shimmer) */
.hm-skeleton {
  display: flex;
  flex-direction: column;
}

.hm-sk-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
}

@keyframes hmShimmer {
  from {
    background-position: -160px 0;
  }
  to {
    background-position: 160px 0;
  }
}

.hm-sk-rank,
.hm-sk-title,
.hm-sk-hot {
  height: 20px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--border-color) 40%, var(--bg-card) 55%);
  background-size: 320px 100%;
  animation: hmShimmer 1.1s linear infinite;
  flex-shrink: 0;
}

.hm-sk-rank {
  width: 20px;
}

.hm-sk-title {
  flex-shrink: 1;
}

.hm-sk-hot {
  width: 42px;
  margin-left: auto;
}

.hm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px 14px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
</style>
