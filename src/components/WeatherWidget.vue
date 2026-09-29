<template>
  <div class="wx-widget" @click="$emit('open')">
    <template v-if="info">
      <div class="wx-top">
        <span class="wx-city">{{ info.city }}</span>
        <span class="wx-text">{{ info.current.text }}</span>
      </div>
      <div class="wx-mid">
        <span class="wx-emoji">{{ emoji }}</span>
        <span class="wx-temp">{{ info.current.temp }}°</span>
      </div>
      <div class="wx-bottom">
        <span>体感 {{ info.current.feels }}°</span>
        <span v-if="todayRange" class="wx-range">{{ todayRange }}</span>
      </div>
    </template>
    <div v-else-if="loading" class="wx-skeleton" aria-hidden="true">
      <span class="wx-sk-line w40"></span>
      <span class="wx-sk-big"></span>
      <span class="wx-sk-line w60"></span>
    </div>
    <div v-else class="wx-error">
      <span class="wx-city">{{ city }}</span>
      <span class="wx-err-text">天气暂时拉取不到</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api, WEATHER_EMOJI, type WeatherInfo } from '@/api'
import { useUI } from '@/composables/useUI'

defineEmits<{ (e: 'open'): void }>()

const { ui, loadUI } = useUI()
const city = computed(() => ui.weatherCity || '北京')

const info = ref<WeatherInfo | null>(null)
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const emoji = computed(() => WEATHER_EMOJI[info.value?.current.icon || ''] || '☁️')
const todayRange = computed(() => {
  const d0 = info.value?.daily?.[0]
  if (!d0) return ''
  return `${d0.min}° / ${d0.max}°`
})

async function refresh() {
  loading.value = !info.value
  try {
    info.value = await api.getWeather(city.value)
  } catch {
    // 失败保留旧数据;无数据时显示错误态
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadUI()
    .then(() => refresh())
    .catch(() => {})
  // 30 分钟自动刷新(与后端缓存 TTL 一致)
  refreshTimer = setInterval(() => {
    if (!document.hidden) refresh()
  }, 1_800_000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.wx-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 20px;
  background: linear-gradient(150deg, #6aa5f8 0%, #4a90e2 45%, #3a7bd5 100%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 24px rgba(58, 123, 213, 0.25);
  transition: 0.28s var(--ease);
  user-select: none;
  overflow: hidden;
}

.wx-widget:hover {
  transform: translateY(-4px);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.05),
    0 16px 40px rgba(58, 123, 213, 0.35);
}

.wx-widget:active {
  transform: translateY(-1px) scale(0.98);
  transition-duration: 0.1s;
}

.wx-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.wx-city {
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wx-text {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
}

.wx-mid {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wx-emoji {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
}

.wx-temp {
  font-size: 30px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}

.wx-bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.72);
  font-variant-numeric: tabular-nums;
}

.wx-range {
  white-space: nowrap;
}

/* 加载骨架屏 */
.wx-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

@keyframes wxShimmer {
  from {
    background-position: -160px 0;
  }
  to {
    background-position: 160px 0;
  }
}

.wx-sk-line,
.wx-sk-big {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.12) 25%, rgba(255, 255, 255, 0.26) 40%, rgba(255, 255, 255, 0.12) 55%);
  background-size: 320px 100%;
  animation: wxShimmer 1.1s linear infinite;
}

.wx-sk-big {
  height: 30px;
  width: 60%;
}

.w40 {
  width: 40%;
}

.w60 {
  width: 60%;
}

/* 错误态 */
.wx-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.wx-err-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}
</style>
