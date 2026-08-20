<template>
  <div class="color-input">
    <input type="color" class="swatch" :value="parsed.hex" @input="onHex" />
    <input type="range" class="alpha" min="0" max="1" step="0.05" :value="parsed.alpha" @input="onAlpha" />
    <span class="alpha-val">{{ Math.round(parsed.alpha * 100) }}%</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

// 解析颜色值 -> { hex, alpha }
function parseColor(v: string): { hex: string; alpha: number } {
  if (!v) return { hex: '#ffffff', alpha: 1 }
  let m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (m) {
    const r = Math.max(0, Math.min(255, +m[1]))
    const g = Math.max(0, Math.min(255, +m[2]))
    const b = Math.max(0, Math.min(255, +m[3]))
    const a = m[4] !== undefined ? Math.max(0, Math.min(1, +m[4])) : 1
    return { hex: rgbToHex(r, g, b), alpha: a }
  }
  if (/^#[\da-fA-F]{6}$/.test(v)) return { hex: v, alpha: 1 }
  if (/^#[\da-fA-F]{3}$/.test(v)) {
    const h = v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')
    return { hex: '#' + h, alpha: 1 }
  }
  return { hex: '#ffffff', alpha: 1 }
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    '#' +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  )
}

function formatColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const parsed = computed(() => parseColor(props.modelValue))

function onHex(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  emit('update:modelValue', formatColor(hex, parsed.value.alpha))
}

function onAlpha(e: Event) {
  const a = +((e.target as HTMLInputElement).value)
  emit('update:modelValue', formatColor(parsed.value.hex, a))
}
</script>

<style scoped>
.color-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.swatch {
  width: 40px;
  height: 28px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.alpha {
  flex: 1;
  height: 4px;
  padding: 0;
  background: var(--bg-input);
  border-radius: 999px;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  min-width: 0;
}

.alpha::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid #fff;
}

.alpha::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid #fff;
}

.alpha-val {
  width: 38px;
  text-align: right;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
</style>
