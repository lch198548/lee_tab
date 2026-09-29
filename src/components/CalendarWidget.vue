<template>
  <div class="cal-widget" @click="$emit('open')">
    <div class="cw-top">
      <span class="cw-month">{{ monthLabel }}</span>
      <span class="cw-week">{{ weekLabel }}</span>
    </div>
    <div class="cw-day">
      {{ todayStr }}
      <span v-if="off !== null" class="cw-offbadge" :class="off ? 'rest' : 'work'">{{ off ? '休' : '班' }}</span>
    </div>
    <div class="cw-lunar" :class="{ fest: special?.type === 'fest', term: special?.type === 'term' }">
      {{ lunarText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { getLunarInfo, lunarShort } from '@/composables/useLunar'

defineEmits<{ (e: 'open'): void }>()

const now = new Date()
const y = now.getFullYear()
const m = now.getMonth() + 1
const d = now.getDate()

const { lunar, special } = getLunarInfo(y, m, d)

// 今天是否法定假日/调休(holiday-cn 数据)
const off = ref<boolean | null>(null)

onMounted(async () => {
  try {
    const res = await api.getHoliday(y)
    const hit = res.days.find((x) => x.date === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    if (hit) off.value = hit.off
  } catch {
    /* 无数据则不显示徽标 */
  }
})

const monthLabel = computed(() => `${m}月`)
const weekLabel = computed(() => `星期${'日一二三四五六'[now.getDay()]}`)
const todayStr = computed(() => String(d))
const lunarText = computed(() => lunarShort(lunar, special))
</script>

<style scoped>
/* 迷你玻璃卡(1x1 格,与书签卡同尺寸;质感对齐 widget-card) */
.cal-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: var(--tile-radius);
  background: var(--bg-glass-strong);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border: 1px solid var(--border-color);
  box-shadow: var(--tile-shadow);
  transition: 0.28s var(--ease);
  user-select: none;
  overflow: hidden;
}

.cal-widget:hover {
  transform: translateY(var(--tile-lift));
  border-color: var(--border-strong);
  box-shadow: var(--tile-shadow-hover);
}

.cal-widget:active {
  transform: var(--tile-press);
  transition-duration: 0.1s;
}

.cw-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.cw-month {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}

.cw-week {
  font-size: 10.5px;
  color: var(--text-muted);
  white-space: nowrap;
}

.cw-day {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.05;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

/* 休/班 小徽标 */
.cw-offbadge {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 2.5px 4.5px;
  border-radius: 5px;
  color: #fff;
  letter-spacing: 0;
  margin-top: 5px;
}

.cw-offbadge.rest { background: #e25c5c; }
.cw-offbadge.work { background: #8a9bb5; }

.cw-lunar {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cw-lunar.fest {
  color: var(--accent);
  font-weight: 600;
}

.cw-lunar.term {
  color: #0e9f8a;
  font-weight: 600;
}
</style>
