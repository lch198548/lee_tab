<template>
  <Transition name="quote" mode="out-in">
    <div v-if="text" :key="seq" class="quote-bar" title="点击换一句" @click="refresh">
      <span class="q-text">「{{ text }}」</span>
      <span v-if="from" class="q-from">—— {{ from }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

// 每日一言(v1.hitokoto.cn 官方支持 CORS,浏览器直取,无需后端)
// 展示类别:动画/漫画/文学/诗词/哲学/影视;点击手动换一条
const text = ref('')
const from = ref('')
const seq = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

async function refresh() {
  try {
    const ctrl = new AbortController()
    timer = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch('https://v1.hitokoto.cn/?c=a&c=b&c=c&c=d&c=i&c=k&max_length=40', {
      signal: ctrl.signal
    })
    if (!r.ok) return
    const d = await r.json()
    if (d && typeof d.hitokoto === 'string' && d.hitokoto) {
      text.value = d.hitokoto
      from.value = d.from || d.from_who || ''
      seq.value++
    }
  } catch {
    // 失败静默:一言只是点缀,不占错误提示位
  } finally {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

onMounted(refresh)
onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.quote-bar {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: baseline;
  gap: 8px;
  max-width: min(72vw, 780px);
  padding: 6px 18px;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  transition: background 0.25s var(--ease);
  white-space: nowrap;
}

.quote-bar:hover {
  background: var(--bg-glass, rgba(0, 0, 0, 0.04));
}

.q-text {
  font-size: 12.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.25s;
}

.quote-bar:hover .q-text {
  color: var(--text-secondary);
}

.q-from {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.7;
  flex-shrink: 0;
}

/* 换一句时的淡入淡出 */
.quote-enter-active,
.quote-leave-active {
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}

.quote-enter-from,
.quote-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

.quote-enter-to,
.quote-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
