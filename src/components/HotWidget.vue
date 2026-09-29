<template>
  <WidgetCard
    title="热榜"
    :badge="sourceName"
    tile="linear-gradient(150deg, #ff9a62 0%, #f4692e 45%, #d84315 100%)"
    icon-bg="rgba(255,255,255,0.22)"
    :flip="headlines.length > 0"
    @open="$emit('open')"
  >
    <template #mark><FlameIcon /></template>
    <template #icon><FlameIcon /></template>

    <!-- 正面:默认源 Top 6 -->
    <div v-if="loading && !items.length" class="hw-skeleton" aria-hidden="true">
      <div v-for="(w, n) in SK_W" :key="n" class="hw-sk-row">
        <span class="hw-sk-rank"></span>
        <span class="hw-sk-title" :style="{ width: w + '%' }"></span>
      </div>
    </div>
    <div v-else-if="items.length" class="hw-list">
      <a
        v-for="(it, i) in items"
        :key="i"
        class="hw-row"
        :href="it.url"
        target="_blank"
        rel="noopener noreferrer"
        :title="it.title"
        @click.stop
      >
        <span class="hw-rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
        <span class="hw-title">{{ it.title }}</span>
      </a>
    </div>
    <div v-else class="hw-empty">
      <p class="hw-empty-title">热榜暂时拉取不到</p>
      <p class="hw-empty-sub">点击磁贴切换数据源</p>
    </div>

    <template #footer>
      <span class="hw-time">{{ timeText }}</span>
      <span class="hw-refresh">点击看完整榜单</span>
    </template>

    <!-- 背面:其他源头条 -->
    <template #back>
      <div v-for="h in headlines" :key="h.label" class="hw-back-row">
        <span class="hw-back-label">{{ h.label }}</span>
        <span class="hw-back-val" :title="h.title">{{ h.title }}</span>
      </div>
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import WidgetCard from './WidgetCard.vue'
import { FlameIcon } from './icons'
import { api, type HotItem, type HotSourceMeta } from '@/api'
import { useUI } from '@/composables/useUI'

defineEmits<{ (e: 'open'): void }>()

const props = defineProps<{ sources: HotSourceMeta[] }>()

const { ui, loadUI } = useUI()
const sourceId = computed(() => ui.hotSource || props.sources[0]?.id || 'weibo')
const sourceName = computed(() => props.sources.find((s) => s.id === sourceId.value)?.name || '热榜')

const items = ref<HotItem[]>([])
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// 骨架屏行宽(%,固定伪随机)
const SK_W = [82, 64, 91, 73, 56, 88]

// 背面:其他源的第 1 条(最多 3 个源)
const headlines = ref<Array<{ label: string; title: string }>>([])

const timeText = computed(() => {
  // updated 为 ISO 字符串,只展示 HH:MM
  if (!items.value.length) return '等待更新…'
  return `${sourceName.value} · 实时`
})

async function refresh() {
  loading.value = items.value.length === 0
  try {
    const res = await api.getHot(sourceId.value)
    items.value = res.items || []
  } catch {
    // 失败保留旧数据
  } finally {
    loading.value = false
  }
}

// 背面异步补齐:拉其他源头条(失败静默)
async function refreshHeadlines() {
  const others = props.sources.filter((s) => s.id !== sourceId.value).slice(0, 3)
  const result: Array<{ label: string; title: string }> = []
  await Promise.all(
    others.map(async (s) => {
      try {
        const res = await api.getHot(s.id)
        const first = (res.items || [])[0]
        if (first) result.push({ label: s.name, title: first.title })
      } catch { /* 单源失败静默 */ }
    })
  )
  headlines.value = result
}

watch(sourceId, () => {
  items.value = []
  refresh()
})

onMounted(() => {
  loadUI()
    .then(() => {
      refresh()
      refreshHeadlines()
    })
    .catch(() => {})
  // 10 分钟自动刷新(与后端缓存 TTL 一致)
  refreshTimer = setInterval(() => {
    if (!document.hidden) {
      refresh()
      refreshHeadlines()
    }
  }, 600_000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
/* 榜单列表 */
.hw-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
}

.hw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 31px;
  padding: 0 2px;
  border-radius: 8px;
  flex-shrink: 0;
  text-decoration: none;
  transition: background 0.15s;
}

.hw-row:hover {
  background: rgba(255, 255, 255, 0.14);
}

.hw-rank {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.hw-rank.top {
  color: #fff;
  background: rgba(255, 255, 255, 0.32);
}

.hw-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 加载骨架屏(白系 shimmer,贴合磁贴渐变底) */
.hw-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hw-sk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 31px;
  padding: 0 2px;
  flex-shrink: 0;
}

@keyframes hwShimmer {
  from {
    background-position: -160px 0;
  }
  to {
    background-position: 160px 0;
  }
}

.hw-sk-rank,
.hw-sk-title {
  height: 18px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 25%, rgba(255, 255, 255, 0.24) 40%, rgba(255, 255, 255, 0.1) 55%);
  background-size: 320px 100%;
  animation: hwShimmer 1.1s linear infinite;
  flex-shrink: 0;
}

.hw-sk-rank {
  width: 18px;
}

.hw-sk-title {
  flex-shrink: 1;
}

/* 空态 */
.hw-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.hw-empty-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.hw-empty-sub {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.6);
}

/* 底部 */
.hw-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.hw-refresh {
  margin-left: auto;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

/* 背面(其他源头条) */
.hw-back-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  max-width: 100%;
}

.hw-back-label {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.65);
  width: 42px;
  text-align: right;
  flex-shrink: 0;
}

.hw-back-val {
  font-size: 13.5px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 210px;
}
</style>
