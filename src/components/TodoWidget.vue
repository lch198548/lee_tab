<template>
  <WidgetCard
    title="待办"
    :badge="totalTodos > 0 ? `${doneTodos.length}/${totalTodos}` : ''"
    tile="linear-gradient(150deg, color-mix(in srgb, var(--accent) 85%, #ffffff) 0%, var(--accent) 45%, color-mix(in srgb, var(--accent) 58%, #0b1220) 100%)"
    icon-bg="rgba(255,255,255,0.22)"
    :flip="totalTodos > 0"
    @open="$emit('open')"
  >
    <template #mark><ClipboardIcon /></template>
    <template #icon><ClipboardIcon /></template>

    <template #back>
      <span class="tw-back-num">{{ doneTodos.length }}<em>/{{ totalTodos }}</em></span>
      <span class="tw-back-label">已完成 · 还剩 {{ activeTodos.length }} 项</span>
      <span v-if="activeTodos[0]" class="tw-back-next">下一项:{{ activeTodos[0].text }}</span>
    </template>

    <template v-if="totalTodos > 0">
      <div
        class="tw-item"
        v-for="t in previewTodos"
        :key="t.id"
        :class="{ done: t.done }"
        @click.stop="onToggle(t.id)"
      >
        <span class="tw-check" :class="{ on: t.done }"><CheckIcon /></span>
        <span class="tw-text">{{ t.text }}</span>
        <span class="tw-star" v-if="t.important"><StarFilledIcon /></span>
      </div>
      <div class="tw-item" v-if="totalTodos > 3">
        <span class="tw-check phantom"></span>
        <span class="tw-text muted">还有 {{ totalTodos - 3 }} 项...</span>
      </div>
    </template>

    <div v-else class="tw-empty">
      <span class="tw-empty-ring"><ClipboardIcon /></span>
      <p>今天想完成什么?</p>
    </div>

    <template #footer>
      <template v-if="totalTodos > 0">
        <div class="tw-progress">
          <span class="tw-progress-bar" :style="{ width: progressPercent + '%' }"></span>
        </div>
        <span class="tw-progress-text">完成 {{ progressPercent }}%</span>
      </template>
      <span v-else class="tw-progress-text solo">点击卡片添加待办</span>
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WidgetCard from './WidgetCard.vue'
import { ClipboardIcon, CheckIcon, StarFilledIcon } from './icons'
import { useTodos } from '@/composables/useTodos'

defineEmits<{ (e: 'open'): void }>()

const { activeTodos, doneTodos, toggleTodo } = useTodos()

const totalTodos = computed(() => activeTodos.value.length + doneTodos.value.length)
const progressPercent = computed(() =>
  totalTodos.value === 0 ? 0 : Math.round((doneTodos.value.length / totalTodos.value) * 100)
)

const previewTodos = computed(() => activeTodos.value.slice(0, 3))

async function onToggle(id: string) {
  try {
    await toggleTodo(id)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}
</script>

<style scoped>
/* 磁贴背面(实时翻转展示) */
.tw-back-num {
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.tw-back-num em {
  font-style: normal;
  font-size: 20px;
  opacity: 0.65;
}

.tw-back-label {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
}

.tw-back-next {
  max-width: 88%;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 待办行 */
.tw-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 4px 8px;
  margin: 0 -8px;
  border-radius: 9px;
  transition: background 0.15s;
}

.tw-item:hover {
  background: rgba(255, 255, 255, 0.14);
}

.tw-check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: 0.18s var(--ease);
  color: transparent;
}

.tw-check svg {
  width: 9px;
  height: 9px;
  stroke-width: 3;
}

.tw-item:hover .tw-check {
  border-color: #ffffff;
}

.tw-check.on {
  background: #ffffff;
  border-color: #ffffff;
  color: var(--accent);
}

.tw-check.phantom {
  border-color: transparent;
}

.tw-text {
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: 0.15s;
}

.tw-text.muted {
  color: var(--text-muted);
}

.tw-item.done .tw-text {
  color: var(--text-muted);
  text-decoration: line-through;
}

.tw-star {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--warning);
  display: flex;
}

.tw-star svg {
  width: 11px;
  height: 11px;
}

/* 底部进度 */
.tw-progress {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  overflow: hidden;
}

.tw-progress-bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ffffff, rgba(255, 255, 255, 0.75));
  transition: width 0.45s var(--ease);
}

.tw-progress-text {
  font-size: 10.5px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.tw-progress-text.solo {
  width: 100%;
  text-align: center;
}

/* 空态 */
.tw-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  padding-bottom: 6px;
}

.tw-empty-ring {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0.55;
  border: 1.5px dashed color-mix(in srgb, var(--text-muted) 45%, transparent);
}

.tw-empty-ring svg {
  width: 18px;
  height: 18px;
}

.tw-empty p {
  font-size: 12px;
}
</style>
