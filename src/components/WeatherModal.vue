<template>
  <Teleport to="body">
    <div class="wm-mask" @click.self="$emit('close')">
      <div class="wm-panel">
        <div class="wm-body">
          <!-- 城市切换 -->
          <div class="wm-city-bar">
            <input
              v-model="cityInput"
              class="wm-city-input"
              placeholder="切换城市,如 上海 / 杭州 / Guangzhou"
              spellcheck="false"
              @keydown.enter="changeCity"
            />
            <button class="wm-city-btn" :disabled="switching" @click="changeCity">
              {{ switching ? '查询中…' : '切换' }}
            </button>
          </div>
          <p v-if="errMsg" class="wm-err">{{ errMsg }}</p>

          <template v-if="info">
            <!-- 英雄区 -->
            <div class="wm-hero">
              <div class="wm-hero-city">
                {{ info.city }}<span v-if="info.admin" class="wm-hero-admin">{{ info.admin }}</span>
              </div>
              <div class="wm-hero-date">{{ heroDate }}</div>
              <div class="wm-hero-temp">{{ info.current.temp }}<span>°C</span></div>
              <div class="wm-hero-cond">
                <span class="wm-hero-emoji">{{ emoji }}</span>
                {{ info.current.text }} · 体感 {{ info.current.feels }}°C
              </div>
              <div v-if="info.daily[0]" class="wm-hero-hl">
                最高 {{ info.daily[0].max }}° · 最低 {{ info.daily[0].min }}°
              </div>
            </div>

            <!-- 今日详情六格 -->
            <div class="wm-metrics">
              <div class="wm-metric">
                <span class="wm-m-label">日出</span>
                <span class="wm-m-val">{{ sunTime(info.daily[0]?.sunrise) }}</span>
              </div>
              <div class="wm-metric">
                <span class="wm-m-label">日落</span>
                <span class="wm-m-val">{{ sunTime(info.daily[0]?.sunset) }}</span>
              </div>
              <div class="wm-metric">
                <span class="wm-m-label">气压</span>
                <span class="wm-m-val">{{ info.current.pressure ?? '—' }}<i>hPa</i></span>
              </div>
              <div class="wm-metric">
                <span class="wm-m-label">降水</span>
                <span class="wm-m-val">{{ info.current.rain != null ? info.current.rain : '—' }}<i>mm</i></span>
              </div>
              <div class="wm-metric">
                <span class="wm-m-label">紫外线</span>
                <span class="wm-m-val">{{ uvText(info.daily[0]?.uv) }}</span>
              </div>
              <div class="wm-metric">
                <span class="wm-m-label">最大风</span>
                <span class="wm-m-val">{{ info.daily[0]?.windMax != null ? info.daily[0].windMax : '—' }}<i>km/h</i></span>
              </div>
            </div>

            <!-- 24 小时逐时预报 -->
            <div v-if="info.hourly.length" class="wm-hourly">
              <div class="wm-sec-title">24 小时预报</div>
              <div class="wm-h-strip">
                <div v-for="(h, i) in info.hourly" :key="h.time" class="wm-h-card" :class="{ now: i === 0 }">
                  <span class="wm-h-time">{{ hourLabel(h.time, i) }}</span>
                  <span class="wm-h-emoji">{{ h.isDay ? (WEATHER_EMOJI[h.icon] || '☁️') : '🌙' }}</span>
                  <span class="wm-h-temp">{{ h.temp }}°</span>
                  <span class="wm-h-pop">{{ h.pop != null && h.pop > 0 ? '💧' + h.pop + '%' : '' }}</span>
                </div>
              </div>
            </div>

            <!-- 七天预报 -->
            <div class="wm-daily">
              <div class="wm-sec-title">7 天预报</div>
              <div class="wm-list">
                <div v-for="(d, i) in info.daily" :key="d.date" class="wm-row" :class="{ today: i === 0 }">
                  <span class="wm-day">{{ dayLabel(d.date, i) }}</span>
                  <span class="wm-row-emoji">{{ WEATHER_EMOJI[d.icon] || '☁️' }}</span>
                  <span class="wm-row-text">{{ d.text }}</span>
                  <span v-if="d.pop" class="wm-row-pop">💧{{ d.pop }}%</span>
                  <span class="wm-t-min">{{ d.min }}°</span>
                  <span class="wm-t-bar"><i :style="barStyle(d)"></i></span>
                  <span class="wm-t-max">{{ d.max }}°</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 加载骨架屏 -->
          <div v-else-if="loading" class="wm-skeleton" aria-hidden="true">
            <div class="wm-sk-hero"></div>
            <div class="wm-sk-grid">
              <span v-for="n in 6" :key="n" class="wm-sk-cell"></span>
            </div>
            <div v-for="n in 4" :key="n" class="wm-sk-row">
              <span class="wm-sk-line" :style="{ width: 30 + ((n * 13) % 25) + '%' }"></span>
              <span class="wm-sk-short"></span>
            </div>
          </div>

          <div v-else class="wm-empty">{{ errMsg || '暂无数据' }}</div>
        </div>

        <footer class="wm-footer">
          <span>{{ updatedText }}</span>
          <span>数据源 Open-Meteo · 30 分钟缓存</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api, WEATHER_EMOJI, type WeatherInfo, type WeatherDay } from '@/api'
import { useUI } from '@/composables/useUI'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { ui, loadUI, setWeatherCity } = useUI()
const { dialog } = useDialog()

const info = ref<WeatherInfo | null>(null)
const loading = ref(false)
const errMsg = ref('')
const switching = ref(false)
const cityInput = ref('')

const city = computed(() => ui.weatherCity || '北京')
const emoji = computed(() => WEATHER_EMOJI[info.value?.current.icon || ''] || '☁️')

const todayLabel = computed(() => {
  const n = new Date()
  return `${n.getMonth() + 1}月${n.getDate()}日 星期${'日一二三四五六'[n.getDay()]}`
})

const heroDate = computed(() => {
  if (!info.value?.updated) return todayLabel.value
  const d = new Date(info.value.updated)
  if (Number.isNaN(d.getTime())) return todayLabel.value
  return `${todayLabel.value} · 更新于 ${d.toTimeString().slice(0, 5)}`
})

const updatedText = computed(() => {
  if (!info.value?.updated) return ''
  const d = new Date(info.value.updated)
  if (Number.isNaN(d.getTime())) return ''
  return `更新于 ${d.toTimeString().slice(0, 5)}`
})

// 七天温度区间条:全局最低/最高作为标尺
const tempRange = computed(() => {
  const ds = info.value?.daily || []
  if (!ds.length) return null
  return { lo: Math.min(...ds.map((d) => d.min)), hi: Math.max(...ds.map((d) => d.max)) }
})

function barStyle(d: WeatherDay): Record<string, string> {
  const r = tempRange.value
  if (!r || r.hi === r.lo) return { left: '0%', width: '100%' }
  const left = ((d.min - r.lo) / (r.hi - r.lo)) * 100
  const width = Math.max(8, ((d.max - d.min) / (r.hi - r.lo)) * 100)
  return { left: left + '%', width: width + '%' }
}

function dayLabel(date: string, i: number): string {
  const dt = new Date(date + 'T12:00:00')
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
  if (Number.isNaN(dt.getTime())) return md
  const w = `周${'日一二三四五六'[dt.getDay()]}`
  return i === 0 ? `今天 ${md}` : `${w} ${md}`
}

// 日出/日落 ISO '2026-09-29T06:12' -> '06:12'
function sunTime(iso?: string): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : '—'
}

// 紫外线指数 -> 中文等级
function uvText(uv?: number | null): string {
  if (uv == null) return '—'
  if (uv <= 2) return `${uv} 弱`
  if (uv <= 5) return `${uv} 中`
  if (uv <= 7) return `${uv} 强`
  if (uv <= 10) return `${uv} 很强`
  return `${uv} 极强`
}

// 逐时标签:第一格"现在",其后取小时
function hourLabel(time: string, i: number): string {
  if (i === 0) return '现在'
  return time.length >= 13 ? time.slice(11, 13) + '时' : time
}

async function refresh() {
  loading.value = true
  errMsg.value = ''
  try {
    info.value = await api.getWeather(city.value)
  } catch (e) {
    info.value = null
    errMsg.value = e instanceof Error ? e.message : '获取失败'
  } finally {
    loading.value = false
  }
}

async function changeCity() {
  const c = cityInput.value.trim()
  if (!c || switching.value) return
  switching.value = true
  errMsg.value = ''
  try {
    const res = await api.getWeather(c)
    info.value = res
    setWeatherCity(res.city || c)
    cityInput.value = ''
  } catch (e) {
    errMsg.value = e instanceof Error ? e.message : '查询失败'
  } finally {
    switching.value = false
  }
}

function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (dialog.open) return
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onEscKey)
  loadUI()
    .then(() => refresh())
    .catch(() => {})
})
onUnmounted(() => window.removeEventListener('keydown', onEscKey))
</script>

<style scoped>
.wm-mask {
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
  animation: wmFade 0.18s var(--ease);
}

@keyframes wmFade {
  from {
    opacity: 0;
  }
}

/* 高级灰面板:石墨渐变 */
.wm-panel {
  position: relative;
  width: 1000px;
  max-width: 94vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  background:
    radial-gradient(90% 60% at 85% -10%, rgba(255, 255, 255, 0.07) 0%, transparent 50%),
    radial-gradient(70% 50% at 0% 100%, rgba(0, 0, 0, 0.3) 0%, transparent 60%),
    linear-gradient(168deg, #43464e 0%, #31333a 48%, #232529 100%);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.14),
    0 30px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: wmPop 0.22s var(--ease);
  color: #fff;
}

@keyframes wmPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}

.wm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 12px;
}

.wm-body::-webkit-scrollbar {
  width: 6px;
}

.wm-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.28);
  border-radius: 3px;
}

/* 城市切换 */
.wm-city-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.wm-city-input {
  flex: 1;
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: background 0.15s;
}

.wm-city-input:focus {
  background: rgba(255, 255, 255, 0.14);
}

.wm-city-input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.wm-city-btn {
  height: 34px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  transition: background 0.15s;
  white-space: nowrap;
}

.wm-city-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.wm-city-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.wm-err {
  margin-bottom: 8px;
  font-size: 12px;
  color: #eba7a7;
}

/* === 英雄区 === */
.wm-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 0 18px;
}

.wm-hero-city {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
}

.wm-hero-admin {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);
}

.wm-hero-date {
  margin-top: 3px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.75);
  font-variant-numeric: tabular-nums;
}

.wm-hero-temp {
  margin-top: 2px;
  font-size: 84px;
  font-weight: 200;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
  letter-spacing: -3px;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.3);
}

.wm-hero-temp span {
  font-size: 34px;
  font-weight: 300;
  letter-spacing: 0;
  color: rgba(255, 255, 255, 0.85);
  vertical-align: 26px;
  margin-left: 2px;
}

.wm-hero-cond {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.92);
}

.wm-hero-emoji {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
}

.wm-hero-hl {
  margin-top: 5px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
  font-variant-numeric: tabular-nums;
}

/* === 分区标题 === */
.wm-sec-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 7px;
}

/* === 详情六格 === */
.wm-metrics {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.wm-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding: 12px 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.13);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.wm-m-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  white-space: nowrap;
}

.wm-m-val {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.wm-m-val i {
  font-style: normal;
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 2px;
}

/* === 24 小时逐时预报 === */
.wm-hourly {
  margin-bottom: 14px;
}

.wm-h-strip {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 5px;
}

.wm-h-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 2px 7px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.12);
  min-width: 0;
}

.wm-h-card.now {
  background: rgba(255, 255, 255, 0.17);
  border-color: rgba(255, 255, 255, 0.28);
}

.wm-h-time {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

.wm-h-emoji {
  font-size: 16px;
  line-height: 1.2;
}

.wm-h-temp {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.wm-h-pop {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.55);
  min-height: 11px;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* === 7 天预报 === */
.wm-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  column-gap: 10px;
}

.wm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid transparent;
  transition: background 0.15s;
}

.wm-row:hover {
  background: rgba(255, 255, 255, 0.13);
}

.wm-row.today {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.24);
}

.wm-day {
  width: 72px;
  font-size: 12.5px;
  font-weight: 500;
  color: #fff;
  flex-shrink: 0;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.wm-row-emoji {
  font-size: 17px;
  line-height: 1;
  flex-shrink: 0;
}

.wm-row-text {
  flex: 1;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wm-row-pop {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.wm-t-min,
.wm-t-max {
  width: 30px;
  text-align: right;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.wm-t-min {
  color: rgba(255, 255, 255, 0.65);
}

.wm-t-max {
  color: #fff;
  font-weight: 600;
  text-align: left;
}

.wm-t-bar {
  position: relative;
  flex: 1;
  min-width: 46px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.13);
  overflow: hidden;
}

.wm-t-bar i {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  background: linear-gradient(90deg, #777c86 0%, #e8eaee 100%);
}

/* === 骨架屏 / 空态 === */
.wm-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

@keyframes wmShimmer {
  from {
    background-position: -160px 0;
  }
  to {
    background-position: 160px 0;
  }
}

.wm-sk-hero {
  height: 180px;
  border-radius: 16px;
}

.wm-sk-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.wm-sk-cell {
  height: 62px;
  border-radius: 14px;
}

.wm-sk-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
}

.wm-sk-hero,
.wm-sk-cell,
.wm-sk-line,
.wm-sk-short {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 25%, rgba(255, 255, 255, 0.22) 40%, rgba(255, 255, 255, 0.1) 55%);
  background-size: 320px 100%;
  animation: wmShimmer 1.1s linear infinite;
}

.wm-sk-line,
.wm-sk-short {
  height: 14px;
  border-radius: 6px;
}

.wm-sk-short {
  width: 60px;
  margin-left: auto;
}

.wm-empty {
  padding: 48px 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

.wm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 13px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 窄屏降级 */
@media (max-width: 900px) {
  .wm-panel {
    width: 96vw;
  }

  .wm-metrics {
    grid-template-columns: repeat(3, 1fr);
  }

  .wm-list {
    grid-template-columns: 1fr;
  }
}
</style>
