<template>
  <div class="group-sidebar glass-strong">
    <button
      class="nav-arrow"
      title="上一个分组"
      :disabled="index <= 0"
      @click="$emit('change', index - 1)"
    >
      <ChevronLeftIcon />
    </button>

    <div class="dots">
      <button
        v-for="(g, i) in groups"
        :key="g.id"
        class="dot"
        :class="{ active: i === index }"
        :title="`${g.name} (${i + 1}/${groups.length})`"
        @click="$emit('change', i)"
      >
        <span class="dot-inner"></span>
        <span class="dot-label">{{ g.name }}</span>
      </button>
    </div>

    <button
      class="nav-arrow"
      title="下一个分组"
      :disabled="index >= groups.length - 1"
      @click="$emit('change', index + 1)"
    >
      <ChevronRightIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import type { Group } from '@/api'

defineProps<{
  groups: Group[]
  index: number
}>()

defineEmits<{
  (e: 'change', index: number): void
}>()
</script>

<style scoped>
.group-sidebar {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  max-height: 70vh;
}

.nav-arrow {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--bg-card);
  flex-shrink: 0;
}

.nav-arrow:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-arrow svg {
  width: 16px;
  height: 16px;
}

.dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  overflow-y: auto;
  max-height: 50vh;
  padding: 4px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.dots::-webkit-scrollbar {
  display: none;
}

.dot {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: var(--transition);
}

.dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: var(--transition);
}

.dot:hover {
  border-color: var(--accent);
}

.dot:hover .dot-inner {
  background: var(--accent);
}

.dot.active {
  border-color: var(--accent);
  width: 14px;
  height: 14px;
}

.dot.active .dot-inner {
  background: var(--accent);
  width: 8px;
  height: 8px;
  box-shadow: 0 0 8px var(--accent);
}

/* 悬浮显示分组名 */
.dot-label {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-glass-strong);
  backdrop-filter: blur(12px);
  color: var(--text-primary);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  border: 1px solid var(--border-color);
}

.dot:hover .dot-label,
.dot.active .dot-label {
  opacity: 1;
}

@media (max-width: 640px) {
  .group-sidebar {
    right: 10px;
    padding: 6px 6px;
    gap: 6px;
  }
  .nav-arrow {
    width: 24px;
    height: 24px;
  }
  .nav-arrow svg {
    width: 13px;
    height: 13px;
  }
  .dot {
    width: 10px;
    height: 10px;
  }
  .dot.active {
    width: 12px;
    height: 12px;
  }
}
</style>
