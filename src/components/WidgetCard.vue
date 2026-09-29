<template>
  <div
    class="widget-card"
    :class="{ tile: !!tile }"
    :style="tile ? { background: tile } : undefined"
    @click="$emit('open')"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <span v-if="tile" class="wc-mark"><slot name="mark" /></span>

    <!-- 3D 翻转载体:启用翻转时正面/背面绝对定位,未启用时保持原布局 -->
    <div class="wc-flip" :class="{ flipped: flipping }">
      <div class="wc-face wc-front">
        <header class="wc-header">
          <span class="wc-icon" :style="{ background: iconBg }">
            <slot name="icon" />
          </span>
          <span class="wc-title">{{ title }}</span>
          <span v-if="badge" class="wc-badge">{{ badge }}</span>
          <span class="wc-arrow"><ChevronRightIcon /></span>
        </header>

        <div class="wc-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="wc-footer">
          <slot name="footer" />
        </footer>
      </div>

      <div v-if="flip" class="wc-face wc-back" aria-hidden="true">
        <slot name="back" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronRightIcon } from './icons'

const props = defineProps<{
  title: string
  /** 头部计数徽标文案,空串不显示 */
  badge?: string
  /** 图标块背景(渐变) */
  iconBg?: string
  /** 磁贴模式:传入背景(CSS 渐变/图)后,卡片变为 Win8 磁贴风格(白字 + 大水印) */
  tile?: string
  /** 启用"实时磁贴"翻转(需配合 #back 插槽);数据为空时传 false 停用 */
  flip?: boolean
  /** 翻转间隔(毫秒) */
  flipInterval?: number
}>()

defineEmits<{ (e: 'open'): void }>()

// === 实时磁贴:定时翻到背面展示统计,悬停时暂停并复位 ===
const flipping = ref(false)
const hovering = ref(false)
let flipTimer: ReturnType<typeof setInterval> | null = null
let unflipTimer: ReturnType<typeof setTimeout> | null = null

function stopFlipTimers() {
  if (flipTimer) {
    clearInterval(flipTimer)
    flipTimer = null
  }
  if (unflipTimer) {
    clearTimeout(unflipTimer)
    unflipTimer = null
  }
}

function startFlip() {
  if (!props.flip || flipTimer) return
  flipTimer = setInterval(() => {
    // 页面不可见或用户悬停时不翻
    if (document.hidden || hovering.value) return
    flipping.value = true
    unflipTimer = setTimeout(() => (flipping.value = false), 3800)
  }, props.flipInterval ?? 9000)
}

watch(
  () => props.flip,
  (v) => {
    if (v) startFlip()
    else {
      stopFlipTimers()
      flipping.value = false
    }
  }
)

watch(hovering, (v) => {
  // 悬停时立即复位到正面,保证可交互
  if (v) {
    if (unflipTimer) clearTimeout(unflipTimer)
    flipping.value = false
  }
})

onMounted(() => {
  if (props.flip) startFlip()
})

onUnmounted(stopFlipTimers)
</script>

<style scoped>
/* === 统一小组件卡片骨架(待办/记事本共用,对标 iTab 质感) === */
.widget-card {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  border-radius: var(--tile-radius);
  background: var(--bg-glass-strong);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border: 1px solid var(--border-color);
  box-shadow: var(--tile-shadow);
  overflow: hidden;
  transition: 0.28s var(--ease);
  user-select: none;
}

/* === 3D 翻转(实时磁贴) === */
.wc-flip {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.7s var(--ease);
}

.wc-flip.flipped {
  transform: rotateY(180deg);
}

.wc-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.wc-back {
  transform: rotateY(180deg);
  align-items: center;
  justify-content: center;
  gap: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .wc-flip {
    transition: none;
  }
}

/* === Win8 磁贴模式:彩色渐变底,白色文字体系 === */
/* 注意:不覆盖 --accent(磁贴背景渐变要引用主题色),白色前景走专用变量 */
.widget-card.tile {
  border-color: rgba(255, 255, 255, 0.18);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  --tile-fg: #ffffff;
  --tile-fg-soft: rgba(255, 255, 255, 0.72);
  --tile-hover: rgba(255, 255, 255, 0.14);
  --text-primary: var(--tile-fg);
  --text-secondary: rgba(255, 255, 255, 0.88);
  --text-muted: rgba(255, 255, 255, 0.72);
  --border-color: rgba(255, 255, 255, 0.22);
  --border-strong: rgba(255, 255, 255, 0.5);
}

.widget-card.tile .wc-badge {
  color: var(--tile-fg);
  background: rgba(255, 255, 255, 0.2);
}

.widget-card.tile .wc-arrow {
  color: var(--tile-fg);
}

/* 大图标水印(磁贴右下角) */
.wc-mark {
  position: absolute;
  right: -8px;
  bottom: -12px;
  width: 104px;
  height: 104px;
  color: #ffffff;
  opacity: 0.16;
  transform: rotate(-8deg);
  pointer-events: none;
  line-height: 0;
  z-index: 2;
}

.wc-mark :deep(svg) {
  width: 100%;
  height: 100%;
}

.widget-card:hover {
  transform: translateY(var(--tile-lift));
  border-color: var(--border-strong);
  box-shadow: var(--tile-shadow-hover);
}

.widget-card:active {
  transform: var(--tile-press);
  transition-duration: 0.1s;
}

/* 头部:图标块 + 标题 + 徽标 + 悬浮箭头 */
.wc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.wc-icon {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}

.wc-icon :deep(svg) {
  width: 17px;
  height: 17px;
}

.wc-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.wc-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-variant-numeric: tabular-nums;
}

.wc-arrow {
  margin-left: auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-5px);
  transition: 0.22s var(--ease);
}

.widget-card:hover .wc-arrow {
  opacity: 1;
  transform: translateX(0);
}

.wc-arrow :deep(svg) {
  width: 13px;
  height: 13px;
}

/* 内容区 */
.wc-body {
  flex: 1;
  min-height: 0;
  padding: 2px 16px 8px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  overflow: hidden;
}

/* 底部区(进度条等) */
.wc-footer {
  flex-shrink: 0;
  padding: 0 16px 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
