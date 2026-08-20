<template>
  <div class="datetime">
    <div class="time">{{ time }}</div>
    <div class="date">
      <span class="date-main">{{ dateMain }}</span>
      <span class="date-sep">·</span>
      <span class="date-week">{{ dateWeek }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const time = ref('')
const dateMain = ref('')
const dateWeek = ref('')

const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function pad(n: number) {
  return n < 10 ? '0' + n : String(n)
}

function update() {
  const d = new Date()
  time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  dateMain.value = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  dateWeek.value = weekNames[d.getDay()]
}

let timer: number | undefined

onMounted(() => {
  update()
  // 每秒更新一次,但对齐到下一个整秒边界以减少抖动
  const now = Date.now()
  const delay = 1000 - (now % 1000)
  timer = window.setTimeout(function tick() {
    update()
    timer = window.setTimeout(tick, 1000)
  }, delay)
})

onUnmounted(() => {
  if (timer) window.clearTimeout(timer)
})
</script>

<style scoped>
.datetime {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--time-color);
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
  user-select: none;
}

.time {
  font-size: var(--time-font-size);
  font-weight: 200;
  line-height: 1;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
  color: var(--time-color);
}

.date {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--date-font-size);
  color: var(--date-color);
  font-weight: 400;
}

.date-sep {
  opacity: 0.5;
}

@media (max-width: 640px) {
  .time {
    font-size: calc(var(--time-font-size) * 0.7);
  }
  .date {
    font-size: calc(var(--date-font-size) * 0.87);
  }
}
</style>
